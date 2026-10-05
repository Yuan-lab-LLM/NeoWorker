// Exercise the bundled Office renderer and Electron text measurement without
// user files, external services or model calls. Run with Node on either OS.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

if (!process.versions.electron) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "neoworker-office-qa-"));
  const env = { ...process.env, NEOWORKER_OFFICE_QA_ROOT: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    const result = spawnSync(require("electron"), [__filename], { env, stdio: "inherit", timeout: 300_000 });
    if (result.error) console.error(result.error);
    process.exitCode = result.status ?? 1;
  } finally {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
} else {
  const { app } = require("electron");
  const { randomBytes } = require("node:crypto");
  const PptxGenJS = require("pptxgenjs");
  const JSZip = require("jszip");
  const { PNG } = require("pngjs");
  const { inspectOfficeTranslation, applyOfficeTranslation, verifyOfficeTranslationFidelity } = require("../../dist/electron/electron/documents/office-translation.js");
  const { fitPptxTranslation } = require("../../dist/electron/electron/documents/pptx-translation-layout.js");
  const { preparePptxRenderInput } = require("../../dist/electron/electron/utils/pptx-render-input.js");
  const { resolveBundledOfficeCliExecutable } = require("../../dist/electron/electron/utils/officecli-runtime.js");
  const root = process.env.NEOWORKER_OFFICE_QA_ROOT;
  app.setPath("userData", path.join(root, "profile"));
  app.disableHardwareAcceleration();
  app.on("window-all-closed", () => {});
  app.whenReady().then(async () => {
    const executable = resolveBundledOfficeCliExecutable();
    assert(executable, "Bundled OfficeCLI missing");
    // Deliberately exercise the same executable from a Chinese path with spaces.
    const binDir = path.join(root, "中文 安装目录", "Office工具");
    fs.mkdirSync(binDir, { recursive: true });
    const copiedExe = path.join(binDir, process.platform === "win32" ? "Office工具.exe" : "Office工具");
    fs.copyFileSync(executable, copiedExe);
    fs.chmodSync(copiedExe, 0o755);
    for (const kind of ["plain", "large", "transparent-preset", "inline-math", "multi-slide-host"]) {
      const large = kind === "large";
      const deck = new PptxGenJS();
      const slide = deck.addSlide();
      slide.addText("翻译检查", { x: 1, y: 1, w: 5, h: 1, fontSize: 20 });
      if (large) {
        const png = new PNG({ width: 3000, height: 3000 });
        png.data = randomBytes(3000 * 3000 * 4);
        const data = PNG.sync.write(png, { colorType: 2, inputColorType: 6 });
        slide.addImage({ data: "image/png;base64," + data.toString("base64"), x: 1, y: 3, w: 2, h: 2 });
      }
      if (kind === "multi-slide-host") {
        for (let page = 1; page < 45; page++) {
          const extra = deck.addSlide();
          for (let i = 0; i < 20; i++) extra.addText("翻译检查", {
            x: 0.2 + (i % 4) * 2.4, y: 0.2 + Math.floor(i / 4) * 1.2, w: 2.2, h: 0.8, fontSize: 14,
          });
        }
      }
      let source = Buffer.from(await deck.write({ outputType: "nodebuffer" }));
      if (kind === "transparent-preset") {
        const zip = await JSZip.loadAsync(source);
        const xml = await zip.file("ppt/slides/slide1.xml").async("text");
        const tinted = xml.replace(/(<a:rPr\b[^>]*>)([\s\S]*?)(<\/a:rPr>)/, (_match, open, body, close) =>
          open + body.replace(/<a:solidFill>[\s\S]*?<\/a:solidFill>/g, "")
          + '<a:solidFill><a:prstClr val="white"><a:alpha val="50000"/></a:prstClr></a:solidFill>' + close);
        assert.notEqual(tinted, xml, "Transparent color fixture was not inserted");
        zip.file("ppt/slides/slide1.xml", tinted);
        source = await zip.generateAsync({ type: "nodebuffer" });
      }
      if (kind === "inline-math") {
        const zip = await JSZip.loadAsync(source);
        const xml = await zip.file("ppt/slides/slide1.xml").async("text");
        const formula = '<a14:m xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main"><m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:r><m:t>≈</m:t></m:r></m:oMath></a14:m>';
        zip.file("ppt/slides/slide1.xml", xml.replace('</a:r>', '</a:r>' + formula));
        source = await zip.generateAsync({ type: "nodebuffer" });
      }
      if (large) assert(source.length > 24 * 1024 * 1024, `Large fixture too small: ${source.length}`);
      // Give each fixture its own path so a renderer cache cannot reuse a
      // previous deck. Retain the untouched input for preview/fidelity checks.
      const fixtureDir = path.join(binDir, kind);
      fs.mkdirSync(fixtureDir, { recursive: true });
      const input = path.join(fixtureDir, "原文件 candidate.pptx");
      const renderInput = path.join(fixtureDir, "渲染副本.pptx");
      const html = path.join(fixtureDir, "候选预览.html");
      fs.writeFileSync(input, source);
      // Both production preview and translation measurement normalize a
      // disposable render copy. Raw OfficeCLI 1.0.143 still rejects some
      // transparent preset colors on Windows; exercise the actual app path.
      fs.writeFileSync(renderInput, await preparePptxRenderInput(source));
      const start = Date.now();
      const render = spawnSync(copiedExe, ["view", renderInput, "html", "-o", html, "--json"], {
        env: { ...process.env, OFFICECLI_NO_AUTO_RESIDENT: "1" }, encoding: "utf8", timeout: 60_000, windowsHide: true,
      });
      console.log(JSON.stringify({ stage: "view-html", kind, bytes: source.length, ms: Date.now() - start,
        status: render.status, signal: render.signal, error: render.error?.message, stdout: render.stdout, stderr: render.stderr }));
      assert.equal(render.status, 0, `OfficeCLI view html failed for ${kind}`);
      assert(fs.readFileSync(html, "utf8").includes("翻译检查"), "Rendered HTML omitted fixture text");
      assert.deepEqual(fs.readFileSync(input), source, "Rendering changed the source document");
      if (["transparent-preset", "multi-slide-host"].includes(kind)) {
        const { PptxPreviewService } = require("../../dist/electron/electron/utils/PptxPreviewService.js");
        const { execFile } = require("node:child_process");
        const { promisify } = require("node:util");
        const previewStart = Date.now();
        const previewService = new PptxPreviewService({
          cacheRoot: path.join(root, `preview-${kind}`), artifactToolRunner: null,
          commandRunner: (command, args, options) => {
            if (command !== executable) throw new Error("External converters deliberately unavailable");
            return promisify(execFile)(copiedExe, args, options);
          },
        });
        const preview = await previewService.buildPreview({ filePath: input, renderMode: "full" });
        assert.equal(preview.renderStatus, "rendered", preview.renderMessage);
        assert.equal(preview.renderer, "officecli");
        const expectedSlides = kind === "multi-slide-host" ? 45 : 1;
        assert.equal(preview.slides.filter(slide => slide.imageDataUrl).length, expectedSlides);
        for (const slide of preview.slides) assert(PNG.sync.read(Buffer.from(slide.imageDataUrl.split(",")[1], "base64")).width > 100);
        const cached = await previewService.buildPreview({ filePath: input, renderMode: "fast" });
        assert.equal(cached.renderStatus, "cached");
        assert.equal(cached.slides.length, expectedSlides);
        assert.deepEqual(fs.readFileSync(input), source);
        console.log(JSON.stringify({ stage: "attachment-preview", kind, slides: expectedSlides, ms: Date.now() - previewStart }));
      }
      if (kind === "plain") {
        // Compare packaged-name and copied-name execution, including Windows
        // short temp paths, so a runtime assembly error is not misdiagnosed.
        const temp = fs.mkdtempSync(path.join(os.tmpdir(), "neoworker-office-path-"));
        const probe = path.join(temp, "candidate.pptx");
        fs.writeFileSync(probe, source);
        for (const probeInput of [input, probe, fs.realpathSync(probe)]) {
          const result = spawnSync(executable, ["view", probeInput, "html", "-o", html, "--json"], {
            env: { ...process.env, OFFICECLI_NO_AUTO_RESIDENT: "1" }, encoding: "utf8", timeout: 60_000, windowsHide: true,
          });
          console.log(JSON.stringify({ stage: "runtime-path-probe", input: probeInput, code: result.status, stdout: result.stdout, stderr: result.stderr }));
        }
        fs.rmSync(temp, { recursive: true, force: true });
      }
      if (kind === "multi-slide-host") {
        const { TaskExecutor } = require("../../dist/electron/electron/agent/executor.js");
        const { DocumentTools } = require("../../dist/electron/electron/agent/tools/document-tools.js");
        const { NeoWorkerToolHost } = require("../../dist/electron/electron/agent/runtime/tool-host-protocol.js");
        const { ToolExecutionCoordinator } = require("../../dist/electron/electron/agent/runtime/ToolExecutionCoordinator.js");
        const doc = new DocumentTools(fixtureDir, "host-qa", () => {});
        let progress = await doc.officeTranslation({ action: "inspect", sourcePath: path.basename(input), targetLanguage: "English" });
        const translationId = progress.translationId;
        while (progress.remaining) progress = await doc.officeTranslation({ action: "stage", translationId,
          batchId: progress.batchId, translations: progress.nextUnits.map(unit => ({ key: unit.key, text: "Translation check" })) });
        const events = [];
        const host = new NeoWorkerToolHost(new ToolExecutionCoordinator({
          executeToolWithRuntime: async (_name, args, runtime) => {
            // Force the exact production host boundary past the former 32s limit.
            await new Promise(resolve => setTimeout(resolve, 35_000));
            assert.equal(runtime.signal.aborted, false);
            const result = await doc.officeTranslation(args);
            assert.equal(runtime.signal.aborted, false);
            return { result };
          },
        }));
        const executor = Object.assign(Object.create(TaskExecutor.prototype), {
          task: { id: "host-qa", agentConfig: {} }, abortController: new AbortController(), currentStepId: null,
          streamingToolExecutor: null, preparePresentationWorkflowToolInput: (_name, args) => args,
          getSchedulerSpecForTool: () => ({ concurrencyClass: "write_serial", idempotent: false }),
          getToolPolicyContext: () => ({}), beginToolExecutionHeartbeat: () => undefined,
          loadPersistedToolHostRecord: () => undefined, getToolHost: () => host,
          emitEvent: (type, payload) => events.push({ type, payload }),
        });
        const args = { action: "apply", translationId, filename: "translated-host.pptx" };
        const timeout = executor.getToolTimeoutMs("office_translation", args);
        const result = await executor.executeToolWithHeartbeat("office_translation", args, timeout, "host-apply");
        assert.equal(result.result.success, true, JSON.stringify(result.result));
        assert.equal(result.toolHostResponse.status, "success");
        assert(events.some(event => event.payload.metric === "tool_lifecycle" && event.payload.status === "request" && event.payload.timeoutMs === 900_000));
        assert(fs.existsSync(path.join(fixtureDir, "translated-host.pptx")));
        console.log(JSON.stringify({ stage: "translation-host", slides: 45, checked: result.result.textFit.checkedShapes, ms: Date.now() - start, timeout }));
        continue;
      }
      const manifest = await inspectOfficeTranslation(source);
      manifest.units.find(unit => unit.text === "翻译检查").text = "Translation check";
      const translated = await applyOfficeTranslation(source, manifest);
      const fitted = await fitPptxTranslation(source, translated, manifest);
      assert(fitted.output, JSON.stringify(fitted.issues));
      await verifyOfficeTranslationFidelity(source, fitted.output, true);
      console.log(JSON.stringify({ stage: "translation-fit", kind, checked: fitted.checkedShapes, ms: Date.now() - start }));
    }
    console.log("PASS: real Office HTML rendering and translation fitting, including >24 MiB PPTX and Chinese executable/file paths.");
  }).then(() => app.exit(0), error => { console.error(error); app.exit(1); });
}
