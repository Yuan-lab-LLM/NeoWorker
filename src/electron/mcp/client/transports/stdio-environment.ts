import * as os from "node:os";
import * as path from "node:path";

/** Finder-launched apps do not inherit the user's terminal PATH. Keep configured
 * paths first, then add standard CLI installation locations without running a shell. */
export function stdioEnvironment(
  inherited: NodeJS.ProcessEnv,
  configured: Record<string, string> = {},
  platform: NodeJS.Platform = process.platform,
  home: string = os.homedir(),
): NodeJS.ProcessEnv {
  const env = { ...inherited, ...configured };
  if (platform === "win32") return env;
  const extra = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    path.join(home, ".local", "bin"),
    path.join(home, ".volta", "bin"),
    path.join(home, ".npm-global", "bin"),
    path.join(home, ".cargo", "bin"),
  ];
  env.PATH = [...new Set([...(env.PATH || "").split(":").filter(Boolean), ...extra])].join(":");
  return env;
}
