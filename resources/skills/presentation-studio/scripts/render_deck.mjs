import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { parseArgs, resolveLibreOffice, resolvePdfToPpm, createPresentationFontEnvironment } from "./runtime-utils.mjs";

const execute = promisify(execFile);

// Source and candidate must use the same font environment. Raw soffice calls
// can silently omit every CJK glyph with a headless bundled installation.
export async function renderDeck({ source, outdir }) {
  const soffice = resolveLibreOffice();
  const pdftoppm = resolvePdfToPpm();
  if (!soffice || !pdftoppm) throw new Error("Rendering requires LibreOffice and pdftoppm.");
  await fs.mkdir(outdir, { recursive: false });
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-deck-render-"));
  try {
    const env = await createPresentationFontEnvironment(temp);
    await execute(soffice, ["-env:UserInstallation=" + pathToFileURL(path.join(temp, "profile")).href,
      "--headless", "--convert-to", "pdf", "--outdir", outdir, source],
    { env, timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    const pdf = path.join(outdir, path.basename(source, path.extname(source)) + ".pdf");
    await fs.access(pdf);
    await execute(pdftoppm, ["-png", "-scale-to-x", "1600", "-scale-to-y", "-1", pdf, path.join(outdir, "slide")],
      { env, timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    const pages = (await fs.readdir(outdir)).filter(name => /^slide-\d+\.png$/.test(name)).sort();
    if (!pages.length) throw new Error("Renderer produced no slide images.");
    return { name: "LibreOffice + pdftoppm", executable: soffice, pdf, pages };
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.source || !args.outdir) throw new Error("Usage: render_deck.mjs --source original.pptx --outdir NEW_PREVIEW_DIRECTORY");
  console.log(JSON.stringify(await renderDeck({ source: path.resolve(args.source), outdir: path.resolve(args.outdir) })));
}
