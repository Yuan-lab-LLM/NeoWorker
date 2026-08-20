/**
 * DocumentTools — LLM-callable tools for generating documents, presentations,
 * and spreadsheets.  Registered in ToolRegistry alongside other tool classes.
 *
 * Tools:
 *   generate_document     → PDF (or HTML fallback)
 *   generate_presentation → PPTX
 *   generate_spreadsheet  → XLSX
 */

import * as fs from "fs";
import * as path from "path";
import { marked } from "marked";
import { LLMTool } from "../llm/types";
import { generatePDF } from "../../utils/document-generators/pdf-generator";
import { generateEPUB } from "../../utils/document-generators/epub-generator";
import { generateLandingPage } from "../../utils/document-generators/html-page-generator";
import { compileLatex } from "../../utils/document-generators/latex-compiler";
import {
  OfficeQualityReport,
  runOfficeDocumentQualityCheck,
} from "../../utils/office-document-quality";
import { getVoiceService } from "../../voice";
import { resolveVersionedOutputPath } from "../../utils/versioned-output-path";
import type { OfficeCliArtifactBuilder } from "../skills/officecli-artifact-builder";
import {
  buildAndPublishOfficeArtifact,
  OfficeArtifactPublishError,
} from "../../utils/office-artifact-publisher";
import { normalizePresentationArtifactInput } from "./office-artifact-input-normalizer";
import { selectOfficeTemplate } from "../../utils/office-template-registry";

function sanitizeFilename(raw: string, maxLen = 80): string {
  const normalized = (String(raw || "").trim() || "document").replace(
    /\\/g,
    "/",
  );
  const base = path.posix.basename(normalized).normalize("NFC");
  const sanitized = base
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_")
    .replace(/[. ]+$/g, "");
  return Array.from(sanitized || "document")
    .slice(0, maxLen)
    .join("");
}

function escapeHtmlText(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export class DocumentTools {
  constructor(
    private workspacePath: string,
    private taskId: string,
    private registerArtifact?: (
      taskId: string,
      filePath: string,
      mimeType: string,
      metadata?: Record<string, unknown>,
    ) => void,
    private reportProgress?: (
      message: string,
      metadata?: Record<string, unknown>,
    ) => void,
    private officeArtifactBuilderFactory?: () => Promise<OfficeCliArtifactBuilder>,
    private officeArtifactRequestId: string = taskId,
  ) {}

  setWorkspace(workspace: { path: string }): void {
    this.workspacePath = workspace.path;
  }

  private async resolveWorkspaceSourcePath(rawPath: string): Promise<string> {
    const requested = String(rawPath || "").trim();
    if (!requested) throw new Error("sourcePaths must contain non-empty paths");

    const workspaceRoot = await fs.promises.realpath(
      path.resolve(this.workspacePath),
    );
    const candidate = path.isAbsolute(requested)
      ? path.resolve(requested)
      : path.resolve(workspaceRoot, requested);
    const realCandidate = await fs.promises.realpath(candidate);
    const relative = path.relative(workspaceRoot, realCandidate);
    if (
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error(`Source file is outside the workspace: ${requested}`);
    }
    if (!/\.(?:md|markdown|txt)$/i.test(realCandidate)) {
      throw new Error(
        `Unsupported HTML conversion source: ${requested}. Use Markdown or text files.`,
      );
    }
    return realCandidate;
  }

  private async inspectOfficeArtifact(
    filePath: string,
  ): Promise<OfficeQualityReport> {
    return runOfficeDocumentQualityCheck(filePath, {
      renderPreview: true,
      onPhase: (phase, message) => {
        this.reportProgress?.(message, {
          phase,
          filePath,
          kind: "office_document_quality",
        });
      },
    });
  }

  /**
   * Keep the legacy generate_spreadsheet alias on the same OfficeCLI engine as
   * create_spreadsheet.  Packaged maintenance builds can provide the builder
   * outside app.asar, while normal builds load the bundled module.
   */
  private async createOfficeArtifactBuilder(): Promise<OfficeCliArtifactBuilder> {
    if (this.officeArtifactBuilderFactory) {
      return this.officeArtifactBuilderFactory();
    }
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
    const modulePath = await fs.promises
      .access(externalModulePath)
      .then(() => externalModulePath)
      .catch(() => bundledModulePath);
    const officeModule = await import(modulePath);
    return new officeModule.OfficeCliArtifactBuilder();
  }

  private reportOfficePublishPhase(
    format: "pptx" | "xlsx",
    phase: string,
    details?: Record<string, unknown>,
  ): void {
    const messages: Record<string, string> = {
      staging: "Office工具正在隔离区生成文件…",
      validating: "正在检查文件结构、内容与版式…",
      ready_to_publish: "文件已通过检查，正在准备发布…",
      published: "文件已通过检查并发布。",
      failed: "文件未通过交付检查，失败文件不会进入产物栏。",
    };
    this.reportProgress?.(messages[phase] || phase, {
      phase,
      kind: "office_artifact_publish",
      format,
      requestId: this.officeArtifactRequestId,
      ...details,
    });
  }

  // ── Tool definitions ────────────────────────────────────────────

  static getToolDefinitions(): LLMTool[] {
    return [
      {
        name: "compile_latex",
        description:
          "Compile a workspace .tex file into a PDF using a system LaTeX engine. " +
          "Use this after writing LaTeX/TikZ source when the user asks for a compiled paper or PDF. " +
          "Uses tectonic, latexmk, xelatex, lualatex, or pdflatex when installed.",
        input_schema: {
          type: "object" as const,
          properties: {
            sourcePath: {
              type: "string",
              description:
                'Workspace-relative or absolute path to the .tex file (e.g. "paper.tex")',
            },
            outputPath: {
              type: "string",
              description:
                'Optional workspace-contained PDF path (e.g. "paper.pdf")',
            },
            engine: {
              type: "string",
              enum: [
                "auto",
                "tectonic",
                "latexmk",
                "xelatex",
                "lualatex",
                "pdflatex",
              ],
              description: "Optional compiler preference. Defaults to auto.",
            },
          },
          required: ["sourcePath"],
        },
      },
      {
        name: "generate_document",
        description:
          "Generate a styled PDF document from markdown content or structured sections. " +
          "Use this when the user asks you to create a report, document, or PDF. " +
          "Returns the file path of the generated document.",
        input_schema: {
          type: "object" as const,
          properties: {
            filename: {
              type: "string",
              description: 'Output filename (e.g. "quarterly-report.pdf")',
            },
            title: { type: "string", description: "Document title" },
            titleColor: {
              type: "string",
              description: "Optional hex color applied to document headings",
            },
            author: { type: "string", description: "Author name (optional)" },
            markdown: {
              type: "string",
              description: "Full document content in markdown format",
            },
            sections: {
              type: "array",
              description: "Alternative: structured sections with headings",
              items: {
                type: "object",
                properties: {
                  heading: { type: "string" },
                  content: { type: "string" },
                },
                required: ["content"],
              },
            },
          },
          required: ["filename"],
        },
      },
      {
        name: "generate_presentation",
        description:
          "Generate a PowerPoint (PPTX) presentation from structured slide data. " +
          "Use this when the user asks you to create a presentation, deck, or slides. " +
          "After generation, NeoWorker validates the Office structure, scans for layout/content issues, " +
          "and renders a preview when OfficeCLI is available. Review qualityCheck before claiming the deck is final.",
        input_schema: {
          type: "object" as const,
          properties: {
            filename: {
              type: "string",
              description: 'Output filename (e.g. "pitch-deck.pptx")',
            },
            title: { type: "string", description: "Presentation title" },
            author: { type: "string", description: "Author name (optional)" },
            audience: {
              type: "string",
              description: "Audience or viewing context",
            },
            tone: {
              type: "string",
              description:
                "Tone for the deck, such as work, editorial, playful, premium, or technical",
            },
            visualMode: {
              type: "string",
              enum: [
                "work",
                "editorial",
                "playful",
                "premium",
                "technical",
                "research",
              ],
              description:
                "Visual direction for the deck. Use research for investment, market, valuation, and evidence-led analysis decks.",
            },
            styleBrief: {
              type: "string",
              description:
                "Short design brief describing desired look, rhythm, and anti-patterns",
            },
            titleColor: {
              type: "string",
              description: "Optional hex color applied to every slide title",
            },
            brand: {
              type: "object",
              description: "Optional brand hints for color, type, and naming",
              properties: {
                name: { type: "string" },
                primaryColor: { type: "string" },
                secondaryColor: { type: "string" },
                accentColor: { type: "string" },
                titleColor: { type: "string" },
                fontFace: { type: "string" },
              },
            },
            template: {
              type: "object",
              description:
                "Optional template/design-system hint; v1 uses this as design guidance",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                description: { type: "string" },
              },
            },
            assets: {
              type: "array",
              description:
                "Reusable local or remote raster assets that slides can reference by id",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  path: { type: "string" },
                  url: { type: "string" },
                  alt: { type: "string" },
                },
              },
            },
            slides: {
              type: "array",
              description: "Array of slide definitions",
              items: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Slide title" },
                  subtitle: {
                    type: "string",
                    description: "Slide subtitle (title slides only)",
                  },
                  intent: {
                    type: "string",
                    description: "The single job this slide should perform",
                  },
                  visualBrief: {
                    type: "string",
                    description: "Slide-specific design or imagery guidance",
                  },
                  slideType: {
                    type: "string",
                    enum: [
                      "cover",
                      "content",
                      "image",
                      "quote",
                      "timeline",
                      "comparison",
                      "process",
                      "chart",
                      "table",
                      "section",
                      "product",
                      "metric",
                      "closing",
                      "blank",
                    ],
                    description: "Specific editable layout family to use",
                  },
                  layoutHint: {
                    type: "string",
                    description: "Natural-language layout hint",
                  },
                  bullets: {
                    type: "array",
                    items: { type: "string" },
                    description: "Bullet points for content slides",
                  },
                  content: {
                    type: "string",
                    description: "Free-text content paragraph",
                  },
                  quote: {
                    type: "string",
                    description: "Large quote text for quote slides",
                  },
                  attribution: {
                    type: "string",
                    description: "Quote attribution or source label",
                  },
                  image: {
                    type: "object",
                    description:
                      "Optional local/remote raster image or reusable asset reference",
                    properties: {
                      id: { type: "string" },
                      path: { type: "string" },
                      url: { type: "string" },
                      width: { type: "number" },
                      height: { type: "number" },
                      alt: { type: "string" },
                    },
                  },
                  data: {
                    type: "object",
                    description:
                      "Structured data for editable chart, table, timeline, or metric slides",
                    properties: {
                      categories: { type: "array", items: { type: "string" } },
                      series: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            name: { type: "string" },
                            values: {
                              type: "array",
                              items: { type: "number" },
                            },
                          },
                        },
                      },
                      headers: { type: "array", items: { type: "string" } },
                      rows: {
                        type: "array",
                        items: {
                          type: "array",
                          items: {},
                        },
                      },
                      items: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            label: { type: "string" },
                            value: {},
                            detail: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                  notes: { type: "string", description: "Speaker notes" },
                  layout: {
                    type: "string",
                    enum: [
                      "title",
                      "content",
                      "section",
                      "blank",
                      "cover",
                      "image",
                      "quote",
                      "timeline",
                      "comparison",
                      "process",
                      "chart",
                      "table",
                      "product",
                      "metric",
                      "closing",
                    ],
                    description:
                      "Backward-compatible layout type or richer slide layout family",
                  },
                },
              },
            },
          },
          required: ["filename", "slides"],
        },
      },
      {
        name: "generate_spreadsheet",
        description:
          "Generate an Excel (XLSX) spreadsheet with NeoWorker's bundled Office tool from structured data with headers and rows. " +
          "Use this when the user asks you to create a spreadsheet, table, or data export. " +
          "The workbook is registered only after the same Office tool passes structural validation. " +
          "A failed workbook is removed and never appears as a deliverable.",
        input_schema: {
          type: "object" as const,
          properties: {
            filename: {
              type: "string",
              description: 'Output filename (e.g. "analysis.xlsx")',
            },
            title: { type: "string", description: "Workbook title" },
            sheets: {
              type: "array",
              description: "Array of sheet definitions",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Sheet tab name" },
                  headers: {
                    type: "array",
                    items: { type: "string" },
                    description: "Column header names",
                  },
                  rows: {
                    type: "array",
                    description: "Data rows (arrays of values)",
                    items: {
                      type: "array",
                      items: {},
                    },
                  },
                  columnWidths: {
                    type: "array",
                    items: { type: "number" },
                    description: "Optional column widths",
                  },
                },
                required: ["name", "headers", "rows"],
              },
            },
          },
          required: ["filename", "sheets"],
        },
      },
      {
        name: "generate_epub",
        description:
          "Generate an EPUB ebook from chapter content. " +
          "Use this when the user asks for a novel, manuscript, or ebook export. " +
          "Returns the file path of the generated EPUB.",
        input_schema: {
          type: "object" as const,
          properties: {
            filename: {
              type: "string",
              description: 'Output filename (e.g. "novel.epub")',
            },
            title: { type: "string", description: "Book title" },
            author: { type: "string", description: "Author name (optional)" },
            language: {
              type: "string",
              description: "Language code (default: en)",
            },
            description: {
              type: "string",
              description: "Back-cover description (optional)",
            },
            publisher: {
              type: "string",
              description: "Publisher name (optional)",
            },
            chapters: {
              type: "array",
              description: "Ordered chapter list",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  content: { type: "string" },
                },
                required: ["title", "content"],
              },
            },
          },
          required: ["filename", "title", "chapters"],
        },
      },
      {
        name: "generate_landing_page",
        description:
          "Generate a polished standalone HTML landing page. " +
          "Use this when the user asks for a project site, book landing page, or public summary page. " +
          "Returns the file path of the generated HTML page.",
        input_schema: {
          type: "object" as const,
          properties: {
            filename: {
              type: "string",
              description: 'Output filename (e.g. "index.html")',
            },
            title: { type: "string", description: "Page title" },
            subtitle: { type: "string", description: "Supporting subtitle" },
            description: {
              type: "string",
              description: "Longer description or intro",
            },
            author: { type: "string", description: "Author or byline" },
            accentColor: {
              type: "string",
              description: "Accent color hex code",
            },
            badge: { type: "string", description: "Small badge label" },
            callToAction: {
              type: "object",
              properties: {
                label: { type: "string" },
                href: { type: "string" },
              },
            },
            sections: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  content: { type: "string" },
                },
                required: ["title", "content"],
              },
            },
            footer: { type: "string", description: "Footer text" },
          },
          required: ["filename", "title"],
        },
      },
      {
        name: "convert_markdown_to_html",
        description:
          "Convert one or more existing workspace Markdown/text files into one polished, self-contained HTML artifact. " +
          "Use this for HTML exports of an existing report instead of copying the full document into write_file arguments. " +
          "Only source paths and the output filename are sent through the model, which avoids malformed large tool calls.",
        input_schema: {
          type: "object" as const,
          properties: {
            sourcePaths: {
              type: "array",
              items: { type: "string" },
              description:
                "Workspace-relative Markdown/text files in reading order",
            },
            sourcePath: {
              type: "string",
              description:
                "Single workspace-relative Markdown/text file (alternative to sourcePaths)",
            },
            filename: {
              type: "string",
              description: 'Output filename (for example "research-report.html")',
            },
            title: {
              type: "string",
              description:
                "Optional page title. Defaults to the first Markdown heading or source filename.",
            },
          },
          required: ["filename"],
        },
      },
      {
        name: "generate_narration_audio",
        description:
          "Generate narrated MP3 audio from text using the configured voice service. " +
          "Use this when the user asks for audiobook narration or spoken chapter output. " +
          "Returns the file path of the generated audio file.",
        input_schema: {
          type: "object" as const,
          properties: {
            filename: {
              type: "string",
              description: 'Output filename (e.g. "chapter-01.mp3")',
            },
            text: {
              type: "string",
              description: "Narration text to synthesize",
            },
            title: {
              type: "string",
              description: "Optional label for the narration track",
            },
          },
          required: ["filename", "text"],
        },
      },
    ];
  }

  // ── Tool execution ──────────────────────────────────────────────

  async compileLatex(input: Any): Promise<Any> {
    const result = await compileLatex({
      workspacePath: this.workspacePath,
      sourcePath: input.sourcePath,
      outputPath: input.outputPath,
      engine: input.engine || "auto",
    });

    if (result.success && this.registerArtifact) {
      this.registerArtifact(this.taskId, result.pdfPath, "application/pdf", {
        sourcePath: result.sourcePath,
        logPath: result.logPath,
        engine: result.engine,
        type: "latex_pdf",
      });
    }

    return {
      success: result.success,
      sourcePath: result.sourcePath,
      pdfPath: result.pdfPath,
      path: result.pdfPath,
      logPath: result.logPath,
      engine: result.engine,
      size: result.size,
      error: result.error,
      diagnostic: result.diagnostic,
      mimeType: "application/pdf",
      message: result.success
        ? `LaTeX compiled: ${path.basename(result.pdfPath)} (${formatBytes(result.size || 0)})`
        : `LaTeX compile failed: ${result.error || result.diagnostic}`,
    };
  }

  async generateDocument(input: Any): Promise<Any> {
    const filename = sanitizeFilename(input.filename || "document.pdf");
    const outputPath = resolveVersionedOutputPath(
      path.join(this.workspacePath, filename),
    );

    const result = await generatePDF(outputPath, {
      title: input.title,
      titleColor: input.titleColor,
      author: input.author,
      markdown: input.markdown,
      sections: input.sections,
    });

    if (result.success && this.registerArtifact) {
      const mime = result.path.endsWith(".pdf")
        ? "application/pdf"
        : "text/html";
      this.registerArtifact(this.taskId, result.path, mime);
    }

    return {
      success: result.success,
      path: result.path,
      size: result.size,
      message: `Document generated: ${path.basename(result.path)} (${formatBytes(result.size)})`,
    };
  }

  async generatePresentation(input: Any): Promise<Any> {
    const requestedFilename = sanitizeFilename(
      input.filename || "presentation.pptx",
    );
    const filename = requestedFilename.toLowerCase().endsWith(".pptx")
      ? requestedFilename
      : `${requestedFilename}.pptx`;
    const requestedSlides = Array.isArray(input.slides) ? input.slides : [];
    if (requestedSlides.length === 0) {
      return {
        success: false,
        error: "At least one slide is required.",
        generationEngine: "officecli",
      };
    }
    const planningStartedAt = Date.now();
    const normalizedInput = normalizePresentationArtifactInput(input);
    const slides = normalizedInput.slides.map((slide: Any) => ({
      ...slide,
      imagePath:
        slide.imagePath && !path.isAbsolute(slide.imagePath)
          ? path.resolve(this.workspacePath, slide.imagePath)
          : slide.imagePath,
    }));
    const officeBuilder = await this.createOfficeArtifactBuilder();
    const templateSelection = selectOfficeTemplate({
      format: "pptx",
      templateId: typeof input.templateId === "string" ? input.templateId : undefined,
      useCase: input.useCase,
      contentHint: `${normalizedInput.title || filename} ${slides.slice(0, 6).map((slide: Any) => slide.title).join(" ")}`,
    });
    const planningDurationMs = Date.now() - planningStartedAt;
    let published;
    try {
      published = await buildAndPublishOfficeArtifact({
        workspacePath: this.workspacePath,
        requestedPath: path.join(this.workspacePath, filename),
        requestId: this.officeArtifactRequestId,
        contentSnapshotId: this.taskId,
        skillVersion: "neoworker-presentation-planner@1",
        templateId: templateSelection.template.id,
        templateVersion: templateSelection.template.version,
        planningDurationMs,
        expectation: {
          format: "pptx",
          expectedSlideCount: slides.length,
          allowTitleOnlySlideNumbers: slides
            .map(
              (
                slide: { slideType?: string; layout?: string },
                index: number,
              ) => ({ slide, number: index + 1 }),
            )
            .filter(
              ({
                slide,
                number,
              }: {
                slide: { slideType?: string; layout?: string };
                number: number;
              }) =>
                number === 1 ||
                ["cover", "title", "section", "blank"].includes(
                  String(slide.slideType || slide.layout || ""),
                ),
            )
            .map(({ number }: { number: number }) => number),
        },
        build: (stagingPath) =>
          officeBuilder.createPresentation(stagingPath, slides, {
            title: normalizedInput.title,
            author: normalizedInput.author,
            audience: normalizedInput.audience,
            tone: normalizedInput.tone,
            visualMode: normalizedInput.visualMode || templateSelection.template.tokens.visualMode,
            styleBrief: normalizedInput.styleBrief,
            themeColor: normalizedInput.themeColor || templateSelection.template.tokens.primaryColor,
            accentColor: normalizedInput.accentColor || templateSelection.template.tokens.accentColor,
            titleColor: normalizedInput.titleColor || templateSelection.template.tokens.titleColor,
          }),
        inspect: (stagingPath) => this.inspectOfficeArtifact(stagingPath),
        onPhase: (phase, details) =>
          this.reportOfficePublishPhase("pptx", phase, details),
      });
    } catch (error) {
      if (!(error instanceof OfficeArtifactPublishError)) throw error;
      return {
        success: false,
        error: error.message,
        errorCode: error.code,
        generationEngine: "officecli",
        qualityCheck: error.details?.qualityCheck,
        integrityCheck: error.details?.integrityCheck,
        _modelReminder:
          "Office工具未通过交付检查，失败文件未发布、未登记。请修正内容后重试。",
      };
    }
    const qualityCheck = published.qualityCheck;

    if (this.registerArtifact && !published.deduplicated) {
      this.registerArtifact(
        this.taskId,
        published.path,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        {
          qualityStatus: qualityCheck.status,
          issueCount: qualityCheck.issueCount,
          previewPath: qualityCheck.previewPath,
          qualityEngine: qualityCheck.engine,
          generationEngine: "officecli",
          integrityCheck: published.integrityCheck,
          officeArtifactStatus: published.manifest.status,
          officeArtifactId: published.manifest.artifactId,
          officeManifest: published.manifest,
        },
      );
    }

    return {
      success: true,
      path: published.path,
      size: published.size,
      slideCount: slides.length,
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      generationEngine: "officecli",
      qualityCheck,
      integrityCheck: published.integrityCheck,
      manifest: published.manifest,
      deduplicated: published.deduplicated === true,
      _modelReminder: qualityCheck.modelGuidance,
      message:
        `Presentation generated with Office工具: ${path.basename(published.path)} (${slides.length} slides, ${formatBytes(published.size)}). ${qualityCheck.summary}`.trim(),
    };
  }

  async generateSpreadsheet(input: Any): Promise<Any> {
    const planningStartedAt = Date.now();
    const requestedFilename = sanitizeFilename(input.filename || "data.xlsx");
    const filename = requestedFilename.toLowerCase().endsWith(".xlsx")
      ? requestedFilename
      : `${requestedFilename}.xlsx`;
    const sheets = Array.isArray(input.sheets)
      ? input.sheets.map((sheet: Any, index: number) => {
          const headers = Array.isArray(sheet?.headers) ? sheet.headers : [];
          const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
          return {
            name: String(sheet?.name || `Sheet${index + 1}`),
            data: headers.length > 0 ? [headers, ...rows] : rows,
            columnWidths: Array.isArray(sheet?.columnWidths)
              ? sheet.columnWidths
              : undefined,
            hasHeader: headers.length > 0,
          };
        })
      : [];
    if (sheets.length === 0) {
      return {
        success: false,
        error: "At least one worksheet is required.",
        generationEngine: "officecli",
      };
    }

    const officeBuilder = await this.createOfficeArtifactBuilder();
    const templateSelection = selectOfficeTemplate({
      format: "xlsx",
      templateId: typeof input.templateId === "string" ? input.templateId : undefined,
      useCase: input.useCase,
      contentHint: `${filename} ${sheets.map((sheet: Any) => sheet.name).join(" ")}`,
    });
    const planningDurationMs = Date.now() - planningStartedAt;
    let published;
    try {
      published = await buildAndPublishOfficeArtifact({
        workspacePath: this.workspacePath,
        requestedPath: path.join(this.workspacePath, filename),
        requestId: this.officeArtifactRequestId,
        contentSnapshotId: this.taskId,
        skillVersion: "neoworker-spreadsheet-planner@1",
        templateId: templateSelection.template.id,
        templateVersion: templateSelection.template.version,
        planningDurationMs,
        expectation: {
          format: "xlsx",
          expectedSheetCount: sheets.length,
          expectedNonEmptySheetCount: sheets.filter(
            (sheet: { data: unknown[][] }) =>
              Array.isArray(sheet.data) && sheet.data.length > 0,
          ).length,
        },
        build: (stagingPath) =>
          officeBuilder.createSpreadsheet(stagingPath, sheets, {
            primaryColor: templateSelection.template.tokens.primaryColor,
            accentColor: templateSelection.template.tokens.accentColor,
            titleColor: templateSelection.template.tokens.titleColor,
          }),
        inspect: (stagingPath) => this.inspectOfficeArtifact(stagingPath),
        onPhase: (phase, details) =>
          this.reportOfficePublishPhase("xlsx", phase, details),
      });
    } catch (error) {
      if (!(error instanceof OfficeArtifactPublishError)) throw error;
      return {
        success: false,
        error: error.message,
        errorCode: error.code,
        generationEngine: "officecli",
        qualityCheck: error.details?.qualityCheck,
        integrityCheck: error.details?.integrityCheck,
        _modelReminder:
          "Office工具未通过交付检查，失败文件未发布、未登记。请修正输入后重试。",
        message:
          "Spreadsheet generation failed delivery validation; the invalid file was removed and was not registered.",
      };
    }
    const qualityCheck = published.qualityCheck;

    if (this.registerArtifact && !published.deduplicated) {
      this.registerArtifact(
        this.taskId,
        published.path,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        {
          qualityStatus: qualityCheck.status,
          issueCount: qualityCheck.issueCount,
          previewPath: qualityCheck.previewPath,
          qualityEngine: qualityCheck.engine,
          generationEngine: "officecli",
          integrityCheck: published.integrityCheck,
          officeArtifactStatus: published.manifest.status,
          officeArtifactId: published.manifest.artifactId,
          officeManifest: published.manifest,
        },
      );
    }

    return {
      success: true,
      path: published.path,
      size: published.size,
      sheetCount: sheets.length,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      generationEngine: "officecli",
      qualityCheck,
      integrityCheck: published.integrityCheck,
      manifest: published.manifest,
      deduplicated: published.deduplicated === true,
      _modelReminder: qualityCheck.modelGuidance,
      message:
        `Spreadsheet generated with Office工具: ${path.basename(published.path)} (${sheets.length} sheet(s), ${formatBytes(published.size)}). ${qualityCheck.summary}`.trim(),
    };
  }

  async generateEPUB(input: Any): Promise<Any> {
    const filename = sanitizeFilename(input.filename || "novel.epub");
    const outputPath = resolveVersionedOutputPath(
      path.join(this.workspacePath, filename),
    );

    const result = await generateEPUB(outputPath, {
      title: String(input.title || "Untitled"),
      author: input.author,
      language: input.language,
      description: input.description,
      publisher: input.publisher,
      chapters: Array.isArray(input.chapters) ? input.chapters : [],
    });

    if (result.success && this.registerArtifact) {
      this.registerArtifact(this.taskId, result.path, "application/epub+zip");
    }

    return {
      success: result.success,
      path: result.path,
      size: result.size,
      chapterCount: result.chapterCount,
      message: `EPUB generated: ${path.basename(result.path)} (${result.chapterCount} chapter(s), ${formatBytes(result.size)})`,
    };
  }

  async generateLandingPage(input: Any): Promise<Any> {
    const filename = sanitizeFilename(input.filename || "index.html");
    const outputPath = resolveVersionedOutputPath(
      path.join(this.workspacePath, filename),
    );

    const result = await generateLandingPage(outputPath, {
      title: String(input.title || "Untitled"),
      subtitle: input.subtitle,
      description: input.description,
      author: input.author,
      accentColor: input.accentColor,
      badge: input.badge,
      callToAction: input.callToAction,
      sections: Array.isArray(input.sections) ? input.sections : [],
      footer: input.footer,
    });

    if (result.success && this.registerArtifact) {
      this.registerArtifact(this.taskId, result.path, "text/html");
    }

    return {
      success: result.success,
      path: result.path,
      size: result.size,
      message: `Landing page generated: ${path.basename(result.path)} (${formatBytes(result.size)})`,
    };
  }

  async convertMarkdownToHtml(input: Any): Promise<Any> {
    const requestedSources: unknown[] = Array.isArray(input?.sourcePaths)
      ? (input.sourcePaths as unknown[])
      : input?.sourcePath
        ? [input.sourcePath]
        : [];
    const sourcePaths: string[] = Array.from(
      new Set<string>(
        requestedSources
          .map((value: unknown) => String(value || "").trim())
          .filter(Boolean),
      ),
    ).slice(0, 16);
    if (sourcePaths.length === 0) {
      throw new Error(
        "convert_markdown_to_html requires sourcePath or sourcePaths",
      );
    }

    const resolvedSources = await Promise.all(
      sourcePaths.map((sourcePath) =>
        this.resolveWorkspaceSourcePath(sourcePath),
      ),
    );
    const markdownParts = await Promise.all(
      resolvedSources.map((sourcePath) => fs.promises.readFile(sourcePath, "utf8")),
    );
    const markdown = markdownParts.join("\n\n---\n\n");
    if (!markdown.trim()) {
      throw new Error("The selected Markdown source is empty");
    }

    const firstHeading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const title = String(
      input?.title ||
        firstHeading ||
        path.basename(
          resolvedSources[0],
          path.extname(resolvedSources[0]),
        ),
    ).trim();
    const rendered = await marked.parse(markdown, {
      async: false,
      gfm: true,
      breaks: true,
    });
    const safeTitle = escapeHtmlText(title || "Document");
    const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <style>
    :root{color-scheme:light;--ink:#172033;--muted:#657086;--line:#e5eaf1;--accent:#1677ff;--paper:#fff;--bg:#f4f7fb}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",Arial,sans-serif;line-height:1.75}
    main{width:min(960px,calc(100% - 32px));margin:40px auto;padding:56px 64px 72px;background:var(--paper);border:1px solid var(--line);border-radius:20px;box-shadow:0 18px 55px rgba(25,42,70,.08)}
    h1,h2,h3,h4{line-height:1.3;letter-spacing:-.02em;margin:1.55em 0 .6em}h1{font-size:2.35rem;margin-top:0;padding-bottom:.55em;border-bottom:1px solid var(--line)}h2{font-size:1.55rem}h3{font-size:1.2rem}
    p,li{font-size:1rem}a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}strong{font-weight:700}hr{border:0;border-top:1px solid var(--line);margin:2.5rem 0}
    blockquote{margin:1.5rem 0;padding:.8rem 1.2rem;border-left:4px solid var(--accent);background:#f2f7ff;color:#41506a;border-radius:0 10px 10px 0}
    code{font-family:"SFMono-Regular",Consolas,monospace;background:#f1f4f8;padding:.15em .38em;border-radius:5px;font-size:.92em}pre{overflow:auto;padding:18px 20px;background:#111827;color:#eef2ff;border-radius:12px}pre code{background:transparent;padding:0;color:inherit}
    table{width:100%;border-collapse:separate;border-spacing:0;margin:1.5rem 0;border:1px solid var(--line);border-radius:12px;overflow:hidden}th,td{padding:11px 14px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{background:#f6f8fb}tr:last-child td{border-bottom:0}th:last-child,td:last-child{border-right:0}
    img{max-width:100%;height:auto;border-radius:10px}@media(max-width:680px){main{margin:0;width:100%;padding:32px 22px;border:0;border-radius:0}h1{font-size:1.85rem}}
    @media print{body{background:#fff}main{width:100%;margin:0;padding:0;border:0;box-shadow:none}}
  </style>
</head>
<body><main>${rendered}</main></body>
</html>
`;

    let filename = sanitizeFilename(input?.filename || "document.html");
    if (!/\.html?$/i.test(filename)) filename += ".html";
    const outputPath = resolveVersionedOutputPath(
      path.join(this.workspacePath, filename),
    );
    await fs.promises.writeFile(outputPath, html, "utf8");
    const stat = await fs.promises.stat(outputPath);
    if (stat.size <= 0 || !html.includes('<meta charset="utf-8">')) {
      throw new Error("Generated HTML failed integrity validation");
    }

    this.registerArtifact?.(this.taskId, outputPath, "text/html", {
      sourcePaths: sourcePaths.map((sourcePath) => sourcePath.replace(/\\/g, "/")),
      conversion: "markdown_to_html",
    });

    return {
      success: true,
      path: outputPath,
      size: stat.size,
      sourcePaths,
      message: `HTML generated: ${path.basename(outputPath)} (${formatBytes(stat.size)})`,
    };
  }

  async generateNarrationAudio(input: Any): Promise<Any> {
    const MAX_NARRATION_TEXT_LENGTH = 25_000; // TTS providers typically limit input
    const filename = sanitizeFilename(input.filename || "narration.mp3");
    const outputPath = resolveVersionedOutputPath(
      path.join(this.workspacePath, filename),
    );
    const text = String(input.text || "").trim();

    if (!text) {
      return {
        success: false,
        error: "text is required",
      };
    }
    if (text.length > MAX_NARRATION_TEXT_LENGTH) {
      return {
        success: false,
        error: `Text exceeds max length (${MAX_NARRATION_TEXT_LENGTH} chars). Split into shorter segments.`,
      };
    }

    const voiceService = getVoiceService();
    const audioBuffer = await voiceService.speak(text);
    if (!audioBuffer || audioBuffer.length === 0) {
      return {
        success: false,
        error:
          "Narration audio could not be generated. Check voice settings and API keys in Settings > Voice.",
      };
    }

    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.promises.writeFile(outputPath, audioBuffer);
    const stat = await fs.promises.stat(outputPath);
    if (this.registerArtifact) {
      this.registerArtifact(this.taskId, outputPath, "audio/mpeg");
    }

    return {
      success: true,
      path: outputPath,
      size: stat.size,
      message: `Narration audio generated: ${path.basename(outputPath)} (${formatBytes(stat.size)})`,
    };
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
