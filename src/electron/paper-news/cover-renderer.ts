import { nativeImage } from "electron";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { renderPdfPages } from "../utils/pdf-page-render";

export async function resizeNewsCover(bytes: Buffer): Promise<Buffer | null> {
  const image = nativeImage.createFromBuffer(bytes);
  if (image.isEmpty()) {
    // Some macOS nativeImage decoders do not support CDN-negotiated WebP.
    // Reuse the bundled PDF canvas decoder; only decode bytes, never remote URLs.
    if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") return null;
    const { createCanvas, loadImage } = require("@napi-rs/canvas") as typeof import("@napi-rs/canvas");
    const decoded = await loadImage(bytes);
    if (decoded.width < 160 || decoded.height < 90 || decoded.width * decoded.height > 24_000_000) return null;
    const scale = Math.min(1, 1600 / decoded.width, 1600 / decoded.height);
    const canvas = createCanvas(Math.round(decoded.width * scale), Math.round(decoded.height * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(decoded, 0, 0, canvas.width, canvas.height);
    return canvas.toBuffer("image/jpeg", 85);
  }
  const { width, height } = image.getSize();
  // Reject badges/tracking pixels and unreasonable image dimensions.
  if (width < 160 || height < 90 || width * height > 24_000_000) return null;
  const scale = Math.min(1, 1600 / width, 1600 / height);
  return image
    .resize({
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
      quality: "good",
    })
    .toJPEG(85);
}
export async function renderNewsPdfCover(
  bytes: Buffer,
  signal: AbortSignal,
): Promise<Buffer | null> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-news-cover-"));
  try {
    const file = path.join(dir, "paper.pdf");
    await fs.writeFile(file, bytes);
    const rendered = await renderPdfPages(file, dir, {
      firstPage: 1,
      lastPage: 1,
      dpi: 144,
      signal,
    });
    return await fs.readFile(rendered.pages[0].imagePath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
