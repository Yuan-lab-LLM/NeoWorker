import { app, BrowserWindow, net } from "electron";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import * as _path from "path";
import * as _fs from "fs";
import { UpdateInfo, UpdateProgress, AppVersionInfo, IPC_CHANNELS } from "../../shared/types";

const execAsync = promisify(exec);

// Keep the API check and electron-updater feed pointed at the same release
// repository.  A mismatch here makes the UI report an update but leaves the
// packaged updater downloading from a different (or non-existent) repo.
export const UPDATE_REPOSITORY_OWNER = "Yuan-lab-LLM";
export const UPDATE_REPOSITORY_NAME = "NeoWorker";

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
}

export class UpdateManager {
  private mainWindow: BrowserWindow | null = null;
  private isUpdating = false;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  private sendProgress(progress: UpdateProgress): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.APP_UPDATE_PROGRESS, progress);
    }
  }

  private sendError(error: string): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.APP_UPDATE_ERROR, { error });
    }
  }

  async getVersionInfo(): Promise<AppVersionInfo> {
    const version = app.getVersion();
    const isDev = !app.isPackaged;
    let isGitRepo = false;
    let isNpmGlobal = false;
    let gitBranch: string | undefined;
    let gitCommit: string | undefined;

    const appPath = app.getAppPath();

    // Check if installed via npm global
    isNpmGlobal = this.detectNpmGlobalInstall(appPath);

    if (isDev && !isNpmGlobal) {
      try {
        const { stdout: branchOut } = await execAsync("git rev-parse --abbrev-ref HEAD", {
          cwd: appPath,
        });
        gitBranch = branchOut.trim();

        const { stdout: commitOut } = await execAsync("git rev-parse --short HEAD", {
          cwd: appPath,
        });
        gitCommit = commitOut.trim();

        isGitRepo = true;
      } catch {
        isGitRepo = false;
      }
    }

    return {
      version,
      isDev,
      isGitRepo,
      isNpmGlobal,
      gitBranch,
      gitCommit,
    };
  }

  private detectNpmGlobalInstall(appPath: string): boolean {
    // Check common npm global installation paths
    const npmGlobalPatterns = [
      "/usr/local/lib/node_modules",
      "/usr/lib/node_modules",
      "/opt/homebrew/lib/node_modules",
      "node_modules/neoworker",
      ".nvm/versions/node",
      ".npm-global",
      "AppData/Roaming/npm/node_modules", // Windows (user-level)
      "Program Files/nodejs/node_modules", // Windows (system-level)
    ];

    const normalizedPath = appPath.replace(/\\/g, "/");
    return npmGlobalPatterns.some((pattern) => normalizedPath.includes(pattern));
  }

  async checkForUpdates(): Promise<UpdateInfo> {
    const versionInfo = await this.getVersionInfo();
    const currentVersion = versionInfo.version;

    this.sendProgress({ phase: "checking", message: "Checking for updates..." });

    try {
      // Fetch latest release from GitHub
      const response = await net.fetch(
        `https://api.github.com/repos/${UPDATE_REPOSITORY_OWNER}/${UPDATE_REPOSITORY_NAME}/releases/latest`,
        {
          headers: {
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "NeoWorker-Updater",
          },
        },
      );

      if (!response.ok) {
        if (response.status === 404) {
          return {
            available: false,
            currentVersion,
            latestVersion: currentVersion,
            updateMode: this.getUpdateMode(versionInfo),
          };
        }
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const release = (await response.json()) as GitHubRelease;
      const latestVersion = release.tag_name.replace(/^v/, "");
      const available = this.isNewerVersion(latestVersion, currentVersion);

      // Determine update mode based on installation type
      const updateMode = this.getUpdateMode(versionInfo);

      if (versionInfo.isGitRepo && !available) {
        // Only check for new commits if versions are equal (not if local version is newer)
        const localIsNewer = this.isNewerVersion(currentVersion, latestVersion);
        if (!localIsNewer) {
          // Check for new commits even if version tag is same
          const hasNewCommits = await this.checkForNewCommits();
          if (hasNewCommits) {
            return {
              available: true,
              currentVersion: `${currentVersion} (${versionInfo.gitCommit})`,
              latestVersion: `${latestVersion} (new commits)`,
              releaseNotes: "New commits available on the main branch.",
              releaseUrl: `https://github.com/${UPDATE_REPOSITORY_OWNER}/${UPDATE_REPOSITORY_NAME}`,
              updateMode: "git",
            };
          }
        }
      }

      return {
        available,
        currentVersion,
        latestVersion,
        releaseNotes: release.body,
        releaseUrl: release.html_url,
        publishedAt: release.published_at,
        updateMode,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.sendError(message);
      throw error;
    }
  }

  private async checkForNewCommits(): Promise<boolean> {
    try {
      const appPath = app.getAppPath();

      // Fetch latest from remote
      await execAsync("git fetch origin", { cwd: appPath });

      // Check if there are commits ahead on remote
      const { stdout } = await execAsync("git rev-list HEAD..origin/main --count", {
        cwd: appPath,
      });
      const commitsAhead = parseInt(stdout.trim(), 10);

      return commitsAhead > 0;
    } catch {
      return false;
    }
  }

  private isNewerVersion(latest: string, current: string): boolean {
    // Normalize versions: convert "0.3.9-1" to "0.3.9.1" for comparison
    const normalizeVersion = (v: string): number[] => {
      // Replace hyphens with dots for consistent parsing
      const normalized = v.replace(/-/g, ".");
      return normalized.split(".").map((n) => parseInt(n, 10) || 0);
    };

    const latestParts = normalizeVersion(latest);
    const currentParts = normalizeVersion(current);

    for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
      const l = latestParts[i] || 0;
      const c = currentParts[i] || 0;
      if (l > c) return true;
      if (l < c) return false;
    }
    return false;
  }

  private getUpdateMode(versionInfo: AppVersionInfo): "git" | "npm" | "electron-updater" {
    if (versionInfo.isNpmGlobal) {
      return "npm";
    }
    if (versionInfo.isGitRepo) {
      return "git";
    }
    return "electron-updater";
  }

  async downloadAndInstallUpdate(updateInfo: UpdateInfo): Promise<void> {
    if (this.isUpdating) {
      throw new Error("Update already in progress");
    }

    this.isUpdating = true;

    try {
      if (updateInfo.updateMode === "npm") {
        await this.npmUpdate();
      } else if (updateInfo.updateMode === "git") {
        await this.gitUpdate();
      } else {
        await this.electronUpdaterUpdate(updateInfo);
      }
    } finally {
      this.isUpdating = false;
    }
  }

  private async gitUpdate(): Promise<void> {
    const appPath = app.getAppPath();

    try {
      // Step 1: Stash any local changes
      this.sendProgress({
        phase: "downloading",
        percent: 10,
        message: "Stashing local changes...",
      });
      try {
        await execAsync("git stash", { cwd: appPath });
      } catch {
        // Ignore if nothing to stash
      }

      // Step 2: Fetch and pull latest
      this.sendProgress({
        phase: "downloading",
        percent: 30,
        message: "Pulling latest changes from GitHub...",
      });
      await execAsync("git fetch origin", { cwd: appPath });
      await execAsync("git pull origin main", { cwd: appPath });

      // Step 3: Install dependencies
      this.sendProgress({
        phase: "installing",
        percent: 50,
        message: "Installing dependencies (npm install)...",
      });
      await this.runNpmInstall(appPath);

      // Step 4: Rebuild
      this.sendProgress({
        phase: "installing",
        percent: 80,
        message: "Building application (npm run build)...",
      });
      await this.runNpmBuild(appPath);

      // Step 5: Complete
      this.sendProgress({
        phase: "complete",
        percent: 100,
        message: "Update complete! Please restart the application.",
      });

      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(IPC_CHANNELS.APP_UPDATE_DOWNLOADED, {
          requiresRestart: true,
          message: "Update complete! Please restart the application to apply changes.",
        });
      }
    } catch (error: Any) {
      this.sendProgress({ phase: "error", message: `Update failed: ${error.message}` });
      this.sendError(error.message);
      throw error;
    }
  }

  private async npmUpdate(): Promise<void> {
    try {
      // Step 1: Run npm update
      this.sendProgress({ phase: "downloading", percent: 20, message: "Updating via npm..." });
      await this.runNpmGlobalUpdate();

      // Step 2: Complete
      this.sendProgress({
        phase: "complete",
        percent: 100,
        message: "Update complete! Please restart the application.",
      });

      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(IPC_CHANNELS.APP_UPDATE_DOWNLOADED, {
          requiresRestart: true,
          message: "Update complete! Please restart the application to apply changes.",
        });
      }
    } catch (error: Any) {
      this.sendProgress({ phase: "error", message: `Update failed: ${error.message}` });
      this.sendError(error.message);
      throw error;
    }
  }

  private runNpmGlobalUpdate(): Promise<void> {
    return new Promise((resolve, reject) => {
      const npm = process.platform === "win32" ? "npm.cmd" : "npm";
      const child = spawn(npm, ["install", "-g", "neoworker@latest"], { shell: true });

      let stderr = "";

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`npm update failed with code ${code}: ${stderr}`));
        }
      });

      child.on("error", reject);
    });
  }

  private runNpmInstall(cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const npm = process.platform === "win32" ? "npm.cmd" : "npm";
      const child = spawn(npm, ["install"], { cwd, shell: true });

      let stderr = "";

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`npm install failed with code ${code}: ${stderr}`));
        }
      });

      child.on("error", reject);
    });
  }

  private runNpmBuild(cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const npm = process.platform === "win32" ? "npm.cmd" : "npm";
      const child = spawn(npm, ["run", "build"], { cwd, shell: true });

      let stderr = "";

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`npm run build failed with code ${code}: ${stderr}`));
        }
      });

      child.on("error", reject);
    });
  }

  private async electronUpdaterUpdate(updateInfo: UpdateInfo): Promise<void> {
    // For packaged apps, use the same published GitHub release that the API
    // check above queried.  Calling downloadUpdate() without first checking
    // the feed leaves electron-updater without a resolved update URL and can
    // make the UI remain at 0% indefinitely.
    let cleanupListeners: (() => void) | undefined;

    try {
      // Dynamic import to avoid issues when running in dev mode
      const electronUpdater = await import("electron-updater").catch(() => null);
      if (!electronUpdater) {
        throw new Error("electron-updater not available");
      }
      const { autoUpdater } = electronUpdater;

      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = false;
      autoUpdater.setFeedURL({
        provider: "github",
        owner: UPDATE_REPOSITORY_OWNER,
        repo: UPDATE_REPOSITORY_NAME,
        releaseType: "release",
      });

      const onCheckingForUpdate = () => {
        this.sendProgress({ phase: "checking", message: "Checking for updates..." });
      };
      const onUpdateAvailable = () => {
        this.sendProgress({
          phase: "downloading",
          percent: 0,
          message: "Update available, starting download...",
        });
      };
      const onDownloadProgress = (progress: {
        percent: number;
        transferred: number;
        total: number;
      }) => {
        this.sendProgress({
          phase: "downloading",
          percent: Math.round(progress.percent),
          message: `Downloading update... ${Math.round(progress.percent)}%`,
          bytesDownloaded: progress.transferred,
          bytesTotal: progress.total,
        });
      };
      const onUpdateDownloaded = () => {
        this.sendProgress({
          phase: "complete",
          percent: 100,
          message: "Update downloaded. Ready to install.",
        });
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send(IPC_CHANNELS.APP_UPDATE_DOWNLOADED, {
            requiresRestart: true,
            message: 'Update downloaded. Click "Install & Restart" to apply.',
          });
        }
      };
      const onError = (error: Error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.sendProgress({ phase: "error", message: `Update error: ${message}` });
        this.sendError(message);
      };

      autoUpdater.on("checking-for-update", onCheckingForUpdate);
      autoUpdater.on("update-available", onUpdateAvailable);
      autoUpdater.on("download-progress", onDownloadProgress);
      autoUpdater.on("update-downloaded", onUpdateDownloaded);
      autoUpdater.on("error", onError);
      cleanupListeners = () => {
        autoUpdater.removeListener("checking-for-update", onCheckingForUpdate);
        autoUpdater.removeListener("update-available", onUpdateAvailable);
        autoUpdater.removeListener("download-progress", onDownloadProgress);
        autoUpdater.removeListener("update-downloaded", onUpdateDownloaded);
        autoUpdater.removeListener("error", onError);
      };

      const result = await autoUpdater.checkForUpdates();
      if (!result?.isUpdateAvailable || !result.updateInfo) {
        throw new Error(
          `The update feed did not return a downloadable release (expected ${updateInfo.latestVersion}).`,
        );
      }

      await autoUpdater.downloadUpdate();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.sendProgress({ phase: "error", message: `Update failed: ${message}` });
      this.sendError(message);
      throw error;
    } finally {
      // The update dialog can be opened repeatedly.  Remove only the
      // listeners installed by this attempt so progress events are not
      // duplicated on subsequent downloads.
      cleanupListeners?.();
    }
  }

  async installUpdateAndRestart(): Promise<void> {
    const versionInfo = await this.getVersionInfo();

    if (versionInfo.isGitRepo) {
      // For git-based updates, just restart the app
      app.relaunch();
      app.exit(0);
    } else {
      // For electron-updater, quit and install
      try {
        const electronUpdater = await import("electron-updater").catch(() => null);
        if (electronUpdater) {
          electronUpdater.autoUpdater.quitAndInstall();
        } else {
          // Fallback: just restart
          app.relaunch();
          app.exit(0);
        }
      } catch {
        // Fallback: just restart
        app.relaunch();
        app.exit(0);
      }
    }
  }
}

export const updateManager = new UpdateManager();
