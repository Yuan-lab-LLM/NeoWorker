import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LEGACY_WORKSPACE_KIT_DIRECTORIES } from "../legacy-brand-compat";
import { migrateLegacyWorkspaceKits } from "../legacy-workspace-kit";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("legacy workspace kit migration", () => {
  it("does not rescan a workspace after a successful migration", () => {
    const workspace = fs.mkdtempSync(
      path.join(os.tmpdir(), "neoworker-legacy-workspace-"),
    );
    temporaryDirectories.push(workspace);

    const legacyDirectory = path.join(
      workspace,
      LEGACY_WORKSPACE_KIT_DIRECTORIES[0],
    );
    fs.mkdirSync(legacyDirectory);
    fs.writeFileSync(path.join(legacyDirectory, "memory.md"), "legacy memory");

    expect(migrateLegacyWorkspaceKits([{ path: workspace }])).toHaveLength(1);
    expect(
      fs.readFileSync(path.join(workspace, ".neoworker", "memory.md"), "utf8"),
    ).toBe("legacy memory");

    fs.writeFileSync(path.join(legacyDirectory, "late-file.md"), "do not rescan");

    expect(migrateLegacyWorkspaceKits([{ path: workspace }])).toEqual([]);
    expect(
      fs.existsSync(path.join(workspace, ".neoworker", "late-file.md")),
    ).toBe(false);
  });
});
