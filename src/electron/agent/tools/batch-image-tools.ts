import { exec, execFile } from "child_process";
import { promisify } from "util";
import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import { Workspace } from "../../../shared/types";
import { AgentDaemon } from "../daemon";
import { LLMTool } from "../llm/types";

type Any = any; // oxlint-disable-line typescript-eslint(no-explicit-any)

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const PROCESS_TIMEOUT_MS = 60_000;
const PROTECTED_WRITE_PATHS = [
  "/System",
  "/Library",
  "/usr",
  "/bin",
  "/sbin",
  "/etc",
  "/var",
  "/private",
  "C:\\Windows",
  "C:\\Program Files",
  "C:\\Program Files (x86)",
];

export type ImageOutputFormat = "png" | "jpeg" | "webp";
export type WatermarkPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";

export interface BatchImageOperation {
  type: "resize" | "convert" | "watermark";
  // resize
  maxDimension?: number;
  width?: number;
  height?: number;
  // convert
  format?: ImageOutputFormat;
  quality?: number;
  // watermark
  watermarkPath?: string;
  position?: WatermarkPosition;
  opacity?: number;
}

export interface BatchImageResult {
  success: boolean;
  processed: number;
  failed: number;
  outputDir: string;
  files: Array<{ input: string; output: string; error?: string }>;
}

/**
 * BatchImageTools provides batch image processing capabilities:
 * resize, format conversion, and watermark/logo overlay.
 *
 * Uses macOS `sips` for resize/convert and ImageMagick `composite` for watermarks.
 */
export class BatchImageTools {
  constructor(
    private workspace: Workspace,
    private daemon: AgentDaemon,
    private taskId: string,
  ) {}

  setWorkspace(workspace: Workspace): void {
    this.workspace = workspace;
  }

  private isPathAllowedOutsideWorkspace(absolutePath: string): boolean {
    const allowedPaths = this.workspace.permissions.allowedPaths || [];
    if (allowedPaths.length === 0) return false;

    const normalizedPath = path.normalize(absolutePath);
    return allowedPaths.some((allowed) => {
      const normalizedAllowed = path.normalize(allowed);
      return (
        normalizedPath === normalizedAllowed ||
        normalizedPath.startsWith(normalizedAllowed + path.sep)
      );
    });
  }

  private isInsideWorkspace(absolutePath: string): boolean {
    const workspaceRoot = path.resolve(this.workspace.path);
    const relative = path.relative(workspaceRoot, absolutePath);
    return !(relative.startsWith("..") || path.isAbsolute(relative));
  }

  private isProtectedWritePath(absolutePath: string): boolean {
    const normalizedPath = path.normalize(absolutePath).toLowerCase();
    return PROTECTED_WRITE_PATHS.some((protectedPath) =>
      normalizedPath.startsWith(protectedPath.toLowerCase()),
    );
  }

  private ensureReadablePath(inputPath: string): string {
    if (!this.workspace.permissions.read) {
      throw new Error("Read permission not granted for batch image processing");
    }

    const candidate = path.isAbsolute(inputPath)
      ? path.resolve(inputPath)
      : path.resolve(this.workspace.path, inputPath);
    if (!fsSync.existsSync(candidate)) {
      throw new Error(`File not found: ${inputPath}`);
    }

    const resolvedPath = fsSync.realpathSync(candidate);
    const canReadOutside =
      this.workspace.isTemp || this.workspace.permissions.unrestrictedFileAccess;
    if (
      !this.isInsideWorkspace(resolvedPath) &&
      !canReadOutside &&
      !this.isPathAllowedOutsideWorkspace(resolvedPath)
    ) {
      throw new Error(
        "Image path must be inside the workspace or an approved Allowed Path.",
      );
    }

    const stats = fsSync.statSync(resolvedPath);
    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${inputPath}`);
    }
    return resolvedPath;
  }

  private ensureWritablePath(outputPath: string): string {
    if (!this.workspace.permissions.write) {
      throw new Error("Write permission not granted for batch image processing");
    }

    const resolvedPath = path.isAbsolute(outputPath)
      ? path.resolve(outputPath)
      : path.resolve(this.workspace.path, outputPath);
    const canWriteOutside =
      this.workspace.isTemp || this.workspace.permissions.unrestrictedFileAccess;

    if (
      !this.isInsideWorkspace(resolvedPath) &&
      !canWriteOutside &&
      !this.isPathAllowedOutsideWorkspace(resolvedPath)
    ) {
      throw new Error(
        "Output path must be inside the workspace or an approved Allowed Path.",
      );
    }
    if (!this.isInsideWorkspace(resolvedPath) && this.isProtectedWritePath(resolvedPath)) {
      throw new Error(`Cannot write batch image output to protected path: ${resolvedPath}`);
    }
    return resolvedPath;
  }

  async batchProcess(input: {
    inputPaths: string[];
    operations: BatchImageOperation[];
    outputDir?: string;
  }): Promise<BatchImageResult> {
    const { inputPaths, operations, outputDir } = input;

    if (!inputPaths || inputPaths.length === 0) {
      throw new Error("inputPaths must be a non-empty array of file paths");
    }
    if (!operations || operations.length === 0) {
      throw new Error("operations must be a non-empty array");
    }

    // Resolve output directory
    const outDir = outputDir
      ? this.ensureWritablePath(outputDir)
      : this.ensureWritablePath(path.join(this.workspace.path, `batch-output-${Date.now()}`));

    await fs.mkdir(outDir, { recursive: true });

    this.daemon.logEvent(this.taskId, "tool_call", {
      tool: "batch_image_process",
      inputCount: inputPaths.length,
      operations: operations.map((o) => o.type),
      outputDir: outDir,
    });

    const results: BatchImageResult["files"] = [];
    let processed = 0;
    let failed = 0;

    for (const inputPath of inputPaths) {
      const absInput = this.ensureReadablePath(inputPath);

      try {
        // Determine output filename based on operations
        const ext = this.resolveOutputExtension(absInput, operations);
        const baseName = path.parse(absInput).name;
        const outputPath = this.ensureWritablePath(path.join(outDir, `${baseName}${ext}`));

        // Process sequentially through each operation
        let currentPath = absInput;
        let tmpPath: string | null = null;

        for (let i = 0; i < operations.length; i++) {
          const op = operations[i];
          const isLast = i === operations.length - 1;
          const dest = this.ensureWritablePath(
            isLast ? outputPath : path.join(outDir, `_tmp_${baseName}_${i}${ext}`),
          );

          if (!isLast) tmpPath = dest;

          await this.applyOperation(currentPath, dest, op);
          currentPath = dest;
        }

        // Clean up intermediate temp files
        if (tmpPath && tmpPath !== outputPath) {
          try { await fs.unlink(tmpPath); } catch { /* ignore */ }
        }

        results.push({ input: absInput, output: outputPath });
        processed++;
      } catch (error: Any) {
        results.push({ input: absInput, output: "", error: error.message });
        failed++;
      }
    }

    this.daemon.logEvent(this.taskId, "tool_result", {
      tool: "batch_image_process",
      success: failed === 0,
      processed,
      failed,
    });

    return {
      success: failed === 0,
      processed,
      failed,
      outputDir: outDir,
      files: results,
    };
  }

  private resolveOutputExtension(inputPath: string, operations: BatchImageOperation[]): string {
    // Check if any operation explicitly sets the format
    for (const op of operations) {
      if (op.type === "convert" && op.format) {
        return `.${op.format === "jpeg" ? "jpg" : op.format}`;
      }
    }
    // Keep original extension
    return path.extname(inputPath) || ".png";
  }

  private async applyOperation(
    inputPath: string,
    outputPath: string,
    op: BatchImageOperation,
  ): Promise<void> {
    switch (op.type) {
      case "resize":
        await this.resize(inputPath, outputPath, op);
        break;
      case "convert":
        await this.convert(inputPath, outputPath, op);
        break;
      case "watermark":
        await this.watermark(inputPath, outputPath, op);
        break;
      default:
        throw new Error(`Unknown operation type: ${(op as Any).type}`);
    }
  }

  private async resize(
    inputPath: string,
    outputPath: string,
    op: BatchImageOperation,
  ): Promise<void> {
    const maxDim = op.maxDimension ?? Math.max(op.width ?? 9999, op.height ?? 9999);

    if (os.platform() === "darwin") {
      // Copy first, then resize in-place with sips
      await fs.copyFile(inputPath, outputPath);
      await execFileAsync("sips", [
        "--resampleHeightWidthMax", String(maxDim),
        outputPath,
      ], { timeout: PROCESS_TIMEOUT_MS });
    } else {
      // ImageMagick
      await execFileAsync("convert", [
        inputPath,
        "-resize", `${maxDim}x${maxDim}>`,
        outputPath,
      ], { timeout: PROCESS_TIMEOUT_MS });
    }
  }

  private async convert(
    inputPath: string,
    outputPath: string,
    op: BatchImageOperation,
  ): Promise<void> {
    const format = op.format ?? "png";
    const quality = op.quality ?? 90;

    if (os.platform() === "darwin") {
      const sipsFormat = format === "jpeg" ? "jpeg" : format;
      await execFileAsync("sips", [
        "-s", "format", sipsFormat,
        ...(format === "jpeg" ? ["-s", "formatOptions", String(quality)] : []),
        inputPath,
        "--out", outputPath,
      ], { timeout: PROCESS_TIMEOUT_MS });
    } else {
      await execFileAsync("convert", [
        inputPath,
        ...(format === "jpeg" ? ["-quality", String(quality)] : []),
        outputPath,
      ], { timeout: PROCESS_TIMEOUT_MS });
    }
  }

  private async watermark(
    inputPath: string,
    outputPath: string,
    op: BatchImageOperation,
  ): Promise<void> {
    if (!op.watermarkPath) {
      throw new Error("watermarkPath is required for watermark operation");
    }

    const wmPath = path.isAbsolute(op.watermarkPath)
      ? this.ensureReadablePath(op.watermarkPath)
      : this.ensureReadablePath(op.watermarkPath);

    const gravity = this.positionToGravity(op.position ?? "bottom-right");
    const opacity = Math.round((op.opacity ?? 0.8) * 100);

    // ImageMagick composite — works on all platforms
    try {
      await execFileAsync("composite", [
        "-dissolve", String(opacity),
        "-gravity", gravity,
        wmPath,
        inputPath,
        outputPath,
      ], { timeout: PROCESS_TIMEOUT_MS });
    } catch {
      // Fallback: try with `magick composite` (ImageMagick 7)
      await execAsync(
        `magick composite -dissolve ${opacity} -gravity ${gravity} ${JSON.stringify(wmPath)} ${JSON.stringify(inputPath)} ${JSON.stringify(outputPath)}`,
        { timeout: PROCESS_TIMEOUT_MS },
      );
    }
  }

  private positionToGravity(position: WatermarkPosition): string {
    const map: Record<WatermarkPosition, string> = {
      "top-left": "NorthWest",
      "top-right": "NorthEast",
      "bottom-left": "SouthWest",
      "bottom-right": "SouthEast",
      "center": "Center",
    };
    return map[position] ?? "SouthEast";
  }

  // ───────────── Tool definitions ─────────────

  static getToolDefinitions(): LLMTool[] {
    return [
      {
        name: "batch_image_process",
        description:
          "Batch process multiple images: resize, convert format, and/or add a watermark/logo. " +
          "Use when the user asks to process, resize, or watermark multiple images at once. " +
          "Provide an array of input file paths and an array of operations to apply in order.",
        input_schema: {
          type: "object",
          properties: {
            inputPaths: {
              type: "array",
              items: { type: "string" },
              description:
                "Array of image file paths to process (absolute or relative to workspace)",
            },
            operations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["resize", "convert", "watermark"],
                    description: "Operation type",
                  },
                  maxDimension: {
                    type: "number",
                    description: "For resize: max width or height in pixels",
                  },
                  format: {
                    type: "string",
                    enum: ["png", "jpeg", "webp"],
                    description: "For convert: target format",
                  },
                  quality: {
                    type: "number",
                    description: "For convert (JPEG): quality 1-100 (default: 90)",
                  },
                  watermarkPath: {
                    type: "string",
                    description: "For watermark: path to the logo/watermark image",
                  },
                  position: {
                    type: "string",
                    enum: ["top-left", "top-right", "bottom-left", "bottom-right", "center"],
                    description: "For watermark: placement position (default: bottom-right)",
                  },
                  opacity: {
                    type: "number",
                    description: "For watermark: opacity 0-1 (default: 0.8)",
                  },
                },
                required: ["type"],
              },
              description: "Array of operations to apply to each image, in order",
            },
            outputDir: {
              type: "string",
              description:
                "Output directory for processed images (absolute or relative to workspace). " +
                "Defaults to a timestamped folder in the workspace.",
            },
          },
          required: ["inputPaths", "operations"],
        },
      },
    ];
  }
}
