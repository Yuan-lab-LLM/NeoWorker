import { afterEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  persistTempWorkspaceArtifactSync,
  resolveDurableTempArtifactPath,
  resolveDurableTempWorkspaceRoot,
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
});
