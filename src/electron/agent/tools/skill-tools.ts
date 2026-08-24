import * as path from "path";
import * as fs from "fs/promises";
import { Workspace } from "../../../shared/types";
import { AgentDaemon } from "../daemon";
import { DocumentBuilder } from "../skills/document";
import type { OfficeCliArtifactBuilder } from "../skills/officecli-artifact-builder";
import { selectOfficeCliOfficialProfile } from "../skills/officecli-official-skills";
import {
  planOfficeDocument,
  planOfficePresentation,
  planOfficeSpreadsheet,
  type OfficePlanDiagnostic,
} from "../skills/office-format-planners";
import { FolderOrganizer } from "../skills/organizer";
import { editPdfRegion } from "../../documents/pdf-region-editor";
import {
  OfficeQualityReport,
  runOfficeDocumentQualityCheck,
} from "../../utils/office-document-quality";
import {
  buildAndPublishOfficeArtifact,
  OfficeArtifactPublishError,
} from "../../utils/office-artifact-publisher";
import {
  selectOfficeTemplate,
  type OfficeTemplateUseCase,
} from "../../utils/office-template-registry";
import { resolveVersionedOutputPath } from "../../utils/versioned-output-path";
import {
  contentBlocksToMarkdown,
  generatePDF,
} from "../../utils/document-generators/pdf-generator";
import type {
  CanonicalContentSnapshot,
  ContentConsumption,
  FormatFactProjection,
  OfficeArtifactFormat,
} from "../../utils/office-content-model";

interface OfficeContentReferenceInput {
  sectionIds?: string[];
  factIds?: string[];
  datasetIds?: string[];
  factValues?: Record<
    string,
    { value?: string | number; unit?: string; asOf?: string }
  >;
}

function buildContentGateInputs(
  format: OfficeArtifactFormat,
  elements: OfficeContentReferenceInput[],
  elementPrefix: string,
): {
  contentConsumption: ContentConsumption[];
  factProjections: FormatFactProjection[];
} {
  const contentConsumption = elements.map((element, index) => ({
    format,
    elementId: `${elementPrefix}-${index + 1}`,
    sectionIds: element.sectionIds || [],
    factIds: element.factIds || [],
    datasetIds: element.datasetIds || [],
  }));
  const factProjections = elements.flatMap((element, index) =>
    Object.entries(element.factValues || {}).map(([factId, projection]) => ({
      format,
      elementId: `${elementPrefix}-${index + 1}`,
      factId,
      ...projection,
    })),
  );
  return { contentConsumption, factProjections };
}

export function shouldRetryOfficeArtifactBuild(
  code: "BUILD_FAILED" | "EMPTY_OUTPUT" | "INTEGRITY_FAILED" | "QUALITY_FAILED",
): boolean {
  // The callback cannot mutate the planned content. Retrying integrity or
  // quality failures would therefore rebuild the same invalid artifact and
  // only multiply failure records. A single retry is reserved for failures
  // that may be caused by a transient OfficeCLI process or empty write.
  return code === "BUILD_FAILED" || code === "EMPTY_OUTPUT";
}

export function buildPublishedOfficeArtifactReminder(
  qualityCheck: OfficeQualityReport,
  manifest: Record<string, unknown>,
): string {
  const quality = manifest.quality as
    | { score?: { hardGatePassed?: boolean } }
    | undefined;
  if (
    manifest.status === "published" &&
    quality?.score?.hardGatePassed === true
  ) {
    return qualityCheck.status === "issues"
      ? "The Office artifact passed all release gates and was published. qualityCheck.issues contains advisory recommendations; do not regenerate unchanged content unless the user explicitly requested a zero-issue formatting pass."
      : "The Office artifact passed all release gates and was published successfully.";
  }
  return qualityCheck.modelGuidance;
}

/**
 * SkillTools implements high-level skills for document creation
 */
export class SkillTools {
  private documentBuilder: DocumentBuilder;
  private folderOrganizer: FolderOrganizer;

  constructor(
    private workspace: Workspace,
    private daemon: AgentDaemon,
    private taskId: string,
    private officeArtifactRequestId: string = taskId,
  ) {
    this.documentBuilder = new DocumentBuilder(workspace);
    this.folderOrganizer = new FolderOrganizer(workspace, daemon, taskId);
  }

  /**
   * Lazy-loading keeps the Office creation engine out of startup paths that do
   * not create Office files and lets packaged maintenance updates add the
   * engine without changing every caller bundle.
   */
  private async createOfficeArtifactBuilder(signal?: AbortSignal): Promise<OfficeCliArtifactBuilder> {
    const resourcesPath =
      process.resourcesPath || path.resolve(__dirname, "../../../../..");
    const externalModulePath = path.resolve(
      resourcesPath,
      "office-generation",
      "officecli-artifact-builder.js",
    );
    const bundledModulePath = path.resolve(
      __dirname,
      "../skills/officecli-artifact-builder.js",
    );
    const modulePath = await fs
      .access(externalModulePath)
      .then(() => externalModulePath)
      .catch(() => bundledModulePath);
    const officeModule = await import(modulePath);
    return new officeModule.OfficeCliArtifactBuilder(undefined, { signal });
  }

  /**
   * Update the workspace for this tool
   * Recreates all sub-builders with the new workspace
   */
  setWorkspace(workspace: Workspace): void {
    this.workspace = workspace;
    this.documentBuilder = new DocumentBuilder(workspace);
    this.folderOrganizer = new FolderOrganizer(
      workspace,
      this.daemon,
      this.taskId,
    );
  }

  private async inspectOfficeArtifact(
    filePath: string,
  ): Promise<OfficeQualityReport> {
    return runOfficeDocumentQualityCheck(filePath, {
      renderPreview: true,
      onPhase: (phase, message) => {
        this.daemon.logEvent(this.taskId, "progress_update", {
          message,
          phase,
          filePath,
          kind: "office_document_quality",
        });
      },
    });
  }

  private reportOfficePublishPhase(
    format: OfficeArtifactFormat,
    phase: string,
    details?: Record<string, unknown>,
  ): void {
    const messages: Record<string, string> = {
      staging: "Office工具正在隔离区生成文件…",
      validating: "正在检查文件结构、内容与版式…",
      repairing: "检查发现问题，Office工具正在进行有限自动修复…",
      ready_to_publish: "文件已通过检查，正在准备发布…",
      published: "文件已通过检查并发布。",
      cancelled: "已停止生成，暂存文件已清理。",
      failed: "文件未通过交付检查，失败文件不会进入产物栏。",
    };
    this.daemon.logEvent(this.taskId, "progress_update", {
      message: messages[phase] || phase,
      phase,
      kind: "office_artifact_publish",
      format,
      requestId: this.officeArtifactRequestId,
      ...details,
    });
  }

  private reportOfficePlan(format: OfficeArtifactFormat, diagnostics: OfficePlanDiagnostic[]): void {
    this.daemon.logEvent(this.taskId, "progress_update", {
      message:
        diagnostics.length > 0
          ? `Office工具已完成${format.toUpperCase()}内容与版式规划，并自动修复 ${diagnostics.filter((item) => item.level === "repair").length} 项。`
          : `Office工具已完成${format.toUpperCase()}内容与版式规划。`,
      phase: "planning_complete",
      kind: "office_artifact_plan",
      format,
      requestId: this.officeArtifactRequestId,
      diagnostics,
    });
  }

  /**
   * Keep the full workspace-relative path for generated artifacts. Returning
   * only a basename breaks files created in managed folders such as
   * `.neoworker/`: the UI then tries to open a different, non-existent file at
   * the workspace root.
   */
  private getWorkspaceRelativeArtifactPath(filePath: string): string {
    const relativePath = path.relative(this.workspace.path, filePath);
    const safeRelativePath =
      relativePath &&
      !relativePath.startsWith(`..${path.sep}`) &&
      relativePath !== ".."
        ? relativePath
        : path.basename(filePath);
    return safeRelativePath.split(path.sep).join("/");
  }

  /**
   * Create spreadsheet
   */
  async createSpreadsheet(input: {
    filename: string;
    officeProfile?: "excel" | "data-dashboard" | "financial-model";
    templateId?: string;
    useCase?: OfficeTemplateUseCase;
    contentSnapshot?: CanonicalContentSnapshot;
    sheets: Array<
      {
        name: string;
        data: Any[][];
        columnWidths?: number[];
        hasHeader?: boolean;
      } & OfficeContentReferenceInput
    >;
  }, execution: { signal?: AbortSignal } = {}): Promise<{
    success: boolean;
    path: string;
    size: number;
    mimeType: string;
    qualityCheck: OfficeQualityReport;
    deduplicated: boolean;
    _modelReminder: string;
  }> {
    if (!this.workspace.permissions.write) {
      throw new Error("Write permission not granted");
    }

    const filename = input.filename.endsWith(".xlsx")
      ? input.filename
      : `${input.filename}.xlsx`;

    const officeBuilder = await this.createOfficeArtifactBuilder(execution.signal);
    const planningStartedAt = Date.now();
    const spreadsheetPlan = planOfficeSpreadsheet(input.sheets);
    const plannedSheets = spreadsheetPlan.value;
    const officeProfile = selectOfficeCliOfficialProfile(
      "xlsx",
      `${filename} ${plannedSheets.map((sheet) => sheet.name).join(" ")} ${plannedSheets
        .slice(0, 2)
        .flatMap((sheet) => sheet.data.slice(0, 3).flat())
        .join(" ")}`,
      input.officeProfile,
    );
    const templateSelection = selectOfficeTemplate({
      format: "xlsx",
      templateId: input.templateId,
      useCase: input.useCase,
      contentHint: `${filename} ${plannedSheets.map((sheet) => sheet.name).join(" ")}`,
    });
    const planningDurationMs = Date.now() - planningStartedAt;
    this.reportOfficePlan("xlsx", spreadsheetPlan.diagnostics);
    const contentGate = buildContentGateInputs("xlsx", plannedSheets, "sheet");
    const published = await buildAndPublishOfficeArtifact({
      workspacePath: this.workspace.path,
      requestedPath: path.join(this.workspace.path, filename),
      requestId: this.officeArtifactRequestId,
      contentSnapshotId: input.contentSnapshot?.snapshotId || this.taskId,
      contentSnapshot: input.contentSnapshot,
      ...contentGate,
      skillVersion: `officecli-official:${officeProfile}@1`,
      templateId: templateSelection.template.id,
      templateVersion: templateSelection.template.version,
      planningDurationMs,
      signal: execution.signal,
      expectation: {
        format: "xlsx",
        expectedSheetCount: plannedSheets.length,
        expectedNonEmptySheetCount: plannedSheets.filter(
          (sheet) => Array.isArray(sheet.data) && sheet.data.length > 0,
        ).length,
      },
      build: (stagingPath) =>
        officeBuilder.createSpreadsheet(stagingPath, plannedSheets, {
          primaryColor: templateSelection.template.tokens.primaryColor,
          accentColor: templateSelection.template.tokens.accentColor,
          titleColor: templateSelection.template.tokens.titleColor,
          officialProfile: officeProfile,
        }),
      inspect: (stagingPath) => this.inspectOfficeArtifact(stagingPath),
      maxRepairAttempts: 1,
      repair: ({ code }) => shouldRetryOfficeArtifactBuild(code),
      onPhase: (phase, details) =>
        this.reportOfficePublishPhase("xlsx", phase, details),
    });
    const outputPath = published.path;
    const outputRelativePath = this.getWorkspaceRelativeArtifactPath(outputPath);
    const outputFilename = path.basename(outputPath);
    const mimeType =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const qualityCheck = published.qualityCheck;
    if (!published.deduplicated) {
      this.daemon.registerArtifact(this.taskId, outputPath, mimeType);

      this.daemon.logEvent(this.taskId, "file_created", {
      path: outputRelativePath,
      type: "spreadsheet",
      sheets: plannedSheets.length,
      size: published.size,
      qualityStatus: qualityCheck.status,
      issueCount: qualityCheck.issueCount,
      generationEngine: "officecli",
      integrityCheck: published.integrityCheck,
      officeArtifactStatus: published.manifest.status,
      officeArtifactId: published.manifest.artifactId,
      officeManifest: published.manifest,
      });
      this.daemon.logEvent(this.taskId, "artifact_created", {
      path: outputRelativePath,
      type: "spreadsheet",
      mimeType,
      size: published.size,
      sheets: plannedSheets.length,
      qualityStatus: qualityCheck.status,
      issueCount: qualityCheck.issueCount,
      previewPath: qualityCheck.previewPath,
      qualityEngine: qualityCheck.engine,
      generationEngine: "officecli",
      integrityCheck: published.integrityCheck,
      officeArtifactStatus: published.manifest.status,
      officeArtifactId: published.manifest.artifactId,
      officeManifest: published.manifest,
      label: outputFilename,
      });
    }

    return {
      success: true,
      path: outputRelativePath,
      size: published.size,
      mimeType,
      qualityCheck,
      deduplicated: published.deduplicated === true,
      _modelReminder: buildPublishedOfficeArtifactReminder(
        qualityCheck,
        published.manifest as unknown as Record<string, unknown>,
      ),
    };
  }

  /**
   * Create document
   */
  async createDocument(input: {
    filename: string;
    format: "docx" | "pdf";
    title?: string;
    subtitle?: string;
    author?: string;
    organization?: string;
    reportDate?: string;
    subject?: string;
    officeProfile?: "word" | "academic-paper" | "word-form";
    templateId?: string;
    useCase?: OfficeTemplateUseCase;
    content: Array<{
      type: string;
      text: string;
      level?: number;
      items?: string[];
      rows?: string[][];
      language?: string;
    } & OfficeContentReferenceInput>;
    contentSnapshot?: CanonicalContentSnapshot;
  }, execution: { signal?: AbortSignal } = {}): Promise<{
    success: boolean;
    path?: string;
    contentBlocks?: number;
    size?: number;
    mimeType: string;
    qualityCheck?: OfficeQualityReport;
    deduplicated: boolean;
    error?: string;
    errorCode?: string;
    _modelReminder?: string;
  }> {
    if (!this.workspace.permissions.write) {
      throw new Error("Write permission not granted");
    }

    // Log input for debugging
    const contentSummary = Array.isArray(input.content)
      ? `${input.content.length} blocks`
      : typeof input.content;
    console.log(
      `[SkillTools] createDocument called with: filename=${input.filename}, format=${input.format}, content=${contentSummary}`,
    );

    // Validate content before processing
    if (!input.content) {
      throw new Error(
        'Missing required "content" parameter. ' +
          "Please provide document content as an array of blocks, e.g.: " +
          '[{ type: "heading", text: "Title", level: 1 }, { type: "paragraph", text: "Content here" }]',
      );
    }

    const filename = input.filename.endsWith(`.${input.format}`)
      ? input.filename
      : `${input.filename}.${input.format}`;

    let outputPath: string;
    let outputSize: number;
    let qualityCheck: OfficeQualityReport | undefined;
    let integrityCheck: Record<string, unknown> | undefined;
    let officeManifest: Record<string, unknown> | undefined;
    let officeDeduplicated = false;
    let generationEngine = input.format === "docx" ? "officecli" : "electron-chromium";
    if (input.format === "docx") {
      const officeBuilder = await this.createOfficeArtifactBuilder(execution.signal);
      const planningStartedAt = Date.now();
      const documentPlan = planOfficeDocument(
        input.content,
        input.contentSnapshot?.title || path.basename(filename, ".docx"),
      );
      const plannedContent = documentPlan.value;
      const officeProfile = selectOfficeCliOfficialProfile(
        "docx",
        `${filename} ${plannedContent
          .slice(0, 8)
          .map((block) => block.text)
          .join(" ")}`,
        input.officeProfile,
      );
      const templateSelection = selectOfficeTemplate({
        format: "docx",
        templateId: input.templateId,
        useCase: input.useCase,
        contentHint: `${filename} ${plannedContent.slice(0, 4).map((block) => block.text).join(" ")}`,
      });
      const planningDurationMs = Date.now() - planningStartedAt;
      const documentTitle =
        String(input.title || input.contentSnapshot?.title || "").trim() ||
        plannedContent.find((block) => block.type === "heading")?.text ||
        path.basename(filename, ".docx");
      this.reportOfficePlan("docx", documentPlan.diagnostics);
      const contentGate = buildContentGateInputs(
        "docx",
        input.content,
        "block",
      );
      let published;
      try {
        published = await buildAndPublishOfficeArtifact({
          workspacePath: this.workspace.path,
          requestedPath: path.join(this.workspace.path, filename),
          requestId: this.officeArtifactRequestId,
          contentSnapshotId: input.contentSnapshot?.snapshotId || this.taskId,
          contentSnapshot: input.contentSnapshot,
          ...contentGate,
          skillVersion: `officecli-official:${officeProfile}@1`,
          templateId: templateSelection.template.id,
          templateVersion: templateSelection.template.version,
          planningDurationMs,
          signal: execution.signal,
          expectation: {
            format: "docx",
            minimumTextCharacters: input.content.reduce(
              (count, block) => count + String(block.text || "").trim().length,
              0,
            ) > 0
              ? 1
              : 0,
          },
          build: (stagingPath) =>
            officeBuilder.createDocument(stagingPath, plannedContent, {
              primaryColor: templateSelection.template.tokens.primaryColor,
              accentColor: templateSelection.template.tokens.accentColor,
              titleColor: templateSelection.template.tokens.titleColor,
              templateId: templateSelection.template.id,
              title: documentTitle,
              subtitle: input.subtitle,
              author: input.author || "NeoWorker",
              organization: input.organization,
              reportDate: input.reportDate,
              subject: input.subject,
              officialProfile: officeProfile,
            }),
          inspect: (stagingPath) => this.inspectOfficeArtifact(stagingPath),
          maxRepairAttempts: 1,
          repair: ({ code }) => shouldRetryOfficeArtifactBuild(code),
          onPhase: (phase, details) =>
            this.reportOfficePublishPhase("docx", phase, details),
        });
      } catch (error) {
        if (!(error instanceof OfficeArtifactPublishError)) throw error;
        const failedQualityCheck = error.details?.qualityCheck;
        return {
          success: false,
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          qualityCheck: failedQualityCheck,
          deduplicated: false,
          error: error.message,
          errorCode: error.code,
          _modelReminder: failedQualityCheck?.issues?.length
            ? "DOCX was not published. The complete OfficeCLI issue list is available in qualityCheck.issues; correct those specific issues before retrying."
            : "DOCX was not published because a delivery gate failed. Inspect errorCode, qualityCheck, and validation details before retrying.",
        };
      }
      outputPath = published.path;
      outputSize = published.size;
      qualityCheck = published.qualityCheck;
      integrityCheck = published.integrityCheck as unknown as Record<
        string,
        unknown
      >;
      officeManifest = published.manifest as unknown as Record<string, unknown>;
      officeDeduplicated = published.deduplicated === true;
    } else {
      const templateSelection = selectOfficeTemplate({
        format: "docx",
        templateId: input.templateId,
        useCase: input.useCase,
        contentHint: `${filename} ${input.content.slice(0, 4).map((block) => block.text).join(" ")}`,
      });
      outputPath = resolveVersionedOutputPath(
        path.join(this.workspace.path, filename),
      );
      const result = await generatePDF(outputPath, {
        title:
          input.title ||
          input.contentSnapshot?.title ||
          input.content.find((block) => block.type === "heading")?.text ||
          path.basename(filename, ".pdf"),
        subtitle: input.subtitle,
        author: input.author || "NeoWorker",
        organization: input.organization,
        reportDate: input.reportDate,
        subject: input.subject,
        templateId: templateSelection.template.id,
        titleColor: templateSelection.template.tokens.titleColor,
        markdown: contentBlocksToMarkdown(input.content),
        format: "A4",
      });
      generationEngine = result.generationEngine;
      qualityCheck = result.qualityCheck;
      const outputStat = await fs.stat(outputPath);
      if (!outputStat.isFile() || outputStat.size <= 0) {
        throw new Error(
          `Document was not written to the workspace: ${path.basename(outputPath)}`,
        );
      }
      outputSize = outputStat.size;
    }

    const outputRelativePath =
      this.getWorkspaceRelativeArtifactPath(outputPath);
    const outputFilename = path.basename(outputPath);
    const blockCount = Array.isArray(input.content) ? input.content.length : 1;
    const mimeType =
      input.format === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf";
    if (!officeDeduplicated) {
      this.daemon.registerArtifact(this.taskId, outputPath, mimeType);
    }
    console.log(
      `[SkillTools] Document created successfully: ${outputFilename} with ${blockCount} content blocks`,
    );

    if (!officeDeduplicated) {
      this.daemon.logEvent(this.taskId, "file_created", {
      path: outputRelativePath,
      type: "document",
      format: input.format,
      contentBlocks: blockCount,
      size: outputSize,
      qualityStatus: qualityCheck?.status,
      issueCount: qualityCheck?.issueCount,
      generationEngine,
      integrityCheck,
      officeArtifactStatus: input.format === "docx" ? "published" : undefined,
      officeArtifactId: officeManifest?.artifactId,
      officeManifest,
      });
      this.daemon.logEvent(this.taskId, "artifact_created", {
      path: outputRelativePath,
      type: "document",
      format: input.format,
      mimeType,
      size: outputSize,
      contentBlocks: blockCount,
      qualityStatus: qualityCheck?.status,
      issueCount: qualityCheck?.issueCount,
      previewPath: qualityCheck?.previewPath,
      qualityEngine: qualityCheck?.engine,
      generationEngine,
      integrityCheck,
      officeArtifactStatus: input.format === "docx" ? "published" : undefined,
      officeArtifactId: officeManifest?.artifactId,
      officeManifest,
      label: outputFilename,
      });
    }

    return {
      success: true,
      path: outputRelativePath,
      contentBlocks: blockCount,
      size: outputSize,
      mimeType,
      qualityCheck,
      deduplicated: officeDeduplicated,
      _modelReminder:
        qualityCheck && officeManifest
          ? buildPublishedOfficeArtifactReminder(
              qualityCheck,
              officeManifest,
            )
          : qualityCheck?.modelGuidance,
    };
  }

  /**
   * Edit an existing document with various operations
   * Supports: append (default), move_section, insert_after_section, list_sections
   */
  async editDocument(input: {
    sourcePath: string;
    destPath?: string;
    action?:
      | "append"
      | "move_section"
      | "insert_after_section"
      | "list_sections"
      | "replace_blocks";
    newContent?: Array<{
      type: string;
      text: string;
      level?: number;
      items?: string[];
      rows?: string[][];
    }>;
    blockIds?: string[];
    // For move_section action:
    sectionToMove?: string;
    afterSection?: string;
    // For insert_after_section action:
    insertAfterSection?: string;
  }): Promise<{
    success: boolean;
    path?: string;
    sectionsAdded?: number;
    message?: string;
    sections?: Array<{ number?: string; title: string; level: number }>;
  }> {
    if (!this.workspace.permissions.read) {
      throw new Error("Read permission not granted");
    }

    // Validate input
    if (!input.sourcePath) {
      throw new Error(
        'Missing required "sourcePath" parameter - the path to the existing document to edit',
      );
    }

    const action = input.action || "append";
    const inputPath = path.join(this.workspace.path, input.sourcePath);
    const outputPath = input.destPath
      ? path.join(this.workspace.path, input.destPath)
      : inputPath;

    console.log(
      `[SkillTools] editDocument called: action=${action}, source=${input.sourcePath}`,
    );

    // Handle list_sections action (read-only)
    if (action === "list_sections") {
      const sections = await this.documentBuilder.listSections(inputPath);
      console.log(
        `[SkillTools] Listed ${sections.length} sections in ${input.sourcePath}`,
      );
      return {
        success: true,
        path: input.sourcePath,
        sections,
        message: `Found ${sections.length} sections`,
      };
    }

    // All other actions require write permission
    if (!this.workspace.permissions.write) {
      throw new Error("Write permission not granted");
    }

    // Handle move_section action
    if (action === "move_section") {
      if (!input.sectionToMove) {
        throw new Error(
          'Missing required "sectionToMove" parameter for move_section action',
        );
      }
      if (!input.afterSection) {
        throw new Error(
          'Missing required "afterSection" parameter for move_section action',
        );
      }

      const result = await this.documentBuilder.moveSectionAfter(
        inputPath,
        outputPath,
        input.sectionToMove,
        input.afterSection,
      );

      if (!result.success) {
        throw new Error(result.message);
      }

      console.log(`[SkillTools] Section moved: ${result.message}`);

      this.daemon.logEvent(this.taskId, "file_modified", {
        path: input.destPath || input.sourcePath,
        type: "document",
        action: "move_section",
        sectionMoved: input.sectionToMove,
        afterSection: input.afterSection,
      });

      return {
        success: true,
        path: input.destPath || input.sourcePath,
        message: result.message,
      };
    }

    // Handle insert_after_section action
    if (action === "insert_after_section") {
      if (!input.insertAfterSection) {
        throw new Error(
          'Missing required "insertAfterSection" parameter for insert_after_section action',
        );
      }
      if (
        !input.newContent ||
        !Array.isArray(input.newContent) ||
        input.newContent.length === 0
      ) {
        throw new Error(
          'Missing or empty "newContent" parameter for insert_after_section action. ' +
            "Please provide content blocks to insert.",
        );
      }

      const result = await this.documentBuilder.insertAfterSection(
        inputPath,
        outputPath,
        input.insertAfterSection,
        input.newContent,
      );

      if (!result.success) {
        throw new Error(result.message);
      }

      console.log(
        `[SkillTools] Content inserted after section: ${result.message}`,
      );

      this.daemon.logEvent(this.taskId, "file_modified", {
        path: input.destPath || input.sourcePath,
        type: "document",
        action: "insert_after_section",
        afterSection: input.insertAfterSection,
        sectionsAdded: result.sectionsAdded,
      });

      return {
        success: true,
        path: input.destPath || input.sourcePath,
        sectionsAdded: result.sectionsAdded,
        message: result.message,
      };
    }

    if (action === "replace_blocks") {
      if (
        !input.blockIds ||
        !Array.isArray(input.blockIds) ||
        input.blockIds.length === 0
      ) {
        throw new Error(
          'Missing required "blockIds" parameter for replace_blocks action',
        );
      }
      if (
        !input.newContent ||
        !Array.isArray(input.newContent) ||
        input.newContent.length === 0
      ) {
        throw new Error(
          'Missing or empty "newContent" parameter for replace_blocks action. ' +
            "Please provide replacement content blocks.",
        );
      }

      const result = await this.documentBuilder.replaceBlocksById(
        inputPath,
        outputPath,
        input.blockIds,
        input.newContent,
      );

      if (!result.success) {
        throw new Error(result.message);
      }

      this.daemon.logEvent(this.taskId, "file_modified", {
        path: input.destPath || input.sourcePath,
        type: "document",
        action: "replace_blocks",
        blockIds: input.blockIds,
        sectionsAdded: result.sectionsAdded,
      });

      return {
        success: true,
        path: input.destPath || input.sourcePath,
        sectionsAdded: result.sectionsAdded,
        message: result.message,
      };
    }

    // Default action: append
    if (
      !input.newContent ||
      !Array.isArray(input.newContent) ||
      input.newContent.length === 0
    ) {
      throw new Error(
        'Missing or empty "newContent" parameter. ' +
          "Please provide new content as an array of blocks, e.g.: " +
          '[{ type: "heading", text: "New Section", level: 2 }, { type: "paragraph", text: "Content here" }]',
      );
    }

    console.log(
      `[SkillTools] editDocument append: dest=${input.destPath || "same"}, newContent=${input.newContent.length} blocks`,
    );

    const result = await this.documentBuilder.appendToDocument(
      inputPath,
      outputPath,
      input.newContent,
    );

    console.log(
      `[SkillTools] Document edited successfully: ${outputPath} with ${result.sectionsAdded} new sections`,
    );

    this.daemon.logEvent(this.taskId, "file_modified", {
      path: input.destPath || input.sourcePath,
      type: "document",
      sectionsAdded: result.sectionsAdded,
    });

    return {
      success: true,
      path: input.destPath || input.sourcePath,
      sectionsAdded: result.sectionsAdded,
    };
  }

  async editPdfRegion(input: {
    sourcePath: string;
    destPath: string;
    pageIndex: number;
    bbox: { x: number; y: number; w: number; h: number };
    instruction: string;
  }): Promise<{ success: boolean; path: string; message?: string }> {
    if (!this.workspace.permissions.read) {
      throw new Error("Read permission not granted");
    }
    if (!this.workspace.permissions.write) {
      throw new Error("Write permission not granted");
    }
    if (!input.sourcePath || !input.destPath) {
      throw new Error("sourcePath and destPath are required");
    }
    if (!input.instruction || !input.instruction.trim()) {
      throw new Error("instruction is required");
    }

    const workspaceRoot = path.resolve(this.workspace.path);
    const sourcePath = path.resolve(path.join(workspaceRoot, input.sourcePath));
    const destPath = path.resolve(path.join(workspaceRoot, input.destPath));
    const sep = path.sep;
    if (
      (!sourcePath.startsWith(workspaceRoot + sep) &&
        sourcePath !== workspaceRoot) ||
      (!destPath.startsWith(workspaceRoot + sep) && destPath !== workspaceRoot)
    ) {
      throw new Error("Path escapes workspace root");
    }
    await editPdfRegion({
      sourcePath,
      destPath,
      pageIndex: input.pageIndex,
      bbox: input.bbox,
      instruction: input.instruction,
    });

    this.daemon.logEvent(this.taskId, "file_created", {
      path: input.destPath,
      type: "document",
      format: "pdf",
      action: "edit_pdf_region",
      pageIndex: input.pageIndex,
      bbox: input.bbox,
    });

    return {
      success: true,
      path: input.destPath,
      message: "PDF region updated",
    };
  }

  /**
   * Create presentation
   */
  async createPresentation(input: {
    filename: string;
    generationMode?: "default" | "ppt-master";
    presentationWorkflow?: string;
    workflowArtifactRoot?: string;
    officeProfile?: "pptx" | "pitch-deck" | "morph-ppt" | "morph-ppt-3d";
    templateId?: string;
    useCase?: OfficeTemplateUseCase;
    title?: string;
    author?: string;
    audience?: string;
    tone?: string;
    visualMode?:
      | "work"
      | "editorial"
      | "playful"
      | "premium"
      | "technical"
      | "research";
    styleBrief?: string;
    themeColor?: string;
    accentColor?: string;
    titleColor?: string;
    contentSnapshot?: CanonicalContentSnapshot;
    slides: Array<{
      title: string;
      content?: string[];
      subtitle?: string;
      imagePath?: string;
      layout?:
        | "title"
        | "titleContent"
        | "twoColumn"
        | "imageOnly"
        | "blank"
        | "section"
        | "quote"
        | "timeline"
        | "comparison"
        | "process"
        | "chart"
        | "table"
        | "product"
        | "metric"
        | "closing";
      slideType?:
        | "cover"
        | "content"
        | "image"
        | "quote"
        | "timeline"
        | "comparison"
        | "process"
        | "chart"
        | "table"
        | "section"
        | "product"
        | "metric"
        | "closing"
        | "blank";
      visualBrief?: string;
      notes?: string;
      data?: {
        categories?: string[];
        series?: Array<{ name?: string; values?: Array<string | number> }>;
        headers?: string[];
        rows?: unknown[][];
        items?: Array<{ label?: string; value?: string | number; detail?: string }>;
      };
    } & OfficeContentReferenceInput>;
  }, execution: { signal?: AbortSignal } = {}): Promise<{
    success: boolean;
    path: string;
    size: number;
    mimeType: string;
    qualityCheck: OfficeQualityReport;
    deduplicated: boolean;
    _modelReminder: string;
  }> {
    if (!this.workspace.permissions.write) {
      throw new Error("Write permission not granted");
    }

    const filename = input.filename.endsWith(".pptx")
      ? input.filename
      : `${input.filename}.pptx`;

    if (!Array.isArray(input.slides) || input.slides.length === 0) {
      throw new Error("At least one slide is required.");
    }

    const officeBuilder = await this.createOfficeArtifactBuilder(execution.signal);
    const resolvedSlides = input.slides.map((slide) => ({
      ...slide,
      imagePath:
        slide.imagePath && !path.isAbsolute(slide.imagePath)
          ? path.resolve(this.workspace.path, slide.imagePath)
          : slide.imagePath,
    }));
    const planningStartedAt = Date.now();
    const presentationPlan = planOfficePresentation(
      resolvedSlides,
      input.contentSnapshot,
    );
    const slides = presentationPlan.value;
    const officeProfile = selectOfficeCliOfficialProfile(
      "pptx",
      `${input.title || filename} ${input.audience || ""} ${input.tone || ""} ${
        input.styleBrief || ""
      } ${slides
        .slice(0, 8)
        .map((slide) => `${slide.title} ${(slide.content || []).join(" ")}`)
        .join(" ")}`,
      input.officeProfile,
    );
    const templateSelection = selectOfficeTemplate({
      format: "pptx",
      templateId: input.templateId,
      useCase: input.useCase,
      contentHint: `${input.title || filename} ${slides.slice(0, 6).map((slide) => slide.title).join(" ")}`,
    });
    const planningDurationMs = Date.now() - planningStartedAt;
    this.reportOfficePlan("pptx", presentationPlan.diagnostics);
    const contentGate = buildContentGateInputs("pptx", slides, "slide");
    const published = await buildAndPublishOfficeArtifact({
      workspacePath: this.workspace.path,
      requestedPath: path.isAbsolute(filename)
        ? filename
        : path.join(this.workspace.path, filename),
      requestId: this.officeArtifactRequestId,
      contentSnapshotId: input.contentSnapshot?.snapshotId || this.taskId,
      contentSnapshot: input.contentSnapshot,
      ...contentGate,
      skillVersion: `officecli-official:${officeProfile}@1`,
      templateId: templateSelection.template.id,
      templateVersion: templateSelection.template.version,
      planningDurationMs,
      signal: execution.signal,
      expectation: {
        format: "pptx",
        expectedSlideCount: slides.length,
        allowTitleOnlySlideNumbers: slides
          .map((slide, index) => ({ slide, number: index + 1 }))
          .filter(
            ({ slide, number }) =>
              number === 1 ||
              ["cover", "title", "section", "blank"].includes(
                String(slide.slideType || slide.layout || ""),
              ),
          )
          .map(({ number }) => number),
      },
      build: (stagingPath) =>
        officeBuilder.createPresentation(stagingPath, slides, {
          title: input.title,
          author: input.author,
          audience: input.audience,
          tone: input.tone,
          visualMode: input.visualMode || templateSelection.template.tokens.visualMode,
          styleBrief: input.styleBrief,
          themeColor: input.themeColor || templateSelection.template.tokens.primaryColor,
          accentColor: input.accentColor || templateSelection.template.tokens.accentColor,
          titleColor: input.titleColor || templateSelection.template.tokens.titleColor,
          officialProfile: officeProfile,
          generationMode: input.generationMode,
          presentationWorkflow: input.presentationWorkflow,
        }),
      inspect: (stagingPath) => this.inspectOfficeArtifact(stagingPath),
      rejectQualityIssues: input.generationMode === "ppt-master",
      maxRepairAttempts: 1,
      repair: ({ code }) => shouldRetryOfficeArtifactBuild(code),
      onPhase: (phase, details) =>
        this.reportOfficePublishPhase("pptx", phase, details),
    });
    const outputPath = published.path;
    const outputRelativePath =
      this.getWorkspaceRelativeArtifactPath(outputPath);
    const outputFilename = path.basename(outputPath);
    const mimeType =
      "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    const qualityCheck = published.qualityCheck;
    const generationEngine =
      input.generationMode === "ppt-master"
        ? "officecli-ppt-master-v1"
        : "officecli";

    if (
      input.generationMode === "ppt-master" &&
      input.workflowArtifactRoot
    ) {
      const artifactRoot = path.resolve(input.workflowArtifactRoot);
      const validationDir = path.join(artifactRoot, "validation");
      const expectedOutputPath = path.join(
        artifactRoot,
        "output",
        "presentation.pptx",
      );
      if (path.resolve(outputPath) !== expectedOutputPath) {
        throw new Error(
          `PPT Master output escaped its canonical project directory: ${outputPath}`,
        );
      }
      await fs.mkdir(validationDir, { recursive: true });
      await fs.writeFile(
        path.join(validationDir, "workflow.log"),
        [
          `workflow=ppt-master`,
          `engine=${generationEngine}`,
          `output=${outputPath}`,
          `completedAt=${new Date().toISOString()}`,
        ].join("\n") + "\n",
        "utf8",
      );
      await fs.writeFile(
        path.join(validationDir, "pptx-delivery-check.json"),
        JSON.stringify(
          {
            schema: "ppt-master.pptx-delivery-check.v1",
            status: "passed",
            presentationWorkflow: "ppt-master",
            engine: generationEngine,
            slides: slides.length,
            file: {
              path: outputPath,
              bytes: published.size,
            },
            quality: {
              engine: qualityCheck.engine,
              version: qualityCheck.version,
              status: qualityCheck.status,
              validationPassed: qualityCheck.validation?.passed === true,
              issueCount: qualityCheck.issueCount || 0,
              visualRequired: qualityCheck.visual?.required === true,
              visualPassed: qualityCheck.visual?.passed === true,
              visualEvidencePath: qualityCheck.visual?.evidencePath,
            },
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
    }
    if (!published.deduplicated) {
      this.daemon.registerArtifact(this.taskId, outputPath, mimeType);

      this.daemon.logEvent(this.taskId, "file_created", {
      path: outputRelativePath,
      type: "presentation",
      slides: input.slides.length,
      size: published.size,
      qualityStatus: qualityCheck.status,
      issueCount: qualityCheck.issueCount,
      generationEngine,
      integrityCheck: published.integrityCheck,
      officeArtifactStatus: published.manifest.status,
      officeArtifactId: published.manifest.artifactId,
      officeManifest: published.manifest,
      });
      this.daemon.logEvent(this.taskId, "artifact_created", {
      path: outputRelativePath,
      type: "presentation",
      mimeType,
      size: published.size,
      slides: input.slides.length,
      qualityStatus: qualityCheck.status,
      issueCount: qualityCheck.issueCount,
      previewPath: qualityCheck.previewPath,
      qualityEngine: qualityCheck.engine,
      generationEngine,
      integrityCheck: published.integrityCheck,
      officeArtifactStatus: published.manifest.status,
      officeArtifactId: published.manifest.artifactId,
      officeManifest: published.manifest,
      label: outputFilename,
      });
    }

    return {
      success: true,
      path: outputRelativePath,
      size: published.size,
      mimeType,
      qualityCheck,
      deduplicated: published.deduplicated === true,
      _modelReminder: buildPublishedOfficeArtifactReminder(
        qualityCheck,
        published.manifest as unknown as Record<string, unknown>,
      ),
    };
  }

  /**
   * Organize folder
   */
  async organizeFolder(input: {
    path: string;
    strategy: "by_type" | "by_date" | "custom";
    rules?: Any;
  }): Promise<{ success: boolean; changes: number }> {
    if (!this.workspace.permissions.write) {
      throw new Error("Write permission not granted");
    }

    const changes = await this.folderOrganizer.organize(
      input.path,
      input.strategy,
      input.rules,
    );

    this.daemon.logEvent(this.taskId, "file_modified", {
      action: "organize",
      path: input.path,
      strategy: input.strategy,
      changes,
    });

    return {
      success: true,
      changes,
    };
  }
}
