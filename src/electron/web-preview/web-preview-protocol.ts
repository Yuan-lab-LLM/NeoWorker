import { randomUUID } from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { protocol } from "electron";
import { repairHiddenHtmlContent } from "../../shared/html-content-visibility";

const WEB_PREVIEW_SCHEME = "web-preview";
const TOKEN_TTL_MS = 60 * 60 * 1000;
const MAX_ACTIVE_PREVIEWS = 200;

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

type WebPreviewRecord = {
  baseDir: string;
  entryFileName: string;
  expiresAt: number;
};

const previewStore = new Map<string, WebPreviewRecord>();

function isPathInside(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

function purgeExpiredPreviews(now = Date.now()): void {
  for (const [token, record] of previewStore) {
    if (record.expiresAt <= now) previewStore.delete(token);
  }

  while (previewStore.size >= MAX_ACTIVE_PREVIEWS) {
    const oldestToken = previewStore.keys().next().value;
    if (!oldestToken) break;
    previewStore.delete(oldestToken);
  }
}

function errorResponse(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

export function registerWebPreviewScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: WEB_PREVIEW_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

export function createWebPreviewUrl(params: {
  htmlPath: string;
  workspaceRoot: string;
}): string {
  const htmlPath = path.resolve(params.htmlPath);
  const workspaceRoot = path.resolve(params.workspaceRoot);
  const baseDir = path.dirname(htmlPath);
  if (!isPathInside(workspaceRoot, htmlPath)) {
    throw new Error("Web preview file must be inside the workspace");
  }

  purgeExpiredPreviews();
  const token = randomUUID();
  previewStore.set(token, {
    baseDir,
    entryFileName: path.basename(htmlPath),
    expiresAt: Date.now() + TOKEN_TTL_MS,
  });

  return `${WEB_PREVIEW_SCHEME}://${token}/${encodeURIComponent(path.basename(htmlPath))}`;
}

export function registerWebPreviewProtocol(): void {
  protocol.handle(WEB_PREVIEW_SCHEME, async (request) => {
    purgeExpiredPreviews();

    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return errorResponse(400, "Invalid web preview URL");
    }

    const record = previewStore.get(url.hostname);
    if (!record || record.expiresAt <= Date.now()) {
      return errorResponse(404, "Web preview not found");
    }

    const requestedPath = decodeURIComponent(url.pathname || `/${record.entryFileName}`);
    const relativePath = requestedPath === "/" ? record.entryFileName : requestedPath.replace(/^\/+/, "");
    const resolvedPath = path.resolve(record.baseDir, relativePath);
    if (!isPathInside(record.baseDir, resolvedPath)) {
      return errorResponse(403, "Forbidden");
    }

    const mimeType = MIME_TYPES[path.extname(resolvedPath).toLowerCase()];
    if (!mimeType) return errorResponse(403, "Unsupported preview resource");

    try {
      const stats = await fs.stat(resolvedPath);
      if (!stats.isFile()) return errorResponse(404, "Preview resource not found");
      const fileContent = await fs.readFile(resolvedPath);
      const extension = path.extname(resolvedPath).toLowerCase();
      const content =
        extension === ".html" || extension === ".htm"
          ? Buffer.from(
              repairHiddenHtmlContent(fileContent.toString("utf8")).content,
              "utf8",
            )
          : fileContent;
      return new Response(content, {
        status: 200,
        headers: {
          "Content-Type": mimeType,
          "Content-Length": String(content.length),
          "Cache-Control": "private, no-store",
        },
      });
    } catch {
      return errorResponse(404, "Preview resource not found");
    }
  });
}
