import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { AgentDaemon } from "../agent/daemon";
import { ArtifactRepository, TaskRepository, WorkspaceRepository } from "../database/repositories";
import type {
  DocumentEditorSession,
  DocumentEditRequest,
  DocumentVersionEntry,
  DocxBlockSelection,
  PdfRegionSelection,
  Task,
  TaskOutputSummary,
  Workspace,
} from "../../shared/types";
import { parseDocxBlocksFromBuffer } from "./docx-blocks";
import { editPdfRegion } from "./pdf-region-editor";
import { extractPdfReviewData } from "../utils/pdf-review";

type SessionRecord = {
  id: string;
  workspacePath?: string;
  basePath: string;
  currentPath: string;
  fileType: "pdf" | "docx";
  sourceTaskId?: string;
};

type PdfRegionEditInput = {
  sourcePath: string;
  destPath: string;
  pageIndex: number;
  bbox: { x: number; y: number; w: number; h: number };
  instruction: string;
};

type PdfRegionEditor = {
  edit: (input: PdfRegionEditInput & { selectionText?: string }) => Promise<void>;
};

const defaultPdfRegionEditor: PdfRegionEditor = {
  edit: editPdfRegion,
};

function getFileType(filePath: string): "pdf" | "docx" | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (ext === ".docx") return "docx";
  return null;
}

function ensureWithinAllowedRoots(targetPath: string, allowedRoots: string[]): boolean {
  return allowedRoots.some(
    (root) => targetPath === root || targetPath.startsWith(`${root}${path.sep}`),
  );
}

function normalizeVersionBase(filePath: string): { dir: string; ext: string; stem: string } {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const name = path.basename(filePath, ext);
  return {
    dir,
    ext,
    stem: name.replace(/-v\d+$/i, ""),
  };
}

function versionSortKey(filePath: string): number {
  const match = path.basename(filePath).match(/-v(\d+)(?=\.[^.]+$)/i);
  return match ? Number(match[1]) : 1;
}

export class DocumentEditorSessionService {
  // NOTE: sessions are intentionally in-memory only. If the Electron process restarts
  // mid-edit, the renderer's sessionId will be orphaned and the user will need to
  // re-open the document. Persisting sessions to disk is left for a future iteration.
  private sessions = new Map<string, SessionRecord>();

  constructor(
    private workspaceRepo: WorkspaceRepository,
    private taskRepo: TaskRepository,
    private artifactRepo: ArtifactRepository,
    private agentDaemon: AgentDaemon,
    private pdfRegionEditor: PdfRegionEditor = defaultPdfRegionEditor,
  ) {}

  private resolvePath(filePath: string, workspacePath?: string): string {
    const rawPath = String(filePath || "").trim();
    if (!rawPath) {
      throw new Error("File path is required.");
    }

    // Task events can outlive workspace moves and older runs often saved only a
    // basename. Keep the editor's lookup compatible with the regular file viewer:
    // real artifacts may live under `.neoworker/` or `artifacts/`, not only at the
    // workspace root. We deliberately do not recursively search the workspace so
    // opening a document remains deterministic when duplicate file names exist.
    const normalizedInput =
      path.sep === "/" ? rawPath.replace(/\\/g, "/") : rawPath.replace(/\//g, "\\");
    const normalizedWorkspace = workspacePath ? path.resolve(workspacePath) : "";
    const candidates: string[] = [];
    const seen = new Set<string>();
    const addCandidate = (candidate: string) => {
      if (!candidate) return;
      const resolved = path.resolve(candidate);
      if (seen.has(resolved)) return;
      seen.add(resolved);
      candidates.push(resolved);
    };
    const basename = path.basename(normalizedInput);
    const pathSegments = normalizedInput.split(/[\\/]+/).filter(Boolean);
    const hasParentTraversal = pathSegments.includes("..");
    const relativeInput = normalizedInput
      .replace(/^\.([\\/])/, "")
      .replace(/^[\\/]+/, "");

    if (path.isAbsolute(normalizedInput)) {
      addCandidate(normalizedInput);
      if (normalizedWorkspace) {
        if (basename && basename !== "." && basename !== "..") {
          addCandidate(path.join(normalizedWorkspace, basename));
          addCandidate(path.join(normalizedWorkspace, ".neoworker", basename));
          addCandidate(path.join(normalizedWorkspace, "artifacts", basename));
        }

        // Remap stale absolute paths from a previous workspace location.
        const neoworkerIndex = pathSegments.lastIndexOf(".neoworker");
        if (neoworkerIndex >= 0 && neoworkerIndex < pathSegments.length - 1) {
          addCandidate(
            path.join(normalizedWorkspace, ".neoworker", ...pathSegments.slice(neoworkerIndex + 1)),
          );
        }
        const artifactsIndex = pathSegments.lastIndexOf("artifacts");
        if (artifactsIndex >= 0 && artifactsIndex < pathSegments.length - 1) {
          addCandidate(
            path.join(normalizedWorkspace, "artifacts", ...pathSegments.slice(artifactsIndex + 1)),
          );
        }
      }
    } else if (normalizedWorkspace) {
      addCandidate(path.join(normalizedWorkspace, normalizedInput));
      if (!hasParentTraversal) {
        addCandidate(path.join(normalizedWorkspace, ".neoworker", relativeInput));
        addCandidate(path.join(normalizedWorkspace, "artifacts", relativeInput));
        if (basename && basename !== relativeInput) {
          addCandidate(path.join(normalizedWorkspace, basename));
          addCandidate(path.join(normalizedWorkspace, ".neoworker", basename));
          addCandidate(path.join(normalizedWorkspace, "artifacts", basename));
        }
      }
    } else {
      addCandidate(normalizedInput);
    }

    for (const candidate of candidates) {
      if (!fsSync.existsSync(candidate)) continue;
      const stats = fsSync.statSync(candidate);
      if (!stats.isFile()) continue;
      return fsSync.realpathSync(candidate);
    }

    throw new Error(`Document file was not found in this workspace: ${path.basename(rawPath)}`);
  }

  private assertWritablePath(filePath: string, workspacePath?: string): void {
    const allowedRoots = new Set<string>();
    if (workspacePath) {
      allowedRoots.add(fsSync.existsSync(workspacePath) ? fsSync.realpathSync(workspacePath) : path.resolve(workspacePath));
    }
    for (const workspace of this.workspaceRepo.findAll()) {
      if (fsSync.existsSync(workspace.path)) {
        allowedRoots.add(fsSync.realpathSync(workspace.path));
      }
      for (const allowedPath of workspace.permissions.allowedPaths || []) {
        if (fsSync.existsSync(allowedPath)) {
          allowedRoots.add(fsSync.realpathSync(allowedPath));
        } else {
          allowedRoots.add(path.resolve(allowedPath));
        }
      }
    }
    if (!ensureWithinAllowedRoots(filePath, Array.from(allowedRoots))) {
      throw new Error("Access denied: document path is outside the workspace or allowed paths.");
    }
  }

  listVersions(filePath: string, workspacePath?: string): DocumentVersionEntry[] {
    const resolvedPath = this.resolvePath(filePath, workspacePath);
    const { dir, ext, stem } = normalizeVersionBase(resolvedPath);
    const entries = fsSync
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(dir, entry.name))
      .filter((candidate) => {
        const candidateExt = path.extname(candidate).toLowerCase();
        if (candidateExt !== ext.toLowerCase()) return false;
        const candidateStem = path.basename(candidate, candidateExt).replace(/-v\d+$/i, "");
        return candidateStem === stem;
      })
      .sort((a, b) => versionSortKey(a) - versionSortKey(b));

    return entries.map((candidate) => {
      const artifact = this.artifactRepo.findLatestByPath(candidate);
      const stat = fsSync.statSync(candidate);
      return {
        path: candidate,
        fileName: path.basename(candidate),
        createdAt: artifact?.createdAt ?? stat.mtimeMs,
        taskId: artifact?.taskId,
        artifactId: artifact?.id,
        isCurrent: candidate === entries[entries.length - 1],
      };
    });
  }

  private buildNextVersionPath(currentPath: string): string {
    const versions = this.listVersions(currentPath);
    const latestPath = versions.length > 0 ? versions[versions.length - 1].path : currentPath;
    const { dir, ext, stem } = normalizeVersionBase(latestPath);
    const nextVersion = versions.length + 1;
    return path.join(dir, `${stem}-v${nextVersion}${ext}`);
  }

  private resolveWorkspaceForPath(filePath: string): Workspace {
    const workspace = this.workspaceRepo.findAll().find((item) => {
      const roots = [item.path, ...(item.permissions.allowedPaths || [])]
        .map((candidate) =>
          fsSync.existsSync(candidate) ? fsSync.realpathSync(candidate) : path.resolve(candidate),
        );
      return ensureWithinAllowedRoots(filePath, roots);
    });
    if (!workspace) {
      throw new Error("Could not resolve workspace for editable document.");
    }
    return workspace;
  }

  private createDirectDocumentTask(params: {
    session: SessionRecord;
    workspace: Workspace;
    title: string;
    prompt: string;
    instruction: string;
  }): Task {
    const hasParent = Boolean(
      params.session.sourceTaskId && this.taskRepo.findById(params.session.sourceTaskId),
    );
    const task = this.taskRepo.create({
      title: params.title,
      prompt: params.prompt,
      rawPrompt: params.prompt,
      userPrompt: params.instruction,
      status: "executing",
      workspaceId: params.workspace.id,
      parentTaskId: hasParent ? params.session.sourceTaskId : undefined,
      agentType: hasParent ? "sub" : "main",
      depth: hasParent ? 1 : 0,
      source: "manual",
    });
    this.agentDaemon.logEvent(task.id, "task_created", { task });
    this.agentDaemon.logEvent(task.id, "task_status", {
      status: "executing",
      message: "Starting inline document edit.",
    });
    return task;
  }

  private failDirectTask(
    taskId: string,
    message: string,
    failureClass: Task["failureClass"] = "tool_error",
  ): void {
    this.agentDaemon.failTask(taskId, message, {
      terminalStatus: "failed",
      failureClass,
    });
  }

  private async runDirectPdfEditTask(params: {
    task: Task;
    sourcePath: string;
    destPath: string;
    selection: PdfRegionSelection;
    instruction: string;
  }): Promise<void> {
    const { task, sourcePath, destPath, selection, instruction } = params;
    const stepId = "document_edit:pdf";
    try {
      this.agentDaemon.logEvent(task.id, "timeline_step_updated", {
        stepId,
        status: "in_progress",
        actor: "system",
        legacyType: "progress_update",
        message: "Applying PDF edit locally.",
      });
      await this.pdfRegionEditor.edit({
        sourcePath,
        destPath,
        pageIndex: selection.pageIndex,
        bbox: {
          x: selection.x,
          y: selection.y,
          w: selection.w,
          h: selection.h,
        },
        instruction,
        selectionText: selection.excerpt,
      });
      this.agentDaemon.logEvent(task.id, "file_created", {
        path: path.basename(destPath),
        type: "document",
        format: "pdf",
        action: "edit_pdf_region",
        pageIndex: selection.pageIndex,
        bbox: {
          x: selection.x,
          y: selection.y,
          w: selection.w,
          h: selection.h,
        },
      });
      this.agentDaemon.registerArtifact(task.id, destPath, "application/pdf");
      this.agentDaemon.logEvent(task.id, "artifact_created", {
        path: destPath,
        mimeType: "application/pdf",
        fileName: path.basename(destPath),
        message: `Created ${path.basename(destPath)}`,
      });
      this.agentDaemon.logEvent(task.id, "timeline_step_updated", {
        stepId,
        status: "completed",
        actor: "system",
        legacyType: "step_completed",
        message: `Created ${path.basename(destPath)}`,
      });
      const outputSummary: TaskOutputSummary = {
        created: [destPath],
        primaryOutputPath: destPath,
        outputCount: 1,
        folders: [path.dirname(destPath)],
      };
      this.agentDaemon.completeTask(task.id, `Created ${path.basename(destPath)}`, {
        outputSummary,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Inline PDF edit failed.";
      this.agentDaemon.logEvent(task.id, "timeline_step_updated", {
        stepId,
        status: "failed",
        actor: "system",
        legacyType: "step_failed",
        message,
      });
      this.failDirectTask(
        task.id,
        message,
        /not installed/i.test(message) ? "dependency_unavailable" : "tool_error",
      );
    }
  }

  async openSession(filePath: string, workspacePath?: string): Promise<DocumentEditorSession> {
    const resolvedPath = this.resolvePath(filePath, workspacePath);
    const fileType = getFileType(resolvedPath);
    if (!fileType) {
      throw new Error("Only PDF and DOCX files are editable.");
    }

    this.assertWritablePath(resolvedPath, workspacePath);

    const versions = this.listVersions(resolvedPath, workspacePath);
    const currentVersion = versions[versions.length - 1];
    const currentPath = currentVersion?.path || resolvedPath;
    const sourceArtifact = this.artifactRepo.findLatestByPath(currentPath) || this.artifactRepo.findLatestByPath(resolvedPath);
    const sessionId = uuidv4();

    const session: DocumentEditorSession = {
      sessionId,
      filePath: resolvedPath,
      workspacePath,
      currentPath,
      currentFileName: path.basename(currentPath),
      fileType,
      sourceTaskId: sourceArtifact?.taskId,
      versions,
    };

    if (fileType === "pdf") {
      const pdfBytes = await fs.readFile(currentPath);
      session.pdfDataBase64 = pdfBytes.toString("base64");
      session.pdfReviewSummary = await extractPdfReviewData(currentPath, {
        maxPages: 12,
        maxCharsPerPage: 1600,
        maxOcrPages: 4,
        includeOcr: true,
      });
    } else {
      const docxBytes = await fs.readFile(currentPath);
      const blocks = await parseDocxBlocksFromBuffer(docxBytes);
      session.docxBlocks = blocks.map((block) => ({
        id: block.id,
        type: block.type,
        text: block.text,
        level: block.level,
        rows: block.rows,
        order: block.order,
      }));
    }

    this.sessions.set(sessionId, {
      id: sessionId,
      workspacePath,
      basePath: resolvedPath,
      currentPath,
      fileType,
      sourceTaskId: sourceArtifact?.taskId,
    });

    return session;
  }

  private selectionPrompt(selection: PdfRegionSelection | DocxBlockSelection): string {
    if (selection.kind === "pdf") {
      return JSON.stringify({
        pageIndex: selection.pageIndex,
        bbox: {
          x: Number(selection.x.toFixed(4)),
          y: Number(selection.y.toFixed(4)),
          w: Number(selection.w.toFixed(4)),
          h: Number(selection.h.toFixed(4)),
        },
        excerpt: selection.excerpt || "",
      });
    }
    return JSON.stringify({
      blockIds: selection.blockIds,
      excerpt: selection.excerpt || "",
    });
  }

  async startEditTask(request: DocumentEditRequest): Promise<Task> {
    const session = this.sessions.get(request.sessionId);
    if (!session) {
      throw new Error("Document editor session not found.");
    }
    const instruction = String(request.instruction || "").trim();
    if (!instruction) {
      throw new Error("Instruction is required.");
    }

    const workspace = this.resolveWorkspaceForPath(session.currentPath);

    if (session.fileType === "pdf") {
      const selection = request.selection as PdfRegionSelection;
      const destPathAbs = this.buildNextVersionPath(session.currentPath);
      const prompt =
        `Apply this inline PDF edit directly without planner orchestration.\n` +
        `Source: ${session.currentPath}\nDestination: ${destPathAbs}\n` +
        `Instruction: ${instruction}\nSelection: ${this.selectionPrompt(selection)}`;
      const task = this.createDirectDocumentTask({
        session,
        workspace,
        title: `Edit ${path.basename(session.currentPath)}`,
        prompt,
        instruction,
      });
      setTimeout(() => {
        void this.runDirectPdfEditTask({
          task,
          sourcePath: session.currentPath,
          destPath: destPathAbs,
          selection,
          instruction,
        });
      }, 50);
      return task;
    }

    const destPathAbs = this.buildNextVersionPath(session.currentPath);
    const sourceRel = path.relative(workspace.path, session.currentPath);
    const destRel = path.relative(workspace.path, destPathAbs);

    const selection = request.selection as DocxBlockSelection;
    const prompt =
      `Edit the DOCX selection and create a new sibling version.\n` +
      `Use edit_document with action="replace_blocks", sourcePath="${sourceRel}", destPath="${destRel}", ` +
      `blockIds=${JSON.stringify(selection.blockIds)} and newContent as content blocks that satisfy the instruction.\n` +
      `Instruction: ${instruction}\n` +
      `Selected block context: ${this.selectionPrompt(selection)}.\n` +
      `Preserve unselected content. Do not overwrite the source file.`;

    const title = `Edit ${path.basename(session.currentPath)}`;
    const task =
      session.sourceTaskId && this.taskRepo.findById(session.sourceTaskId)
        ? await this.agentDaemon.createChildTask({
            title,
            prompt,
            userPrompt: instruction,
            workspaceId: workspace.id,
            parentTaskId: session.sourceTaskId,
            agentType: "sub",
            depth: 1,
          })
        : await this.agentDaemon.createTask({
            title,
            prompt,
            workspaceId: workspace.id,
            source: "manual",
          });

    return task;
  }
}
