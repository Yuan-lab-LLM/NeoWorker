import { execFile } from "child_process";
import { createHash } from "crypto";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";
import {
  OfficeHtmlVisualRenderer,
  renderOfficeHtmlVisualEvidence,
} from "./office-html-visual-renderer";
import { getOfficeCliExecutableCandidates } from "./officecli-runtime";

const execFileAsync = promisify(execFile);
const SUPPORTED_EXTENSIONS = new Set([".docx", ".xlsx", ".pptx"]);
const DEFAULT_TIMEOUT_MS = 30_000;

export type OfficeQualityStatus = "passed" | "issues" | "skipped" | "failed";
export type OfficeQualityPhase =
  "detecting" | "validating" | "scanning" | "rendering" | "complete";

export interface OfficeQualityIssue {
  type?: string;
  severity?: string | number;
  message?: string;
  path?: string;
  [key: string]: unknown;
}

export interface OfficeQualityReport {
  available: boolean;
  engine: "officecli" | "builtin";
  status: OfficeQualityStatus;
  version?: string;
  validation?: {
    passed: boolean;
    message?: string;
  };
  issueCount?: number;
  issues?: OfficeQualityIssue[];
  previewPath?: string;
  visual?: {
    required: boolean;
    passed: boolean;
    evidencePath?: string;
    message: string;
  };
  warnings: string[];
  durationMs: number;
  summary: string;
  modelGuidance: string;
}

export interface OfficeCliCommandResult {
  stdout: string;
  stderr: string;
}

export type OfficeCliRunner = (
  executable: string,
  args: string[],
  timeoutMs: number,
) => Promise<OfficeCliCommandResult>;

export interface OfficeQualityOptions {
  executable?: string;
  renderPreview?: boolean;
  timeoutMs?: number;
  onPhase?: (phase: OfficeQualityPhase, message: string) => void;
  runner?: OfficeCliRunner;
  visualRenderer?: OfficeHtmlVisualRenderer;
}

interface OfficeCliPayload {
  success?: boolean;
  data?: unknown;
  message?: string;
}

const defaultRunner: OfficeCliRunner = async (executable, args, timeoutMs) => {
  try {
    const result = await execFileAsync(executable, args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });
    return {
      stdout: String(result.stdout || ""),
      stderr: String(result.stderr || ""),
    };
  } catch (error) {
    const commandError = error as Error & {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
    };
    const details = [
      commandError.message,
      commandError.stderr,
      commandError.stdout,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join("\n");
    throw new Error(details || "OfficeCLI command failed");
  }
};

let cachedExecutablePromise: Promise<{
  executable: string;
  version?: string;
} | null> | null = null;

export function parseOfficeCliJsonOutput(
  output: string,
): OfficeCliPayload | null {
  const trimmed = String(output || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as OfficeCliPayload;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as OfficeCliPayload;
    } catch {
      return null;
    }
  }
}

function candidateExecutables(explicit?: string): string[] {
  return getOfficeCliExecutableCandidates(explicit);
}

async function detectOfficeCli(
  runner: OfficeCliRunner,
  timeoutMs: number,
  explicit?: string,
): Promise<{ executable: string; version?: string } | null> {
  for (const executable of candidateExecutables(explicit)) {
    try {
      const result = await runner(
        executable,
        ["--version"],
        Math.min(timeoutMs, 5_000),
      );
      const version = `${result.stdout}\n${result.stderr}`
        .trim()
        .split(/\r?\n/)[0]
        ?.trim();
      return { executable, version: version || undefined };
    } catch {
      // Continue through common install locations before using the built-in fallback.
    }
  }
  return null;
}

function resolveOfficeCli(
  runner: OfficeCliRunner,
  timeoutMs: number,
  explicit?: string,
): Promise<{ executable: string; version?: string } | null> {
  if (explicit || runner !== defaultRunner) {
    return detectOfficeCli(runner, timeoutMs, explicit);
  }
  cachedExecutablePromise ||= detectOfficeCli(runner, timeoutMs);
  return cachedExecutablePromise;
}

function payloadMessage(
  payload: OfficeCliPayload | null,
  fallback: string,
): string {
  if (typeof payload?.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }
  if (typeof payload?.data === "string" && payload.data.trim()) {
    return payload.data.trim();
  }
  return fallback;
}

function buildPreviewPath(filePath: string, extension: "html" | "png"): string {
  const fileHash = createHash("sha1")
    .update(path.resolve(filePath))
    .digest("hex")
    .slice(0, 12);
  const base = path
    .basename(filePath, path.extname(filePath))
    .replace(/[^\p{L}\p{N}._-]+/gu, "-");
  return path.join(
    os.tmpdir(),
    "neoworker-office-previews",
    `${base || "document"}-${fileHash}.${extension}`,
  );
}

export async function runOfficeDocumentQualityCheck(
  filePath: string,
  options: OfficeQualityOptions = {},
): Promise<OfficeQualityReport> {
  const startedAt = Date.now();
  const extension = path.extname(filePath).toLowerCase();
  const timeoutMs = Math.max(5_000, options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const runner = options.runner || defaultRunner;
  const onPhase = options.onPhase;

  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    return {
      available: false,
      engine: "builtin",
      status: "skipped",
      warnings: [],
      durationMs: Date.now() - startedAt,
      summary: "This file type does not use OfficeCLI quality checks.",
      modelGuidance:
        "The file was generated without OfficeCLI because its format is not supported.",
    };
  }

  onPhase?.("detecting", "Preparing the Office document quality check...");
  const detected = await resolveOfficeCli(
    runner,
    timeoutMs,
    options.executable,
  );
  if (!detected) {
    return {
      available: false,
      engine: "builtin",
      status: "skipped",
      warnings: ["OfficeCLI is not installed or could not be started."],
      durationMs: Date.now() - startedAt,
      summary:
        "The document was generated using built-in compatibility mode; the OfficeCLI quality check was not run.",
      modelGuidance:
        "The Office file was created with the built-in generator. OfficeCLI was unavailable, so do not claim that structural or visual validation was completed.",
    };
  }

  const warnings: string[] = [];
  let validation: OfficeQualityReport["validation"];
  let issueCount: number | undefined;
  let issues: OfficeQualityIssue[] | undefined;
  let previewPath: string | undefined;
  const visualRequired =
    options.renderPreview !== false && (extension === ".docx" || extension === ".pptx");
  let visual: OfficeQualityReport["visual"] = {
    required: visualRequired,
    passed: !visualRequired,
    message: visualRequired
      ? "Full-document visual evidence has not been rendered yet."
      : "This format does not require a full-document screenshot gate.",
  };

  onPhase?.("validating", "Checking the Office file structure...");
  try {
    const result = await runner(
      detected.executable,
      ["validate", path.resolve(filePath), "--json"],
      timeoutMs,
    );
    const payload = parseOfficeCliJsonOutput(result.stdout);
    validation = {
      passed: payload?.success !== false,
      message: payloadMessage(
        payload,
        "Office OpenXML structure validation completed.",
      ),
    };
  } catch (error) {
    validation = {
      passed: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  onPhase?.("scanning", "Scanning content, formatting, and structure...");
  try {
    const result = await runner(
      detected.executable,
      ["view", path.resolve(filePath), "issues", "--json"],
      timeoutMs,
    );
    const payload = parseOfficeCliJsonOutput(result.stdout);
    const data =
      payload?.data && typeof payload.data === "object"
        ? (payload.data as Record<string, unknown>)
        : {};
    const rawIssues = Array.isArray(data.issues) ? data.issues : [];
    issues = rawIssues
      .filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === "object"),
      )
      .map((item) => ({ ...item }));
    issueCount =
      typeof data.count === "number" && Number.isFinite(data.count)
        ? data.count
        : issues.length;
  } catch (error) {
    warnings.push(
      `Issue scan could not be completed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (options.renderPreview !== false) {
    onPhase?.("rendering", "Rendering a visual preview and checking layout...");
    try {
      previewPath = buildPreviewPath(filePath, "html");
      await fs.mkdir(path.dirname(previewPath), { recursive: true });
      const result = await runner(
        detected.executable,
        ["view", path.resolve(filePath), "html", "-o", previewPath, "--json"],
        timeoutMs,
      );
      const payload = parseOfficeCliJsonOutput(result.stdout);
      if (payload?.success === false) {
        throw new Error(
          payloadMessage(payload, "Office preview generation failed."),
        );
      }
      if (typeof payload?.data === "string" && payload.data.trim()) {
        previewPath = payload.data.trim();
      }
    } catch (error) {
      previewPath = undefined;
      warnings.push(
        `Preview could not be generated: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (visualRequired) {
    onPhase?.("rendering", "Rendering every page or slide for visual verification...");
    const visualEvidencePath = buildPreviewPath(filePath, "png");
    try {
      await fs.mkdir(path.dirname(visualEvidencePath), { recursive: true });
      const result = await runner(
        detected.executable,
        [
          "view",
          path.resolve(filePath),
          "screenshot",
          "--grid",
          "auto",
          "-o",
          visualEvidencePath,
          "--json",
        ],
        timeoutMs,
      );
      const payload = parseOfficeCliJsonOutput(result.stdout);
      if (payload?.success === false) {
        throw new Error(
          payloadMessage(payload, "Office full-document rendering failed."),
        );
      }
      const evidencePath =
        typeof payload?.data === "string" && payload.data.trim()
          ? payload.data.trim()
          : visualEvidencePath;
      visual = {
        required: true,
        passed: true,
        evidencePath,
        message: "Every page or slide was rendered into visual evidence.",
      };
    } catch (officeCliRenderError) {
      const primaryMessage =
        officeCliRenderError instanceof Error
          ? officeCliRenderError.message
          : String(officeCliRenderError);
      if (previewPath) {
        try {
          const fallbackRenderer =
            options.visualRenderer || renderOfficeHtmlVisualEvidence;
          const fallback = await fallbackRenderer({
            htmlPath: previewPath,
            outputPath: visualEvidencePath,
          });
          warnings.push(
            "OfficeCLI's standalone screenshot renderer was unavailable; NeoWorker's embedded renderer completed the visual check.",
          );
          visual = {
            required: true,
            passed: true,
            evidencePath: fallback.evidencePath,
            message: `${fallback.pageCount} page(s) or slide(s) were rendered with NeoWorker's embedded Chromium renderer.`,
          };
        } catch (fallbackError) {
          const fallbackMessage =
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError);
          const message = `Full-document rendering failed. OfficeCLI: ${primaryMessage}. NeoWorker renderer: ${fallbackMessage}`;
          warnings.push(message);
          visual = {
            required: true,
            passed: false,
            message,
          };
        }
      } else {
        const message = `Full-document rendering failed: ${primaryMessage}. No HTML preview was available for NeoWorker's embedded renderer.`;
        warnings.push(message);
        visual = {
          required: true,
          passed: false,
          message,
        };
      }
    }
  }

  const status: OfficeQualityStatus =
    validation?.passed === false || (visual.required && !visual.passed)
      ? "failed"
      : (issueCount || 0) > 0
        ? "issues"
        : "passed";
  const summary =
    status === "failed"
      ? visual.required && !visual.passed
        ? "The Office file was generated, but full-document visual rendering failed."
        : "The Office file was generated, but structural validation failed."
      : status === "issues"
        ? `The Office file was generated, but the quality check found ${issueCount} issue(s) to address.`
        : previewPath
          ? "The Office file passed structural checks and a visual preview was completed."
          : "The Office file passed structural checks.";
  const modelGuidance =
    status === "failed"
      ? visual.required && !visual.passed
        ? "The Office file did not produce complete visual evidence. Do not publish it; repair the renderer or regenerate it."
        : "The Office file failed structural validation. Do not present it as final; inspect the validation message and repair or regenerate it."
      : status === "issues"
        ? `The Office file was created, but OfficeCLI found ${issueCount} issue(s). Review qualityCheck.issues and fix material problems before claiming the file is final.`
        : "The Office file passed OfficeCLI structural validation and issue scanning. A preview was rendered when supported.";

  onPhase?.("complete", summary);
  return {
    available: true,
    engine: "officecli",
    status,
    version: detected.version,
    validation,
    issueCount,
    issues,
    previewPath,
    visual,
    warnings,
    durationMs: Date.now() - startedAt,
    summary,
    modelGuidance,
  };
}
