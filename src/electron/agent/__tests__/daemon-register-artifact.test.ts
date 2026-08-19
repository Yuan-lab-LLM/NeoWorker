import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AgentDaemon } from "../daemon";

const cleanupPaths: string[] = [];
const previousUserDataDir = process.env.NEOWORKER_USER_DATA_DIR;

afterEach(() => {
  if (previousUserDataDir === undefined) {
    delete process.env.NEOWORKER_USER_DATA_DIR;
  } else {
    process.env.NEOWORKER_USER_DATA_DIR = previousUserDataDir;
  }
  for (const cleanupPath of cleanupPaths.splice(0).reverse()) {
    fs.rmSync(cleanupPath, { recursive: true, force: true });
  }
});

describe("AgentDaemon.registerArtifact", () => {
  it("registers a durable copy for a temporary workspace", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "daemon-artifact-test-"));
    cleanupPaths.push(root);
    const workspacePath = path.join(root, "neoworker-temp", "ui-session-abc");
    const sourcePath = path.join(workspacePath, "report.docx");
    const userDataPath = path.join(root, "user-data");
    fs.mkdirSync(workspacePath, { recursive: true });
    fs.writeFileSync(sourcePath, "docx-content");
    process.env.NEOWORKER_USER_DATA_DIR = userDataPath;

    const upsertForTaskPath = vi.fn();
    const daemonLike = {
      taskRepo: {
        findById: vi.fn().mockReturnValue({
          id: "task-1",
          workspaceId: "__temp_workspace__:ui-session-abc",
        }),
      },
      workspaceRepo: {
        findById: vi.fn().mockReturnValue({
          id: "__temp_workspace__:ui-session-abc",
          path: workspacePath,
          isTemp: true,
        }),
      },
      artifactRepo: { upsertForTaskPath },
    } as Any;

    AgentDaemon.prototype.registerArtifact.call(
      daemonLike,
      "task-1",
      sourcePath,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );

    expect(upsertForTaskPath).toHaveBeenCalledTimes(1);
    const registered = upsertForTaskPath.mock.calls[0][0];
    expect(registered.path).not.toBe(sourcePath);
    expect(registered.path).toContain(
      path.join("artifacts", "temporary-workspaces"),
    );
    expect(fs.readFileSync(registered.path, "utf8")).toBe("docx-content");

    fs.rmSync(workspacePath, { recursive: true, force: true });
    expect(fs.readFileSync(registered.path, "utf8")).toBe("docx-content");
  });
});
