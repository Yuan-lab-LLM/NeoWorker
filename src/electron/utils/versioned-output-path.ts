import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Resolve a creation-only output path without replacing an existing artifact.
 *
 * The first file keeps the requested name. Later files use the same version
 * convention as the document editor: report.pdf, report-v2.pdf, report-v3.pdf.
 * Callers that intentionally edit an existing file should not use this helper.
 */
export function resolveVersionedOutputPath(
  requestedPath: string,
  exists: (candidate: string) => boolean = fs.existsSync,
): string {
  if (!exists(requestedPath)) return requestedPath;

  const directory = path.dirname(requestedPath);
  const extension = path.extname(requestedPath);
  const requestedStem = path.basename(requestedPath, extension);
  const versionMatch = requestedStem.match(/^(.*)-v(\d+)$/i);
  const baseStem = versionMatch?.[1] || requestedStem;
  let version = versionMatch ? Math.max(2, Number(versionMatch[2]) + 1) : 2;

  while (true) {
    const candidate = path.join(directory, `${baseStem}-v${version}${extension}`);
    if (!exists(candidate)) return candidate;
    version += 1;
  }
}

