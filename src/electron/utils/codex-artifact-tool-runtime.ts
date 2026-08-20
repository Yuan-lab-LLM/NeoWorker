import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

export interface CodexArtifactToolRuntime {
  nodeBinary: string;
  nodeRoot: string;
}

export async function resolveCodexArtifactToolRuntime(): Promise<CodexArtifactToolRuntime | null> {
  const nodeRoot = path.join(
    os.homedir(),
    ".cache",
    "codex-runtimes",
    "codex-primary-runtime",
    "dependencies",
    "node",
  );
  const nodeBinary =
    process.platform === "win32"
      ? path.join(nodeRoot, "node.exe")
      : path.join(nodeRoot, "bin", "node");
  const artifactToolPackage = path.join(
    nodeRoot,
    "node_modules",
    "@oai",
    "artifact-tool",
    "package.json",
  );

  try {
    await Promise.all([fs.access(nodeBinary), fs.access(artifactToolPackage)]);
    return { nodeBinary, nodeRoot };
  } catch {
    return null;
  }
}
