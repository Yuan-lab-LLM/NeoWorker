import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import git from "isomorphic-git";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Workspace } from "../../../../shared/types";
import {
  GitTools,
  normalizeRepositoryUrl,
  parseGitHubRepository,
  resolveCloneDestination,
} from "../git-tools";

vi.mock("isomorphic-git", () => ({
  default: {
    clone: vi.fn(),
  },
}));

describe("GitTools built-in repository download", () => {
  let workspacePath: string;
  let daemon: { logEvent: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    workspacePath = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "neoworker-git-tools-"),
    );
    daemon = { logEvent: vi.fn() };
    vi.mocked(git.clone).mockReset();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await fs.promises.rm(workspacePath, { recursive: true, force: true });
  });

  function createTools(): GitTools {
    return new GitTools(
      {
        id: "workspace-1",
        name: "Workspace",
        path: workspacePath,
        permissions: { read: true, write: true, shell: false },
      } as Workspace,
      daemon as never,
      "task-1",
    );
  }

  it("normalizes GitHub SSH URLs and confines destinations to the workspace", () => {
    const url = normalizeRepositoryUrl("git@github.com:Yuan-lab-LLM/NeoWorker.git");
    expect(url).toBe("https://github.com/Yuan-lab-LLM/NeoWorker");
    expect(parseGitHubRepository(url)).toEqual({
      owner: "Yuan-lab-LLM",
      repo: "NeoWorker",
    });
    expect(resolveCloneDestination(workspacePath, url)).toBe(
      path.join(workspacePath, "NeoWorker"),
    );
    expect(() =>
      resolveCloneDestination(workspacePath, url, "../outside"),
    ).toThrow(/inside the current workspace/i);
  });

  it("clones with the bundled JavaScript Git runtime without shell access", async () => {
    vi.mocked(git.clone).mockImplementation(async (options) => {
      await fs.promises.mkdir(path.join(String(options.dir), ".git"), {
        recursive: true,
      });
      await fs.promises.writeFile(
        path.join(String(options.dir), "README.md"),
        "built-in clone",
      );
    });

    const result = await createTools().gitClone({
      url: "https://github.com/Yuan-lab-LLM/NeoWorker",
    });

    expect(result).toContain("NeoWorker built-in Git");
    expect(result).toContain("Mode: full Git repository");
    expect(
      await fs.promises.readFile(
        path.join(workspacePath, "NeoWorker", "README.md"),
        "utf8",
      ),
    ).toBe("built-in clone");
    expect(daemon.logEvent).toHaveBeenCalledWith(
      "task-1",
      "progress_update",
      expect.objectContaining({ transport: "isomorphic-git" }),
    );
  });

  it("falls back to a GitHub source archive when full Git transport fails", async () => {
    vi.mocked(git.clone).mockRejectedValue(new Error("transport unavailable"));
    const zip = new JSZip();
    zip.file("NeoWorker-main/README.md", "archive clone");
    zip.file("NeoWorker-main/src/index.ts", "export {};\n");
    const archive = await zip.generateAsync({ type: "nodebuffer" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ default_branch: "main" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(archive, {
          status: 200,
          headers: {
            "content-type": "application/zip",
            "content-length": String(archive.byteLength),
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createTools().gitClone({
      url: "https://github.com/Yuan-lab-LLM/NeoWorker",
    });

    expect(result).toContain("archive fallback");
    expect(result).toContain("Mode: source snapshot");
    expect(result).toContain("Files: 2");
    expect(
      await fs.promises.readFile(
        path.join(workspacePath, "NeoWorker", "README.md"),
        "utf8",
      ),
    ).toBe("archive clone");
    expect(daemon.logEvent).toHaveBeenLastCalledWith(
      "task-1",
      "progress_update",
      expect.objectContaining({ transport: "github-codeload" }),
    );
  });
});
