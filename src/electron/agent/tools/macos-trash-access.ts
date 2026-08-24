import { readdirSync } from "node:fs";
import * as path from "node:path";

export const MACOS_TRASH_ACCESS_DENIED = "MACOS_TRASH_ACCESS_DENIED";

export const MACOS_TRASH_ACCESS_MESSAGE =
  "macOS 已阻止 NeoWorker 访问垃圾箱。NeoWorker 的“完全访问”只控制任务权限，不等同于 macOS 的“完全磁盘访问权限”。请前往“系统设置 → 隐私与安全性 → 完全磁盘访问权限”，为 NeoWorker 开启权限后重新启动应用。权限改变前请不要重复执行；NeoWorker 不会把 .DS_Store 的大小当作垃圾箱总大小。清空垃圾箱属于不可恢复操作，只有在你明确确认后才会执行。";

type ReadTrashOptions = {
  platform?: NodeJS.Platform;
  homeDirectory?: string;
  readDirectory?: (directory: string) => unknown;
};

export type MacOsTrashAccessError = Error & {
  code: typeof MACOS_TRASH_ACCESS_DENIED;
  causeCode?: string;
  retryable: false;
  nonRetryable: true;
  userFacing: true;
};

function normalizeForComparison(value: string): string {
  return path.resolve(value).replace(/\/+$/, "");
}

export function isMacOsTrashPath(
  inputPath: string,
  homeDirectory = process.env.HOME ?? "",
): boolean {
  const resolved = normalizeForComparison(inputPath);

  if (homeDirectory) {
    const personalTrash = normalizeForComparison(path.join(homeDirectory, ".Trash"));
    if (
      resolved === personalTrash ||
      resolved.startsWith(`${personalTrash}${path.sep}`)
    ) {
      return true;
    }
  }

  return resolved.split(path.sep).some((segment) => segment === ".Trashes");
}

/**
 * macOS protects Trash independently from NeoWorker's task permission setting.
 * Probe the Trash root once so callers receive a stable, non-retryable error
 * instead of repeatedly traversing children such as .DS_Store.
 */
export function assertMacOsTrashReadable(
  inputPath: string,
  options: ReadTrashOptions = {},
): void {
  const platform = options.platform ?? process.platform;
  const homeDirectory = options.homeDirectory ?? process.env.HOME ?? "";

  if (platform !== "darwin" || !isMacOsTrashPath(inputPath, homeDirectory)) {
    return;
  }

  const requested = path.resolve(inputPath);
  const homeTrash = homeDirectory
    ? path.resolve(homeDirectory, ".Trash")
    : undefined;
  const probeDirectory =
    homeTrash &&
    (requested === homeTrash || requested.startsWith(`${homeTrash}${path.sep}`))
      ? homeTrash
      : requested;

  try {
    (options.readDirectory ?? readdirSync)(probeDirectory);
  } catch (error) {
    const causeCode = (error as NodeJS.ErrnoException)?.code;
    if (causeCode !== "EPERM" && causeCode !== "EACCES") {
      throw error;
    }

    const result = new Error(MACOS_TRASH_ACCESS_MESSAGE) as MacOsTrashAccessError;
    result.name = "MacOsTrashAccessError";
    result.code = MACOS_TRASH_ACCESS_DENIED;
    result.causeCode = causeCode;
    result.retryable = false;
    result.nonRetryable = true;
    result.userFacing = true;
    throw result;
  }
}
