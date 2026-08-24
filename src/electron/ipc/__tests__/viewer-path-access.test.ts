import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import * as os from "os";
import * as path from "path";
import {
  findUniqueViewerArtifactByBasename,
  shouldRequireViewerWorkspaceContainment,
} from "../viewer-path-access";

const permissions = {
  read: true,
  write: true,
  delete: false,
  network: false,
  shell: false,
};

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("viewer path access", () => {
  it("keeps ordinary and unknown workspaces contained", () => {
    expect(shouldRequireViewerWorkspaceContainment(undefined)).toBe(true);
    expect(
      shouldRequireViewerWorkspaceContainment({
        id: "workspace-1",
        permissions,
      }),
    ).toBe(true);
  });

  it("honors temporary and unrestricted external-file grants", () => {
    expect(
      shouldRequireViewerWorkspaceContainment({
        id: "__temp_workspace__:session-1",
        permissions,
      }),
    ).toBe(false);
    expect(
      shouldRequireViewerWorkspaceContainment({
        id: "workspace-2",
        permissions: { ...permissions, unrestrictedFileAccess: true },
      }),
    ).toBe(false);
  });

  it("recovers a uniquely moved artifact from a generated-output directory", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "viewer-path-recovery-"));
    temporaryDirectories.push(workspace);
    const artifactDirectory = path.join(workspace, ".neoworker", "tmp", "reports");
    await mkdir(artifactDirectory, { recursive: true });
    const expected = path.join(artifactDirectory, "report.html");
    await writeFile(expected, "<!doctype html><title>report</title>");

    await expect(
      findUniqueViewerArtifactByBasename("stale/location/report.html", workspace),
    ).resolves.toBe(expected);
  });

  it("recovers a generated artifact from a task automated-output directory", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "viewer-path-automated-output-"));
    temporaryDirectories.push(workspace);
    const artifactDirectory = path.join(
      workspace,
      ".neoworker",
      "automated-outputs",
      "task-123",
      "output",
      "marketing",
    );
    await mkdir(artifactDirectory, { recursive: true });
    const expected = path.join(artifactDirectory, "marketing-plan.pdf");
    await writeFile(expected, "%PDF-1.7");

    await expect(
      findUniqueViewerArtifactByBasename("marketing-plan.pdf", workspace),
    ).resolves.toBe(expected);
  });

  it("does not guess when a generated artifact basename is ambiguous", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "viewer-path-ambiguous-"));
    temporaryDirectories.push(workspace);
    const firstDirectory = path.join(workspace, ".neoworker", "tmp", "first");
    const secondDirectory = path.join(workspace, "artifacts", "second");
    await mkdir(firstDirectory, { recursive: true });
    await mkdir(secondDirectory, { recursive: true });
    await writeFile(path.join(firstDirectory, "report.html"), "first");
    await writeFile(path.join(secondDirectory, "report.html"), "second");

    await expect(
      findUniqueViewerArtifactByBasename("report.html", workspace),
    ).resolves.toBeNull();
  });

  it("does not replace a nonexistent filename with a merely similar artifact", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "viewer-path-exact-name-"));
    temporaryDirectories.push(workspace);
    const artifactDirectory = path.join(workspace, ".neoworker", "tmp");
    await mkdir(artifactDirectory, { recursive: true });
    await writeFile(path.join(artifactDirectory, "capability-test-report.html"), "report");

    await expect(
      findUniqueViewerArtifactByBasename("capability-test-card.html", workspace),
    ).resolves.toBeNull();
  });
});
