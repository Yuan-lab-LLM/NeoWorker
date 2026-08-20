import path from "node:path";

export interface StartupWorkingDirectoryContext {
  isPackaged: boolean;
  cwd: string;
  userDataDir: string;
  platform?: NodeJS.Platform;
}

/**
 * Finder/LaunchServices starts packaged macOS applications with `/` as cwd.
 * Several optional runtimes probe relative paths during bootstrap; allowing
 * those probes to start at the filesystem root can make the first window wait
 * on a system-wide directory scan. Keep intentional/dev working directories,
 * but replace an OS-root cwd with NeoWorker's private user-data directory.
 */
export function resolveSafePackagedWorkingDirectory(
  context: StartupWorkingDirectoryContext,
): string | null {
  if (!context.isPackaged) return null;

  const pathApi = context.platform === "win32" ? path.win32 : path.posix;
  const currentDirectory = pathApi.resolve(context.cwd);
  if (currentDirectory !== pathApi.parse(currentDirectory).root) return null;

  return pathApi.resolve(context.userDataDir);
}
