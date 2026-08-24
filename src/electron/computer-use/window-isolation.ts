/**
 * WindowIsolation — hides non-approved app windows during CUA sessions.
 *
 * When the CUA starts controlling the desktop, only the approved apps
 * should be visible. All other apps are hidden via AppleScript and
 * restored when the session ends.
 *
 * This is a "best effort" isolation — not a true macOS content filter
 * (no public API for that). It prevents accidental interaction with
 * or screenshots of unrelated apps.
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as os from "os";

const execAsync = promisify(exec);
const TIMEOUT_MS = 10_000;

export interface WindowIsolationOptions {
  /**
   * When false (default for CUA sessions), do not force NeoWorker/Electron to stay visible —
   * the main app window may be hidden separately by the session manager.
   */
  keepHostProcessesVisible?: boolean;
}

export class WindowIsolation {
  private hiddenApps: string[] = [];
  private _active = false;

  get isActive(): boolean {
    return this._active;
  }

  /**
   * Hide all app windows except the approved ones.
   * @param approvedApps — app process names to keep visible (e.g. ["Finder", "Google Chrome"])
   */
  async isolate(approvedApps: string[], options?: WindowIsolationOptions): Promise<void> {
    if (os.platform() !== "darwin") {
      throw new Error("Window isolation is only supported on macOS");
    }
    if (this._active) {
      await this.restore();
    }

    this._active = true;
    const approved = new Set(approvedApps.map((a) => a.toLowerCase()));

    const keepHost = options?.keepHostProcessesVisible !== false;
    if (keepHost) {
      approved.add("neoworker");
      approved.add("electron");
    }

    try {
      // Get all visible application processes
      const { stdout } = await execAsync(
        `osascript -e 'tell application "System Events" to get name of every process whose visible is true'`,
        { timeout: TIMEOUT_MS },
      );

      const visibleApps = stdout
        .trim()
        .split(", ")
        .map((a) => a.trim())
        .filter(Boolean);

      for (const app of visibleApps) {
        if (!approved.has(app.toLowerCase())) {
          try {
            await execAsync(
              `osascript -e 'tell application "System Events" to set visible of process "${app.replace(/"/g, '\\"')}" to false'`,
              { timeout: TIMEOUT_MS },
            );
            this.hiddenApps.push(app);
          } catch {
            // Some system processes cannot be hidden — skip silently
          }
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to isolate windows: ${msg}`);
    }
  }

  /**
   * Restore all previously hidden app windows.
   */
  async restore(): Promise<void> {
    if (!this._active) return;
    this._active = false;

    for (const app of this.hiddenApps) {
      try {
        await execAsync(
          `osascript -e 'tell application "System Events" to set visible of process "${app.replace(/"/g, '\\"')}" to true'`,
          { timeout: TIMEOUT_MS },
        );
      } catch {
        // Best-effort — app may have quit during the session
      }
    }
    this.hiddenApps = [];
  }

  /**
   * Get the list of apps that were hidden.
   */
  getHiddenApps(): string[] {
    return [...this.hiddenApps];
  }
}
