import fs from "node:fs";
import path from "node:path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import JSZip from "jszip";
import { Workspace } from "../../../shared/types";
import { AgentDaemon } from "../daemon";
import { GitService } from "../../git/GitService";
import { LLMTool } from "../llm/types";

/**
 * Git tools that agents can use for version control operations.
 * git_status and git_diff are always available in git repos.
 * git_commit and git_merge_to_base require an active worktree.
 */
export class GitTools {
  constructor(
    private workspace: Workspace,
    private daemon: AgentDaemon,
    private taskId: string,
  ) {}

  setWorkspace(workspace: Workspace): void {
    this.workspace = workspace;
  }

  /**
   * Clone a repository without relying on the operating system's Git binary.
   * This keeps public repository tasks working on clean macOS installations
   * where /usr/bin/git is only an Xcode Command Line Tools launcher.
   */
  async gitClone(input: {
    url?: string;
    destination?: string;
    ref?: string;
    depth?: number;
  }): Promise<string> {
    const repositoryUrl = normalizeRepositoryUrl(input.url);
    const destination = resolveCloneDestination(
      this.workspace.path,
      repositoryUrl,
      input.destination,
    );
    const reference = normalizeGitReference(input.ref);
    const depth = Math.max(1, Math.min(100, Math.round(input.depth || 1)));
    const destinationExisted = await pathExists(destination);
    if (destinationExisted) {
      const entries = await fs.promises.readdir(destination);
      if (entries.length > 0) {
        throw new Error(
          `Clone destination already exists and is not empty: ${path.relative(this.workspace.path, destination)}`,
        );
      }
    }

    await fs.promises.mkdir(destination, { recursive: true });
    this.daemon.logEvent(this.taskId, "progress_update", {
      message: "Downloading repository with NeoWorker built-in Git",
      repositoryUrl,
      destination,
      transport: "isomorphic-git",
    });

    try {
      await git.clone({
        fs,
        http,
        dir: destination,
        url: repositoryUrl,
        ref: reference,
        singleBranch: true,
        depth,
        noCheckout: false,
      });
      return [
        "Repository downloaded successfully with NeoWorker built-in Git.",
        `Path: ${destination}`,
        `Source: ${repositoryUrl}`,
        `Mode: full Git repository${reference ? ` (${reference})` : ""}`,
      ].join("\n");
    } catch (cloneError) {
      await resetCloneDestination(destination, destinationExisted);
      const github = parseGitHubRepository(repositoryUrl);
      if (!github) {
        throw new Error(
          `NeoWorker built-in Git could not clone this repository: ${errorMessage(cloneError)}`,
        );
      }

      this.daemon.logEvent(this.taskId, "progress_update", {
        message: "Built-in Git was unavailable; downloading the repository source archive instead",
        repositoryUrl,
        destination,
        transport: "github-codeload",
      });
      try {
        const archiveResult = await downloadGitHubArchive({
          owner: github.owner,
          repo: github.repo,
          destination,
          reference,
        });
        return [
          "Repository source downloaded successfully with NeoWorker's archive fallback.",
          `Path: ${destination}`,
          `Source: ${repositoryUrl}`,
          `Reference: ${archiveResult.reference}`,
          `Files: ${archiveResult.fileCount}`,
          "Mode: source snapshot (Git history is not included)",
          `Built-in Git fallback reason: ${errorMessage(cloneError)}`,
        ].join("\n");
      } catch (archiveError) {
        await resetCloneDestination(destination, destinationExisted);
        throw new Error(
          `Repository download failed. Built-in Git: ${errorMessage(cloneError)}. ` +
            `Source archive fallback: ${errorMessage(archiveError)}`,
        );
      }
    }
  }

  /**
   * Get git status of the working directory.
   */
  async gitStatus(): Promise<string> {
    const isRepo = await GitService.isGitRepo(this.workspace.path);
    if (!isRepo) {
      return "This workspace is not a git repository.";
    }
    const status = await GitService.getStatus(this.workspace.path);
    if (!status.trim()) {
      return "Working tree clean — no changes.";
    }
    const branch = await GitService.getCurrentBranch(this.workspace.path);
    return `On branch: ${branch}\n\n${status}`;
  }

  /**
   * Get diff of changes.
   */
  async gitDiff(input: { staged?: boolean; file?: string }): Promise<string> {
    const isRepo = await GitService.isGitRepo(this.workspace.path);
    if (!isRepo) {
      return "This workspace is not a git repository.";
    }
    const diff = await GitService.getDiff(this.workspace.path, {
      staged: input.staged,
      file: input.file,
    });
    if (!diff.trim()) {
      return input.staged ? "No staged changes." : "No unstaged changes.";
    }
    // Truncate very large diffs
    const maxLen = 50_000;
    if (diff.length > maxLen) {
      return diff.slice(0, maxLen) + "\n\n... (diff truncated, too large to display)";
    }
    return diff;
  }

  /**
   * Commit current changes. Only available in worktree-isolated tasks.
   */
  async gitCommit(input: { message: string; add_all?: boolean }): Promise<string> {
    const task = await this.daemon.getTaskById(this.taskId);
    if (!task?.worktreeBranch) {
      return "git_commit requires an active worktree. Enable worktree isolation in Settings > Git to use this tool.";
    }

    const isRepo = await GitService.isGitRepo(this.workspace.path);
    if (!isRepo) {
      return "This workspace is not a git repository.";
    }

    const addAll = input.add_all !== false; // default true
    const result = await GitService.commitAll(this.workspace.path, input.message, { addAll });
    if (!result) {
      return addAll
        ? "Nothing to commit — working tree clean."
        : "Nothing to commit — no staged changes.";
    }

    this.daemon.logEvent(this.taskId, "worktree_committed", {
      sha: result.sha,
      filesChanged: result.filesChanged,
      message: `Committed ${result.filesChanged} file(s): ${input.message} (${result.sha.slice(0, 7)})`,
    });

    return `Committed successfully.\nSHA: ${result.sha.slice(0, 7)}\nFiles changed: ${result.filesChanged}\nMessage: ${input.message}`;
  }

  /**
   * Request merge of worktree branch back to base branch.
   */
  async gitMergeToBase(): Promise<string> {
    const task = await this.daemon.getTaskById(this.taskId);
    if (!task?.worktreeBranch) {
      return "git_merge_to_base requires an active worktree. This tool is only available for tasks running in worktree isolation mode.";
    }

    const worktreeManager = this.daemon.getWorktreeManager();
    const info = worktreeManager.getWorktreeInfo(this.taskId);
    if (!info) {
      return "No worktree info found for this task.";
    }

    this.daemon.logEvent(this.taskId, "worktree_merge_start", {
      branch: info.branchName,
      baseBranch: info.baseBranch,
      message: `Merging "${info.branchName}" into "${info.baseBranch}"...`,
    });

    const result = await worktreeManager.mergeToBase(this.taskId);

    if (result.success) {
      this.daemon.logEvent(this.taskId, "worktree_merged", {
        sha: result.mergeSha,
        message: `Successfully merged "${info.branchName}" into "${info.baseBranch}" (${result.mergeSha?.slice(0, 7)}).`,
      });
      return `Merge successful!\nMerge commit: ${result.mergeSha?.slice(0, 7)}\nBranch "${info.branchName}" merged into "${info.baseBranch}".`;
    } else {
      this.daemon.logEvent(this.taskId, "worktree_conflict", {
        conflictFiles: result.conflictFiles,
        error: result.error,
        message: `Merge conflict: ${result.error}`,
      });
      let msg = `Merge failed: ${result.error}`;
      if (result.conflictFiles && result.conflictFiles.length > 0) {
        msg += `\nConflicting files:\n${result.conflictFiles.map((f) => `  - ${f}`).join("\n")}`;
      }
      return msg;
    }
  }

  static getToolDefinitions(): LLMTool[] {
    return [
      {
        name: "git_status",
        description:
          "Show the current git status of the workspace (changed files, staged files, branch info). Use this to understand what files have been modified before committing.",
        input_schema: {
          type: "object" as const,
          properties: {},
        },
      },
      {
        name: "git_diff",
        description:
          "Show the diff of changes in the workspace. Can show unstaged changes, staged changes, or changes to a specific file. Useful for reviewing what has changed.",
        input_schema: {
          type: "object" as const,
          properties: {
            staged: {
              type: "boolean",
              description: "Show only staged changes. Default: false (shows unstaged changes).",
            },
            file: {
              type: "string",
              description: "Path to a specific file to diff. If omitted, shows all changes.",
            },
          },
        },
      },
      {
        name: "git_commit",
        description:
          "Commit changes in the workspace. Only available when working in an isolated worktree branch. Stages all changes and commits with the given message.",
        input_schema: {
          type: "object" as const,
          properties: {
            message: {
              type: "string",
              description: "Commit message describing the changes.",
            },
            add_all: {
              type: "boolean",
              description: "Stage all changes before committing. Default: true.",
            },
          },
          required: ["message"],
        },
      },
      {
        name: "git_merge_to_base",
        description:
          "Merge the current worktree branch back to the base branch. Only available in worktree isolation mode. Use when your work is complete and ready to be integrated.",
        input_schema: {
          type: "object" as const,
          properties: {},
        },
      },
    ];
  }

  static getCloneToolDefinitions(): LLMTool[] {
    return [
      {
        name: "git_clone",
        description:
          "Download a Git repository into the current workspace using NeoWorker's built-in Git runtime, without requiring system Git or Xcode Command Line Tools. Always prefer this over run_command with `git clone`. For public GitHub repositories, it automatically falls back to a source archive if the full Git transport is unavailable.",
        input_schema: {
          type: "object" as const,
          properties: {
            url: {
              type: "string",
              description: "HTTPS or GitHub repository URL to clone.",
            },
            destination: {
              type: "string",
              description:
                "Optional destination directory relative to the workspace. Defaults to the repository name.",
            },
            ref: {
              type: "string",
              description: "Optional branch or tag to download.",
            },
            depth: {
              type: "number",
              description: "Optional history depth from 1 to 100. Defaults to 1.",
            },
          },
          required: ["url"],
        },
      },
    ];
  }
}

const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_ARCHIVE_FILES = 50_000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.promises.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function resetCloneDestination(
  destination: string,
  destinationExisted: boolean,
): Promise<void> {
  await fs.promises.rm(destination, { recursive: true, force: true });
  if (destinationExisted) {
    await fs.promises.mkdir(destination, { recursive: true });
  }
}

export function normalizeRepositoryUrl(rawUrl: string | undefined): string {
  const raw = String(rawUrl || "").trim();
  if (!raw) throw new Error("Repository URL is required.");

  const githubSsh = /^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i.exec(raw);
  const value = githubSsh
    ? `https://github.com/${githubSsh[1]}/${githubSsh[2]}`
    : raw;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Repository URL must be a valid HTTPS or GitHub URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Repository URL must use HTTPS.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Credentials must not be embedded in the repository URL.");
  }
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  if (!parsed.pathname || parsed.pathname === "/") {
    throw new Error("Repository URL must include a repository path.");
  }
  return parsed.toString().replace(/\/$/, "");
}

function normalizeGitReference(rawReference: string | undefined): string | undefined {
  const reference = String(rawReference || "").trim();
  if (!reference) return undefined;
  if (
    reference.startsWith("-") ||
    reference.includes("..") ||
    /[\\~^:?*[\]\s]/.test(reference)
  ) {
    throw new Error("Invalid Git branch or tag name.");
  }
  return reference.replace(/^refs\/(?:heads|tags)\//, "");
}

export function resolveCloneDestination(
  workspacePath: string,
  repositoryUrl: string,
  rawDestination?: string,
): string {
  const parsed = new URL(repositoryUrl);
  const repositoryName = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "")
    .replace(/\.git$/i, "")
    .trim();
  if (!repositoryName) throw new Error("Could not determine the repository name.");

  const destinationInput = String(rawDestination || repositoryName).trim();
  if (!destinationInput) throw new Error("Clone destination is required.");
  const workspaceRoot = path.resolve(workspacePath);
  const destination = path.resolve(workspaceRoot, destinationInput);
  const relative = path.relative(workspaceRoot, destination);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Clone destination must be a directory inside the current workspace.");
  }
  return destination;
}

export function parseGitHubRepository(
  repositoryUrl: string,
): { owner: string; repo: string } | null {
  const parsed = new URL(repositoryUrl);
  if (parsed.hostname.toLowerCase() !== "github.com") return null;
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length !== 2) return null;
  return {
    owner: decodeURIComponent(segments[0]),
    repo: decodeURIComponent(segments[1]).replace(/\.git$/i, ""),
  };
}

async function downloadGitHubArchive(input: {
  owner: string;
  repo: string;
  destination: string;
  reference?: string;
}): Promise<{ reference: string; fileCount: number }> {
  let reference = input.reference;
  if (!reference) {
    const metadataResponse = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "NeoWorker",
        },
      },
    );
    if (!metadataResponse.ok) {
      throw new Error(`GitHub repository metadata request failed (${metadataResponse.status}).`);
    }
    const metadata = (await metadataResponse.json()) as { default_branch?: unknown };
    reference =
      typeof metadata.default_branch === "string" && metadata.default_branch.trim()
        ? metadata.default_branch.trim()
        : "main";
  }

  const archiveUrl =
    `https://codeload.github.com/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}` +
    `/zip/refs/heads/${reference.split("/").map(encodeURIComponent).join("/")}`;
  const archiveResponse = await fetch(archiveUrl, {
    headers: { Accept: "application/zip", "User-Agent": "NeoWorker" },
  });
  if (!archiveResponse.ok) {
    throw new Error(`GitHub source archive request failed (${archiveResponse.status}).`);
  }
  const declaredSize = Number(archiveResponse.headers.get("content-length") || 0);
  if (declaredSize > MAX_ARCHIVE_BYTES) {
    throw new Error("Repository source archive is too large to extract safely.");
  }
  const archive = Buffer.from(await archiveResponse.arrayBuffer());
  if (archive.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error("Repository source archive is too large to extract safely.");
  }

  const zip = await JSZip.loadAsync(archive);
  const entries = Object.values(zip.files);
  if (entries.length > MAX_ARCHIVE_FILES) {
    throw new Error("Repository source archive contains too many files.");
  }
  const firstSegments = entries
    .map((entry) => entry.name.replace(/\\/g, "/").split("/")[0])
    .filter(Boolean);
  const archiveRoot =
    firstSegments.length > 0 && firstSegments.every((segment) => segment === firstSegments[0])
      ? `${firstSegments[0]}/`
      : "";

  await fs.promises.mkdir(input.destination, { recursive: true });
  let fileCount = 0;
  let extractedBytes = 0;
  for (const entry of entries) {
    const archivePath = entry.name.replace(/\\/g, "/");
    const relativePath = archiveRoot && archivePath.startsWith(archiveRoot)
      ? archivePath.slice(archiveRoot.length)
      : archivePath;
    if (!relativePath) continue;
    const normalized = path.posix.normalize(relativePath);
    if (
      normalized === ".." ||
      normalized.startsWith("../") ||
      path.posix.isAbsolute(normalized)
    ) {
      throw new Error("Repository source archive contains an unsafe path.");
    }
    const outputPath = path.resolve(input.destination, normalized);
    const relativeOutput = path.relative(input.destination, outputPath);
    if (relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput)) {
      throw new Error("Repository source archive attempted to escape the workspace.");
    }
    if (entry.dir) {
      await fs.promises.mkdir(outputPath, { recursive: true });
      continue;
    }
    const contents = await entry.async("nodebuffer");
    extractedBytes += contents.byteLength;
    if (extractedBytes > MAX_ARCHIVE_BYTES) {
      throw new Error("Repository source archive expands beyond the safe size limit.");
    }
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.promises.writeFile(outputPath, contents);
    fileCount += 1;
  }
  return { reference, fileCount };
}
