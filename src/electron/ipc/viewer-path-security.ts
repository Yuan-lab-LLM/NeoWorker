import * as fs from "fs/promises";
import * as path from "path";

export function isResolvedPathInsideRoot(targetPath: string, rootPath: string): boolean {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function resolveRealPathWithinWorkspace(
  targetPath: string,
  workspacePath: string,
): Promise<string> {
  const [realWorkspace, realTarget] = await Promise.all([
    fs.realpath(workspacePath),
    fs.realpath(targetPath),
  ]);

  if (!isResolvedPathInsideRoot(realTarget, realWorkspace)) {
    throw new Error("Access denied: file path resolves outside the workspace");
  }

  return realTarget;
}
