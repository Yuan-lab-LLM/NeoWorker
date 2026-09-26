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
import { createHash, randomUUID } from "crypto";
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
import { inspectOfficeTranslation, applyOfficeTranslation, translationUnitIssue } from "../../documents/office-translation";
import { fitPptxTranslation } from "../../documents/pptx-translation-layout";
import { MAX_TRANSLATION_BATCH_UNITS, summarizeTranslationBatch, translationUnitKey } from "../../documents/translation-batches";
import { reviewTranslationUnits } from "../../documents/translation-review";
import { translationTextIssue } from "../../documents/translation-text";

// Serialize checkpoint read/modify/write across tasks sharing a workspace.
const translationQueues = new Map<string, Promise<void>>();
// Bump this when the native PPTX fit gate changes. Older checkpoints may have
// exhausted their retry budget because they were measured by the previous
// checker; carrying that counter forward would permanently strand them.
const PPTX_LAYOUT_REPAIR_VERSION = 5;

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
        name: "office_translation",
        description: "Translate existing PPTX/DOCX/XLSX preserving native structure. Inspect sourcePath with targetLanguage once. The host returns translationId and manages paths. Stage with translationId, batchId and translations [{key,text}] for nextUnits. Valid entries are saved even if some need repair; only repair the returned nextUnits. Never read/rewrite checkpoint JSON or use shell to recover progress. Stop automatic retries if retryable=false. Repeat until remaining=0, then apply with translationId and a new filename. Keeps pictures, fonts, formulas and geometry. Complete paragraphs retain ⟦sN⟧ formatting anchors. PPT text boxes are measured and fitted within legible limits; overflow returns only the affected units for concise rewriting. Image pixels and full visual quality are not checked. Heuristics are not semantic accuracy verification. PDF/legacy formats require an agreed alternative.",
        input_schema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["inspect", "stage", "apply"] },
            translationId: { type: "string", description: "Opaque handle returned by inspect/stage. Pass it instead of sourcePath/translationsPath for stage/apply." },
            targetLanguage: { type: "string", description: "Target language for resumable inspect, e.g. English or Korean; keep this value consistent on resume" },
            batchId: { type: "string", description: "Exact batchId returned by the latest inspect/stage; required with translations" },
            translations: { type: "array", minItems: 1, maxItems: MAX_TRANSLATION_BATCH_UNITS, description: "Preferred stage input: one {key,text} per nextUnit, copying its short key. Order may differ, but keys must be unique and cover the batch exactly. Keep unchanged identifiers. Do not also supply units.", items: { type: "object", properties: { key: { type: "string" }, text: { type: "string" } }, required: ["key", "text"], additionalProperties: false } },
            units: { type: "array", minItems: 1, maxItems: MAX_TRANSLATION_BATCH_UNITS, description: "Alternative for partial/corrected stage batches: explicit ids and text. Do not also supply translations.", items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" } }, required: ["id", "text"] } },
            sourcePath: { type: "string", description: "Workspace path of the ORIGINAL source file" },
            translationsPath: { type: "string", description: "Legacy checkpoint path; unnecessary when translationId is supplied. Never read this file to recover a batch." },
            filename: { type: "string", description: "New output filename with same extension as source, required for apply" },
          },
          required: ["action"],
        },
      },
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
          "Typesets LaTeX math offline: $...$ inline, $$...$$ display, with fractions, scripts and equation tags. Preserve original equation images if transcription is uncertain. Returns the file path of the generated document.",
        input_schema: {
          type: "object" as const,
          properties: {
            filename: {
              type: "string",
              description: 'Output filename (e.g. "quarterly-report.pdf")',
            },
            title: { type: "string", description: "Document title" },
            templateId: {
              type: "string",
              enum: ["neoworker-academic-paper", "neoworker-docx-business-report"],
              description: "Use neoworker-academic-paper for papers and paper translations: serif body, restrained headings. Preserve original emphasis; do not add bold to whole paragraphs or ordinary sentences.",
            },
            titleColor: {
              type: "string",
              description: "Optional hex color applied to document headings",
            },
            author: { type: "string", description: "Author name (optional)" },
            markdown: {
              type: "string",
              description: "Full document content in markdown format",
            },
            markdown_path: { type: "string", description: "Read the complete UTF-8 markdown manuscript from this workspace instead of repeating it in the tool call. Use either markdown or markdown_path." },
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
            sourcePath: { type: "string", description: "User-provided PPTX template. The host automatically uses native template filling, preserving the source masters, layouts and artwork. For existing-document translation use office_translation." },
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
              description:
                "Array of slide objects. Pass the objects directly; never JSON-stringify the array or its items.",
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

  async officeTranslation(input: Any, allowedSources?: string[]): Promise<Any> {
    const root = await fs.promises.realpath(this.workspacePath);
    const operation = (translationQueues.get(root) || Promise.resolve())
      .then(() => this.executeOfficeTranslation(input, root, allowedSources));
    const settled = operation.then(() => undefined, () => undefined);
    translationQueues.set(root, settled);
    try {
      return await operation;
    } finally {
      if (translationQueues.get(root) === settled) translationQueues.delete(root);
    }
  }

  private async executeOfficeTranslation(input: Any, root: string, allowedSources?: string[]): Promise<Any> {
    input = { ...input };
    const readContained = async (raw: unknown): Promise<Buffer> => {
      if (typeof raw !== "string" || !raw.trim()) throw new Error("必须提供有效的工作区文件路径。");
      const resolved = await fs.promises.realpath(path.resolve(root, raw));
      const relative = path.relative(root, resolved);
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error("翻译文件路径必须位于当前工作区内。");
      }
      return fs.promises.readFile(resolved);
    };
    const checkpointName = /^\.neoworker-translation-[a-f0-9]{16}-[a-f0-9]{16}(?:-v3)?\.json$/;
    if (input.translationId !== undefined) {
      if (typeof input.translationId !== "string" || !checkpointName.test(input.translationId)) {
        throw new Error("无效的 translationId；请使用 inspect 返回的句柄。");
      }
      const saved = JSON.parse((await readContained(input.translationId)).toString("utf8"));
      if (!saved.hostSourcePath) throw new Error("旧进度缺少源文件关联；请使用原 sourcePath 和 targetLanguage inspect 恢复。");
      if (input.sourcePath && await fs.promises.realpath(path.resolve(root, input.sourcePath)) !== await fs.promises.realpath(path.resolve(root, saved.hostSourcePath))) {
        throw new Error("translationId 与 sourcePath 不匹配。");
      }
      if (input.translationsPath && path.resolve(root, input.translationsPath) !== path.resolve(root, input.translationId)) {
        throw new Error("translationId 与 translationsPath 不匹配。");
      }
      input.sourcePath = saved.hostSourcePath;
      input.translationsPath = input.translationId;
    }
    const extension = path.extname(String(input?.sourcePath || "")).toLowerCase();
    if (![".pptx", ".docx", ".xlsx"].includes(extension)) {
      throw new Error("当前原版式翻译工具支持 PPTX、DOCX、XLSX；PDF 和旧版 Office 格式尚不支持，不能擅自更换模板或把图片移到附录。");
    }
    if (allowedSources?.length) {
      const actual = await fs.promises.realpath(path.resolve(root, String(input.sourcePath || "")));
      const allowed = await Promise.all(allowedSources.map((source) => fs.promises.realpath(source).catch(() => "")));
      if (!allowed.includes(actual)) throw new Error("翻译源文件必须是本轮指定的原附件，不能先新建文件再冒充原文件翻译。");
    }
    const source = await readContained(input.sourcePath);
    // Recover omitted legacy paths only from an exact batch/source match, never from a guessed language.
    if (input.action === "stage" && !input.translationsPath && typeof input.batchId === "string") {
      const sourceHash = createHash("sha256").update(source).digest("hex");
      const matches: string[] = [];
      for (const name of await fs.promises.readdir(root)) {
        if (!checkpointName.test(name) || !name.startsWith(`.neoworker-translation-${sourceHash.slice(0, 16)}-`)) continue;
        try {
          const saved = JSON.parse((await readContained(name)).toString("utf8"));
          if (saved.sourceSha256 === sourceHash && summarizeTranslationBatch(saved).batchId === input.batchId) matches.push(name);
        } catch { /* Ignore unrelated or invalid checkpoints; validate the selected one below. */ }
      }
      if (matches.length === 1) input.translationsPath = matches[0];
      else throw new Error("无法唯一恢复翻译批次；请用原 sourcePath 和 targetLanguage inspect，不要读取进度 JSON。");
    }
    const saveCheckpoint = async (destination: string, checkpoint: Any) => {
      const temporary = `${destination}.${randomUUID()}.tmp`;
      try {
        await fs.promises.writeFile(temporary, JSON.stringify(checkpoint), { flag: "wx" });
        await fs.promises.rename(temporary, destination);
      } finally { await fs.promises.rm(temporary, { force: true }); }
    };
    const checkpointResponse = (checkpoint: Any, checkpointPath: string) => ({
      translationId: path.basename(checkpointPath),
      translationsPath: path.relative(root, path.resolve(root, checkpointPath)),
      sourcePath: checkpoint.hostSourcePath,
      ...summarizeTranslationBatch(checkpoint),
    });
    const validateCheckpoint = (checkpoint: Any, expected: Any) => {
      const completed = new Set(Array.isArray(checkpoint?.completedUnitIds) ? checkpoint.completedUnitIds : []);
      const allowed = new Set(expected.units.map((unit: Any) => unit.id));
      if (checkpoint?.schema !== expected.schema || checkpoint.sourceSha256 !== expected.sourceSha256
        || typeof checkpoint.targetLanguage !== "string" || !checkpoint.targetLanguage.trim()
        || !Array.isArray(checkpoint.units) || checkpoint.units.length !== expected.units.length
        || checkpoint.units.some((unit: Any, index: number) => unit?.id !== expected.units[index].id
          || typeof unit.text !== "string" || (!completed.has(unit.id) && unit.text !== expected.units[index].text))
        || !Array.isArray(checkpoint.completedUnitIds)
        || new Set(checkpoint.completedUnitIds).size !== checkpoint.completedUnitIds.length
        || checkpoint.completedUnitIds.some((id: unknown) => !allowed.has(id))) {
        throw new Error("翻译进度损坏或与原文件不匹配；旧进度已保留，请修复进度文件后重试。");
      }
    };
    const reopenInvalidTranslations = (checkpoint: Any, expected: Any): string[] => {
      const completed = new Set(checkpoint.completedUnitIds);
      const invalid = checkpoint.units.filter((unit: Any, index: number) => completed.has(unit.id) && translationUnitIssue(expected.units[index], unit.text)).map((unit: Any) => unit.id);
      if (invalid.length) {
        const ids = new Set(invalid);
        checkpoint.completedUnitIds = checkpoint.completedUnitIds.filter((id: string) => !ids.has(id));
        checkpoint.repairUnitIds = invalid;
        checkpoint.units = checkpoint.units.map((unit: Any, index: number) => ids.has(unit.id) ? expected.units[index] : unit);
      }
      return invalid;
    };
    if (input.action === "inspect") {
      const manifest = await inspectOfficeTranslation(source);
      if (typeof input.targetLanguage === "string" && input.targetLanguage.trim()) {
        const language = input.targetLanguage.trim().toLowerCase();
        const languageKey = createHash("sha256").update(language).digest("hex").slice(0, 16);
        const checkpointPath = path.join(root, `.neoworker-translation-${manifest.sourceSha256.slice(0, 16)}-${languageKey}-v3.json`);
        let checkpoint: Any = { ...manifest, targetLanguage: language, completedUnitIds: [] };
        try {
          const existing = JSON.parse((await readContained(checkpointPath)).toString("utf8"));
          validateCheckpoint(existing, manifest);
          if (existing.targetLanguage === language) checkpoint = existing;
          else throw new Error("翻译进度与原文件不匹配，请保留旧进度并使用新的目标语言标识。");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          // Reuse legacy translations only when an old unit already covers the
          // same complete passage. Joining independently translated fragments
          // would preserve the missing-space/repeated-phrase bug in v3.
          const legacyPath = checkpointPath.replace(/-v3\.json$/, ".json");
          try {
            const legacy = JSON.parse((await readContained(legacyPath)).toString("utf8"));
            const legacySource = await inspectOfficeTranslation(source, legacy.schema);
            validateCheckpoint(legacy, legacySource);
            if (legacy.targetLanguage === language) {
              const completed = new Set(legacy.completedUnitIds);
              const reusable = new Map(legacySource.units.flatMap((unit, index) =>
                completed.has(unit.id) && !translationUnitIssue(unit, legacy.units[index].text)
                  ? [[translationUnitKey(unit), legacy.units[index].text] as const] : []));
              checkpoint.units = manifest.units.map((unit) => {
                const text = reusable.get(translationUnitKey(unit));
                if (typeof text !== "string" || translationUnitIssue(unit, text)) return unit;
                checkpoint.completedUnitIds.push(unit.id); return { ...unit, text };
              });
              checkpoint.migratedLegacyUnits = checkpoint.completedUnitIds.length;
            }
          } catch { /* The legacy file stays intact; v3 has its own checkpoint. */ }
          await fs.promises.writeFile(checkpointPath, JSON.stringify(checkpoint), { flag: "wx" });
        }
        checkpoint.hostSourcePath = path.relative(root, await fs.promises.realpath(path.resolve(root, input.sourcePath)));
        if (extension === ".pptx" && checkpoint.layoutRepairVersion !== PPTX_LAYOUT_REPAIR_VERSION) {
          // Recheck saved translations with the new renderer rather than
          // discarding work reopened only by the obsolete layout gate.
          const completed = new Set<string>(checkpoint.completedUnitIds);
          checkpoint.units = checkpoint.units.map((unit: Any, index: number) => {
            const saved = checkpoint.layoutRepairTexts?.[unit.id];
            if (!completed.has(unit.id) && typeof saved === "string" && !translationUnitIssue(manifest.units[index], saved)) {
              completed.add(unit.id); return { ...unit, text: saved };
            }
            return unit;
          });
          checkpoint.completedUnitIds = [...completed];
          checkpoint.repairUnitIds = (checkpoint.repairUnitIds || []).filter((id: string) => !completed.has(id));
          checkpoint.layoutRepairVersion = PPTX_LAYOUT_REPAIR_VERSION;
          checkpoint.layoutRepairAttempts = 0;
          checkpoint.layoutRepairStalledAttempts = 0;
          delete checkpoint.layoutRepairBestRemaining;
        }
        const repairIds = reopenInvalidTranslations(checkpoint, manifest);
        await saveCheckpoint(checkpointPath, checkpoint);
        return { success: true, ...checkpointResponse(checkpoint, checkpointPath), repairIds };
      }
      const manifestPath = resolveVersionedOutputPath(path.join(root, `.neoworker-translation-${manifest.sourceSha256.slice(0, 16)}.json`));
      await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), { flag: "wx" });
      return {
        success: true,
        manifestPath: path.relative(root, manifestPath),
        units: manifest.units.length,
        sourceSha256: manifest.sourceSha256,
        preview: manifest.units.slice(0, 8),
        guidance: "Read the complete manifest. Translate whole paragraphs coherently, retaining every id, schema and sourceSha256. Preserve all ⟦sN⟧ formatting anchors in order with words and spaces inside them. Keep proper names/identifiers unchanged where appropriate. Save a translated JSON manifest, then call office_translation with action=apply, the ORIGINAL sourcePath, translationsPath and a new filename. Image text is not editable by this tool.",
      };
    }
    if (input.action === "stage") {
      const checkpoint = JSON.parse((await readContained(input.translationsPath)).toString("utf8"));
      const expected = await inspectOfficeTranslation(source, checkpoint.schema);
      validateCheckpoint(checkpoint, expected);
      checkpoint.hostSourcePath = path.relative(root, await fs.promises.realpath(path.resolve(root, input.sourcePath)));
      const repairIds = reopenInvalidTranslations(checkpoint, expected);
      if (repairIds.length) {
        await saveCheckpoint(await fs.promises.realpath(path.resolve(root, input.translationsPath)), checkpoint);
        return { success: false, ...checkpointResponse(checkpoint, input.translationsPath), repairIds, retryable: true,
          message: "旧进度包含异常译文。有效结果已保留，请仅修复返回的 nextUnits；本次提交尚未应用。" };
      }
      let units = input.units;
      const issues: Array<{ key?: string; reason: string }> = [];
      const legacyRepairIds: string[] = [];
      let submittedBatch: ReturnType<typeof summarizeTranslationBatch> | undefined;
      if (input.translations !== undefined) {
        if (units !== undefined) throw new Error("units 和 translations 不能同时提供；请仅提交一种批次格式。");
        const batch = summarizeTranslationBatch(checkpoint);
        if (!batch.batchId || input.batchId !== batch.batchId) throw new Error("翻译批次已过期或不匹配；请使用相同目标语言 inspect 恢复进度，不要重复旧批次。");
        if (!Array.isArray(input.translations) || input.translations.length > MAX_TRANSLATION_BATCH_UNITS) throw new Error("translations 必须是有效批次数组，不能超过批次上限。");
        submittedBatch = batch;
        const keyedUnits = new Map(batch.nextUnits.map((unit) => [unit.key, unit]));
        const counts = new Map<string, number>();
        for (const item of input.translations) if (typeof item?.key === "string") counts.set(item.key, (counts.get(item.key) || 0) + 1);
        units = [];
        for (const item of input.translations) {
          const unit = keyedUnits.get(item?.key);
          const reason = !unit ? "unknown_or_missing_key" : counts.get(item.key)! > 1 ? "duplicate_key" : translationUnitIssue(unit, item.text);
          if (reason) issues.push({ key: typeof item?.key === "string" ? item.key.slice(0, 100) : undefined, reason });
          else units.push({ id: unit!.id, text: item.text });
        }
        for (const unit of batch.nextUnits) if (!counts.has(unit.key)) issues.push({ key: unit.key, reason: "missing_translation" });
      }
      if (!Array.isArray(units) || (!submittedBatch && units.length === 0) || units.length > MAX_TRANSLATION_BATCH_UNITS) throw new Error(`每批应包含 1 至 ${MAX_TRANSLATION_BATCH_UNITS} 个文字单元；请按返回的 nextUnits 处理。`);
      const allowed = new Set(expected.units.map((unit) => unit.id));
      const patch = new Map<string, string>();
      const seenIds = new Set<string>();
      for (const unit of units) {
        if (!allowed.has(unit?.id) || seenIds.has(unit.id)) throw new Error(`无效的翻译单元：${String(unit?.id).slice(0,180)}；请使用 inspect 返回的 key/id，不要重新翻译有效内容。`);
        seenIds.add(unit.id);
        const reason = translationUnitIssue(expected.units.find((sourceUnit: Any) => sourceUnit.id === unit.id)!, unit.text);
        if (reason) {
          issues.push({ key: unit.id, reason });
          legacyRepairIds.push(unit.id);
          continue;
        }
        patch.set(unit.id, unit.text);
      }
      const previous = new Map<string, string>(checkpoint.units.map((unit: Any) => [unit.id, unit.text]));
      // Reuse translations only for identical source text AND paragraph context.
      // Every native text object still retains its own ID and formatting.
      const reusable = new Map<string, string>();
      const conflicts = new Set<string>();
      for (const unit of expected.units) {
        const text = patch.get(unit.id);
        if (text === undefined) continue;
        const key = translationUnitKey(unit);
        if (reusable.has(key) && reusable.get(key) !== text) conflicts.add(key);
        reusable.set(key, text);
      }
      for (const unit of expected.units) {
        const key = translationUnitKey(unit);
        if (!patch.has(unit.id) && !checkpoint.completedUnitIds.includes(unit.id) && !conflicts.has(key) && reusable.has(key)) patch.set(unit.id, reusable.get(key)!);
      }
      checkpoint.units = expected.units.map((unit) => ({ ...unit, text: patch.get(unit.id) ?? previous.get(unit.id) ?? unit.text }));
      checkpoint.completedUnitIds = [...new Set([...checkpoint.completedUnitIds.filter((id: string) => allowed.has(id)), ...patch.keys()])];
      if (submittedBatch) checkpoint.repairUnitIds = submittedBatch.nextUnits.map((unit) => unit.id).filter((id) => !checkpoint.completedUnitIds.includes(id));
      else if (legacyRepairIds.length) {
        checkpoint.repairUnitIds = [...new Set([...(checkpoint.repairUnitIds || []), ...legacyRepairIds])];
        checkpoint.completedUnitIds = checkpoint.completedUnitIds.filter((id: string) => !legacyRepairIds.includes(id));
        checkpoint.units = checkpoint.units.map((unit: Any, index: number) => legacyRepairIds.includes(unit.id) ? expected.units[index] : unit);
      }
      checkpoint.noProgressAttempts = patch.size ? 0 : (checkpoint.noProgressAttempts || 0) + 1;
      const destination = await fs.promises.realpath(path.resolve(root, input.translationsPath));
      await saveCheckpoint(destination, checkpoint);
      const progress = summarizeTranslationBatch(checkpoint);
      this.reportProgress?.(`翻译进度：${progress.completed}/${progress.total}`, { phase: "translation", completed: progress.completed, total: progress.total });
      const needsAttention = checkpoint.noProgressAttempts >= 3;
      return { success: !issues.length, ...checkpointResponse(checkpoint, input.translationsPath), accepted: patch.size,
        issues, retryable: !needsAttention, needsAttention,
        ...(needsAttention ? { nextUnits: [], guidance: "Three submissions made no progress. Stop automatic retries and report the validation issues. Saved translations are intact; resume via inspect only after correcting the cause." } : {}),
        review: reviewTranslationUnits(expected.units, patch) };
    }
    if (input.action !== "apply") throw new Error("action 必须为 inspect、stage 或 apply。");
    if (typeof input.filename !== "string" || !input.filename.trim() || path.extname(input.filename).toLowerCase() !== extension) {
      throw new Error("翻译输出必须提供与源文件格式相同的新文件名。");
    }
    const manifest = JSON.parse((await readContained(input.translationsPath)).toString("utf8"));
    const expected = await inspectOfficeTranslation(source, manifest?.schema);
    if (manifest?.completedUnitIds !== undefined) validateCheckpoint(manifest, expected);
    if (Array.isArray(manifest.completedUnitIds)) {
      const repairIds = reopenInvalidTranslations(manifest, expected);
      if (repairIds.length) {
        await saveCheckpoint(await fs.promises.realpath(path.resolve(root, input.translationsPath)), manifest);
        return { success: false, ...checkpointResponse(manifest, input.translationsPath), repairIds, retryable: true,
          message: "发现异常字符，尚未生成交付文件。已保留有效译文，仅翻译 nextUnits 后再 apply。" };
      }
    }
    if (Array.isArray(manifest.completedUnitIds) && manifest.units.some((unit: Any) => !manifest.completedUnitIds.includes(unit.id))) throw new Error("翻译批次尚未全部完成，请 inspect 恢复进度并继续 stage；不能交付中间 JSON。");
    let output = await applyOfficeTranslation(source, manifest);
    let textFit: { checkedShapes: number; adjustedShapes: number; rotatedLabels?: number; minimumScale?: number; minimumAdjustedFontPt?: number } | undefined;
    if (extension === ".pptx") {
      if (manifest.layoutRepairVersion !== PPTX_LAYOUT_REPAIR_VERSION) {
        manifest.layoutRepairVersion = PPTX_LAYOUT_REPAIR_VERSION;
        manifest.layoutRepairAttempts = 0;
        manifest.layoutRepairStalledAttempts = 0;
        delete manifest.layoutRepairBestRemaining;
        await saveCheckpoint(await fs.promises.realpath(path.resolve(root, input.translationsPath)), manifest);
      }
      let fit: Awaited<ReturnType<typeof fitPptxTranslation>>;
      try {
        fit = await fitPptxTranslation(source, output, manifest);
      } catch (error) {
        return { success: false,
          ...(Array.isArray(manifest.completedUnitIds) ? checkpointResponse(manifest, input.translationsPath) : {}),
          retryable: false, needsAttention: true, nextUnits: [],
          textFit: { status: "renderer_failed", error: error instanceof Error ? error.message : String(error) },
          message: `译文已保存，但版式渲染器运行失败，尚未交付文件。${error instanceof Error ? error.message : String(error)}`,
          guidance: "Report the textFit.error diagnostic and preserve the completed translation checkpoint. Do not repeat apply, retranslate, rewrite the source, or create a replacement deck. Resume with the saved checkpoint after the renderer failure is corrected.",
        };
      }
      if (!fit.output) {
        const repairIds = [...new Set(fit.issues.flatMap((issue) => issue.unitIds))];
        if (Array.isArray(manifest.completedUnitIds) && repairIds.length) {
          const repair = new Set(repairIds);
          manifest.layoutRepairTexts = Object.fromEntries(manifest.units.filter((unit: Any) => repair.has(unit.id)).map((unit: Any) => [unit.id, unit.text]));
          manifest.completedUnitIds = manifest.completedUnitIds.filter((id: string) => !repair.has(id));
          manifest.repairUnitIds = repairIds;
          manifest.units = manifest.units.map((unit: Any, index: number) => repair.has(unit.id) ? expected.units[index] : unit);
          // A shrinking repair set is progress, even after three passes. Stop
          // repeated stalls, with a separate hard cap to bound total work.
          const bestRemaining = manifest.layoutRepairBestRemaining;
          manifest.layoutRepairStalledAttempts = typeof bestRemaining !== "number" || repairIds.length < bestRemaining
            ? 0 : (manifest.layoutRepairStalledAttempts || 0) + 1;
          manifest.layoutRepairBestRemaining = Math.min(bestRemaining ?? Infinity, repairIds.length);
          manifest.layoutRepairAttempts = (manifest.layoutRepairAttempts || 0) + 1;
          await saveCheckpoint(await fs.promises.realpath(path.resolve(root, input.translationsPath)), manifest);
        }
        const retryable = Array.isArray(manifest.completedUnitIds) && repairIds.length > 0
          && manifest.layoutRepairAttempts < 8 && manifest.layoutRepairStalledAttempts < 2 && fit.issues.every((issue) => ["translation_too_long", "translated_neighbor_text_overlap"].includes(issue.reason));
        return { success: false, ...(Array.isArray(manifest.completedUnitIds) ? checkpointResponse(manifest, input.translationsPath) : {}),
          retryable, needsAttention: !retryable, ...(retryable ? {} : { nextUnits: [] }), repairIds,
          textFit: { status: "needs_repair", checkedShapes: fit.checkedShapes,
            issues: fit.issues.map(({ slide, unitIds, reason }) => ({ slide, unitIds, reason })) },
          message: retryable
            ? "译文超出原文本框或与相邻文字过近，尚未生成交付文件。有效译文已保存；请结合 previousTranslation 将 nextUnits 改为简洁、完整的译文，保留事实和格式标记。禁止通过删除内容、裁切或继续缩小字号绕过检查。"
            : "译后版式未通过检查，自动修复已停止。有效译文已保存；请报告 textFit.issues 中的具体页码和原因，解决后再恢复，勿重复 apply 或丢弃已译内容。",
          ...(!retryable ? { guidance: "Stop automatic retries. Report textFit.issues and preserve the saved translation checkpoint. Resume only after the cause is corrected." } : {}),
        };
      }
      output = fit.output;
      textFit = { checkedShapes: fit.checkedShapes, adjustedShapes: fit.adjustedShapes, rotatedLabels: fit.rotatedLabels, minimumScale: fit.minimumScale, minimumAdjustedFontPt: fit.minimumAdjustedFontPt };
    }
    const deliveryKey = createHash("sha256").update(source).update(JSON.stringify(manifest)).update(input.filename).digest("hex");
    const receiptPath = path.join(root, `.neoworker-translation-delivery-${deliveryKey}.json`);
    let outputPath: string | undefined;
    try {
      const receipt = JSON.parse((await readContained(receiptPath)).toString("utf8"));
      if (typeof receipt.path === "string" && path.basename(receipt.path) === receipt.path && (await readContained(receipt.path)).equals(output)) outputPath = path.join(root, receipt.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const reusedExistingArtifact = Boolean(outputPath);
    outputPath ||= resolveVersionedOutputPath(path.join(root, sanitizeFilename(input.filename, 180)));
    if (path.extname(outputPath).toLowerCase() !== extension) throw new Error("输出文件名无效。");
    if (!reusedExistingArtifact) {
      await fs.promises.writeFile(outputPath, output, { flag: "wx" });
      // Save before registration so retrying a failed durable copy reuses the file.
      const temporary = `${receiptPath}.${randomUUID()}.tmp`;
      try {
        await fs.promises.writeFile(temporary, JSON.stringify({ path: path.basename(outputPath) }), { flag: "wx" });
        await fs.promises.rename(temporary, receiptPath);
      } finally { await fs.promises.rm(temporary, { force: true }); }
    }
    const mimeType = extension === ".pptx"
      ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      : extension === ".xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    this.registerArtifact?.(this.taskId, outputPath, mimeType, { sourcePath: input.sourcePath, sourceFidelity: "verified" });
    return {
      success: true,
      path: path.relative(root, outputPath),
      reusedExistingArtifact,
      sourcePath: input.sourcePath,
      size: output.length,
      mimeType,
      sourceFidelity: { verified: true, scope: "native package structure and non-text parts", textUnits: manifest.units.length },
      visualCheck: "not_performed",
      ...(textFit ? { textFit: { status: "passed", ...textFit, renderer: "officecli_chromium" } } : {}),
      review: reviewTranslationUnits(expected.units, new Map(manifest.units.map((unit: Any) => [unit.id, unit.text]))),
      _modelReminder: "Native source structure, images, fonts, formulas and geometry were verified unchanged; PPT text boxes may use measured native autofit. If textFit.rotatedLabels is nonzero, narrow CJK labels were adapted to sideways Latin text inside their original frames; disclose that adjustment. textFit reports rendered editable text bounds only, not a full visual or translation accuracy review. Inspect rendered pages before claiming visual QA. Disclose that text inside images, embedded objects and calculated fields was not translated. Do not claim 0 issues or complete translation based on this check alone.",
    };
  }

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
    if (input.markdown_path && input.markdown) throw new Error("Use markdown or markdown_path, not both.");
    const manuscriptPath = input.markdown_path ? await this.resolveWorkspaceSourcePath(input.markdown_path) : undefined;
    const markdown = manuscriptPath
      ? await fs.promises.readFile(manuscriptPath, "utf8")
      : input.markdown;
    const filename = sanitizeFilename(input.filename || "document.pdf");
    const outputPath = resolveVersionedOutputPath(
      path.join(this.workspacePath, filename),
    );

    const result = await generatePDF(outputPath, {
      title: input.title,
      templateId: input.templateId,
      titleColor: input.titleColor,
      author: input.author,
      markdown,
      imageBasePath: manuscriptPath ? path.dirname(manuscriptPath) : this.workspacePath,
      imageRootPath: this.workspacePath,
      sections: input.sections,
    });

    if (result.success && this.registerArtifact) {
      const mime = result.path.endsWith(".pdf")
        ? "application/pdf"
        : "text/html";
      this.registerArtifact(this.taskId, result.path, mime, {
        workspaceOutputPath: result.path,
        manuscriptPath: manuscriptPath ? path.relative(fs.realpathSync.native(this.workspacePath), manuscriptPath) : undefined,
        requestedOutputPath: path.join(this.workspacePath, filename),
      });
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

    if (this.registerArtifact) {
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

    if (this.registerArtifact) {
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
