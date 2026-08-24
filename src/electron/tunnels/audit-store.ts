import * as fs from "fs";
import * as path from "path";
import { getUserDataDir } from "../utils/user-data-dir";
import { createLogger } from "../utils/logger";
import type { SecureMcpTunnelAuditEvent } from "./types";

const logger = createLogger("SecureMcpTunnelAuditStore");
const AUDIT_FILE = "secure-mcp-tunnel-audit.jsonl";
// Cap the live audit log; when exceeded it is rotated to a single `.1` backup,
// bounding on-disk growth to at most ~2x this size under sustained traffic.
const MAX_AUDIT_BYTES = 5 * 1024 * 1024;

export class SecureMcpTunnelAuditStore {
  static append(event: SecureMcpTunnelAuditEvent): void {
    try {
      const filePath = this.getAuditPath();
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      this.rotateIfNeeded(filePath);
      fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`, { mode: 0o600 });
    } catch (error) {
      logger.warn("Failed to persist secure MCP tunnel audit event", error);
    }
  }

  private static rotateIfNeeded(filePath: string): void {
    try {
      const stats = fs.statSync(filePath);
      if (stats.size < MAX_AUDIT_BYTES) return;
      fs.renameSync(filePath, `${filePath}.1`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return;
      logger.warn("Failed to rotate secure MCP tunnel audit log", error);
    }
  }

  static list(tunnelId?: string, limit = 100): SecureMcpTunnelAuditEvent[] {
    const filePath = this.getAuditPath();
    if (!fs.existsSync(filePath)) {
      return [];
    }
    try {
      const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
      const events: SecureMcpTunnelAuditEvent[] = [];
      for (let index = lines.length - 1; index >= 0 && events.length < limit; index -= 1) {
        const parsed = JSON.parse(lines[index]) as SecureMcpTunnelAuditEvent;
        if (!tunnelId || parsed.tunnelId === tunnelId) {
          events.push(parsed);
        }
      }
      return events;
    } catch (error) {
      logger.warn("Failed to read secure MCP tunnel audit events", error);
      return [];
    }
  }

  private static getAuditPath(): string {
    return path.join(getUserDataDir(), "security", AUDIT_FILE);
  }
}
