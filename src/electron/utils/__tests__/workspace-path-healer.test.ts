import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findMovedDesktopWorkspacePath,
  healMovedDesktopWorkspacePaths,
  isWorkspaceArtifactSkeleton,
} from "../workspace-path-healer";

describe("workspace-path-healer", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("treats .neoworker-only directories as synthetic skeletons", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-healer-"));
    tmpDirs.push(tmpDir);
    fs.mkdirSync(path.join(tmpDir, ".neoworker"), { recursive: true });

    expect(isWorkspaceArtifactSkeleton(tmpDir)).toBe(true);
  });

  it("does not treat an empty workspace directory as a synthetic skeleton", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-healer-empty-"));
    tmpDirs.push(tmpDir);

    expect(isWorkspaceArtifactSkeleton(tmpDir)).toBe(false);
  });

  it("finds a moved Desktop workspace under Desktop/new when the old path is synthetic", () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-healer-home-"));
    tmpDirs.push(homeDir);
    const oldPath = path.join(homeDir, "Desktop", "daily");
    const newPath = path.join(homeDir, "Desktop", "new", "daily");
    fs.mkdirSync(path.join(oldPath, ".neoworker"), { recursive: true });
    fs.mkdirSync(newPath, { recursive: true });

    expect(findMovedDesktopWorkspacePath(oldPath, homeDir)).toBe(newPath);
  });

  it("heals moved Desktop workspace records without touching healthy workspaces", () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-healer-home-"));
    tmpDirs.push(homeDir);
    const oldPath = path.join(homeDir, "Desktop", "email+");
    const newPath = path.join(homeDir, "Desktop", "new", "email+");
    const stablePath = path.join(homeDir, "Projects", "stable");

    fs.mkdirSync(path.join(oldPath, ".neoworker"), { recursive: true });
    fs.mkdirSync(newPath, { recursive: true });
    fs.mkdirSync(stablePath, { recursive: true });

    const updates: Array<{ id: string; nextPath: string }> = [];
    const repairs = healMovedDesktopWorkspacePaths(
      [
        {
          id: "stale",
          name: "email+",
          path: oldPath,
          createdAt: 1,
          lastUsedAt: 2,
          permissions: { read: true, write: true, delete: false, network: true, shell: false },
        },
        {
          id: "stable",
          name: "stable",
          path: stablePath,
          createdAt: 1,
          lastUsedAt: 2,
          permissions: { read: true, write: true, delete: false, network: true, shell: false },
        },
      ],
      (workspaceId, nextPath) => {
        updates.push({ id: workspaceId, nextPath });
      },
      { homeDir },
    );

    expect(repairs).toEqual([
      {
        workspaceId: "stale",
        oldPath,
        newPath,
      },
    ]);
    expect(updates).toEqual([{ id: "stale", nextPath: newPath }]);
  });

  it("does not heal an existing empty workspace just because Desktop/new contains a match", () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-healer-home-"));
    tmpDirs.push(homeDir);
    const oldPath = path.join(homeDir, "Desktop", "fresh");
    const newPath = path.join(homeDir, "Desktop", "new", "fresh");

    fs.mkdirSync(oldPath, { recursive: true });
    fs.mkdirSync(newPath, { recursive: true });

    expect(findMovedDesktopWorkspacePath(oldPath, homeDir)).toBeNull();
  });
});
