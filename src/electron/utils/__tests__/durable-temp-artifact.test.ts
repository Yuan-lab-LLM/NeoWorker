import { afterEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  extractWorkspaceUploadPaths,
  persistTaskAttachmentSync,
  persistTempWorkspaceArtifactSync,
  resolveDurableTaskAttachmentRoot,
  resolveDurableTempArtifactPath,
  resolveDurableTempWorkspaceRoot,
  restoreTaskAttachmentSync,
  restoreTempWorkspaceArtifactSync,
} from "../durable-temp-artifact";

const cleanupPaths: string[] = [];

afterEach(() => {
  for (const cleanupPath of cleanupPaths.splice(0).reverse()) {
    fs.rmSync(cleanupPath, { recursive: true, force: true });
  }
});

describe("durable temporary-workspace artifacts", () => {
  it("survives deletion of the source temporary workspace", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "durable-artifact-test-"),
    );
    cleanupPaths.push(root);
    const workspacePath = path.join(root, "neoworker-temp", "ui-session-abc");
    const userDataPath = path.join(root, "user-data");
    const sourcePath = path.join(workspacePath, "reports", "analysis.docx");
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, "valid-docx-placeholder");

    const durablePath = persistTempWorkspaceArtifactSync({
      userDataPath,
      workspacePath,
      artifactPath: sourcePath,
    });

    expect(durablePath).toBe(
      resolveDurableTempArtifactPath({
        userDataPath,
        workspacePath,
        artifactPath: "reports/analysis.docx",
      }),
    );
    expect(path.dirname(durablePath!)).toBe(
      path.join(
        resolveDurableTempWorkspaceRoot({ userDataPath, workspacePath }),
        "reports",
      ),
    );
    expect(fs.readFileSync(durablePath!, "utf8")).toBe(
      "valid-docx-placeholder",
    );

    fs.rmSync(workspacePath, { recursive: true, force: true });
    expect(fs.readFileSync(durablePath!, "utf8")).toBe(
      "valid-docx-placeholder",
    );
  });

  it("rejects paths outside the temporary workspace", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "durable-artifact-test-"),
    );
    cleanupPaths.push(root);
    const workspacePath = path.join(root, "workspace");
    const outsidePath = path.join(root, "outside.docx");
    fs.mkdirSync(workspacePath, { recursive: true });
    fs.writeFileSync(outsidePath, "outside");

    expect(
      persistTempWorkspaceArtifactSync({
        userDataPath: path.join(root, "user-data"),
        workspacePath,
        artifactPath: outsidePath,
      }),
    ).toBeNull();
  });

  it("atomically replaces the durable copy when an artifact is updated", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "durable-artifact-test-"),
    );
    cleanupPaths.push(root);
    const workspacePath = path.join(root, "workspace");
    const userDataPath = path.join(root, "user-data");
    const sourcePath = path.join(workspacePath, "report.pdf");
    fs.mkdirSync(workspacePath, { recursive: true });
    fs.writeFileSync(sourcePath, "first");
    const durablePath = persistTempWorkspaceArtifactSync({
      userDataPath,
      workspacePath,
      artifactPath: sourcePath,
    });

    fs.writeFileSync(sourcePath, "second-version");
    const updatedPath = persistTempWorkspaceArtifactSync({
      userDataPath,
      workspacePath,
      artifactPath: sourcePath,
    });

    expect(updatedPath).toBe(durablePath);
    expect(fs.readFileSync(updatedPath!, "utf8")).toBe("second-version");
  });

  it("restores a missing workspace upload from its durable mirror", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "durable-artifact-restore-test-"),
    );
    cleanupPaths.push(root);
    const workspacePath = path.join(
      root,
      "neoworker-temp",
      "ui-session-restore",
    );
    const userDataPath = path.join(root, "user-data");
    const relativePath = path.join(
      ".neoworker",
      "uploads",
      "123",
      "screenshot.png",
    );
    const sourcePath = path.join(workspacePath, relativePath);
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, "png-placeholder");

    persistTempWorkspaceArtifactSync({
      userDataPath,
      workspacePath,
      artifactPath: relativePath,
    });
    fs.rmSync(workspacePath, { recursive: true, force: true });

    const restoredPath = restoreTempWorkspaceArtifactSync({
      userDataPath,
      workspacePath,
      artifactPath: relativePath,
    });

    expect(restoredPath).toBe(sourcePath);
    expect(fs.readFileSync(restoredPath!, "utf8")).toBe("png-placeholder");
  });

  it("restores a task attachment into a different temporary workspace", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "durable-task-attachment-test-"),
    );
    cleanupPaths.push(root);
    const originalWorkspace = path.join(root, "temp", "ui-session-a");
    const resumedWorkspace = path.join(root, "temp", "ui-session-b");
    const userDataPath = path.join(root, "user-data");
    const taskId = "task-cross-workspace";
    const relativePath = path.join(
      ".neoworker",
      "uploads",
      "1787365018475",
      "截图.png",
    );
    const originalPath = path.join(originalWorkspace, relativePath);
    fs.mkdirSync(path.dirname(originalPath), { recursive: true });
    fs.writeFileSync(originalPath, "task-image-placeholder");

    const durablePath = persistTaskAttachmentSync({
      userDataPath,
      taskId,
      workspacePath: originalWorkspace,
      artifactPath: relativePath,
    });
    expect(durablePath).toContain(
      resolveDurableTaskAttachmentRoot({ userDataPath, taskId }),
    );

    fs.rmSync(originalWorkspace, { recursive: true, force: true });
    const restoredPath = restoreTaskAttachmentSync({
      userDataPath,
      taskId,
      workspacePath: resumedWorkspace,
      artifactPath: relativePath,
    });

    expect(restoredPath).toBe(path.join(resumedWorkspace, relativePath));
    expect(fs.readFileSync(restoredPath!, "utf8")).toBe(
      "task-image-placeholder",
    );
  });

  it("migrates a legacy workspace mirror into the task attachment store", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "durable-task-legacy-test-"),
    );
    cleanupPaths.push(root);
    const originalWorkspace = path.join(root, "temp", "ui-session-old");
    const resumedWorkspace = path.join(root, "temp", "ui-session-new");
    const userDataPath = path.join(root, "user-data");
    const taskId = "task-legacy-migration";
    const relativePath = path.join(
      ".neoworker",
      "uploads",
      "123",
      "legacy.png",
    );
    const originalPath = path.join(originalWorkspace, relativePath);
    fs.mkdirSync(path.dirname(originalPath), { recursive: true });
    fs.writeFileSync(originalPath, "legacy-image-placeholder");
    persistTempWorkspaceArtifactSync({
      userDataPath,
      workspacePath: originalWorkspace,
      artifactPath: relativePath,
    });
    fs.rmSync(originalWorkspace, { recursive: true, force: true });

    const restoredPath = restoreTaskAttachmentSync({
      userDataPath,
      taskId,
      workspacePath: resumedWorkspace,
      artifactPath: relativePath,
    });

    expect(fs.readFileSync(restoredPath!, "utf8")).toBe(
      "legacy-image-placeholder",
    );
    expect(
      fs.existsSync(
        path.join(
          resolveDurableTaskAttachmentRoot({ userDataPath, taskId }),
          relativePath,
        ),
      ),
    ).toBe(true);
  });

  it("extracts only app-generated upload references from task messages", () => {
    const text = [
      "Attached files (relative to workspace):",
      "- 截图.png (.neoworker/uploads/123/截图.png)",
      "Ignore /Users/example/private.png",
      "Path: .neoworker\\uploads\\456\\other.jpg",
    ].join("\n");

    expect(extractWorkspaceUploadPaths(text)).toEqual([
      ".neoworker/uploads/123/截图.png",
      ".neoworker\\uploads\\456\\other.jpg",
    ]);
  });
});
