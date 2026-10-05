const { app, nativeImage } = require("electron");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const assert = require("node:assert/strict");
const { PptxPreviewService } = require("../../dist/electron/electron/utils/PptxPreviewService.js");
const { renderOfficeHtmlVisualEvidence } = require("../../dist/electron/electron/utils/office-html-visual-renderer.js");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
app.on("window-all-closed", () => {});
(async () => {
  const source = process.argv[2];
  assert(source, "Pass the source PPTX path");
  const output = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-ppt-preview-qa-"));
  app.setPath("userData", path.join(output, "user-data"));
  await app.whenReady();
  const before = hash(await fs.readFile(source));
  const officeCliOnly = process.argv.includes("--officecli-only");
  const service = new PptxPreviewService({ cacheRoot: path.join(output, "cache"), ...(officeCliOnly ? {
    artifactToolRunner: null,
    commandRunner: (command, args, options) => {
      if (path.basename(command) === "soffice") return Promise.reject(new Error("Native converter disabled for bundled-renderer QA"));
      return promisify(execFile)(command, args, options);
    },
  } : {}) });
  const preview = await service.buildPreview({ filePath: source, renderMode: "full" });
  await fs.writeFile(path.join(output, "preview.json"), JSON.stringify(preview));
  assert.equal(preview.renderStatus, "rendered", preview.renderMessage);
  if (officeCliOnly) assert.equal(preview.renderer, "officecli");
  const images = preview.slides.filter((slide) => slide.imageDataUrl);
  assert.equal(images.length, preview.slideCount);
  const hashes = [];
  for (const slide of images) {
    const bytes = Buffer.from(slide.imageDataUrl.split(",")[1], "base64");
    const image = nativeImage.createFromBuffer(bytes);
    const size = image.getSize();
    assert(size.width >= 900 && size.height >= 500, JSON.stringify(size));
    const pixels = image.toBitmap();
    const colors = new Set();
    for (let i = 0; i < pixels.length; i += 400) colors.add(pixels.readUInt32LE(i));
    assert(colors.size > 10, `Slide ${slide.index} appears blank`);
    hashes.push(hash(bytes));
    await fs.writeFile(path.join(output, `slide-${slide.index}.png`), bytes);
  }
  assert(new Set(hashes).size > 1, "All slide images are identical");
  const cached = await new PptxPreviewService({ cacheRoot: path.join(output, "cache") })
    .buildPreview({ filePath: source, renderMode: "fast" });
  assert.equal(cached.renderStatus, "cached");
  assert.equal(cached.renderer, preview.renderer);
  assert.equal(cached.renderMessage, preview.renderMessage);
  assert.equal(hash(await fs.readFile(source)), before, "Source file changed");
  for (const dynamic of [false, true]) {
    const htmlPath = path.join(output, `fixture-${dynamic}.html`);
    await fs.writeFile(htmlPath, `<!doctype html><style>.slide{width:960px;height:540px;background:red} .blue{background:blue}</style>
      <button class="thumb" onclick="document.querySelector('.slide').style.background='red'">1</button>
      <button class="thumb" onclick="document.querySelector('.slide').style.background='blue'">2</button>
      <div class="slide">First</div>${dynamic ? "" : '<div class="slide blue">Second</div>'}`);
    const result = await renderOfficeHtmlVisualEvidence({ htmlPath, outputPath: path.join(output, `fixture-${dynamic}.png`) });
    assert.equal(result.pageCount, 2);
    assert.notEqual(hash(await fs.readFile(result.imagePaths[0])), hash(await fs.readFile(result.imagePaths[1])));
    const limited = await renderOfficeHtmlVisualEvidence({ htmlPath, outputPath: path.join(output, `limited-${dynamic}.png`), maxPages: 1 });
    assert.equal(limited.pageCount, 1);
  }
  const warningHtml = path.join(output, "warning.html");
  await fs.writeFile(warningHtml, '<!doctype html><meta charset="utf-8"><style>.slide{width:960px;height:540px;background:white;color:black}</style><div class="slide">Arabic: العربية Japanese: 日本語 Korean: 한국어</div><div class="slide">Invalid: \uFFFD</div>');
  await assert.rejects(renderOfficeHtmlVisualEvidence({ htmlPath: warningHtml, outputPath: path.join(output, "strict.png") }), /mojibake/);
  const warned = await renderOfficeHtmlVisualEvidence({ htmlPath: warningHtml, outputPath: path.join(output, "warn.png"), textValidation: "warn" });
  assert.equal(warned.pageCount, 2);
  assert.deepEqual(warned.textWarningPages, [2]);
  console.log(JSON.stringify({ output, slides: images.length, distinctImages: new Set(hashes).size, cached: true, sourceUnchanged: true }));
})().then(() => app.exit(0), (error) => { console.error(error); app.exit(1); });
