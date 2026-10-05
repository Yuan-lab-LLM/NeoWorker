import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// Bind every review item to the exact exported deck and already-rendered PNG.
// The queue is scheduling data only: no page becomes verified by being listed.
export async function createReviewQueue({ outputPath, outputSha256, previewDir, previewFiles }) {
  const pages = await Promise.all(previewFiles.map(async (file, index) => {
    const imagePath = path.join(previewDir, file);
    return { page: index + 1, path: imagePath,
      sha256: createHash("sha256").update(await fs.readFile(imagePath)).digest("hex") };
  }));
  const batches = [];
  for (let i = 0; i < pages.length; i += 5) {
    const batch = pages.slice(i, i + 5);
    batches.push({ pages: batch.map(item => item.page), paths: batch.map(item => item.path),
      max_dimension: 960,
      prompt: "Review this slide concisely: hierarchy, clipping, overlap, source-figure readability, diagram relationships, contrast and evidence meaning. Identify blocking issues and concrete fixes. Unreadable labels are not verified.",
    });
  }
  return { status: "pending", outputPath, outputSha256, pages, batches };
}
