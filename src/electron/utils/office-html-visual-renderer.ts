import { randomUUID } from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { pathToFileURL } from "url";
import { containsOfficeMojibake } from "./office-font-resolver";

export interface OfficeHtmlVisualRenderInput {
  htmlPath: string;
  outputPath: string;
  maxPages?: number;
  timeoutMs?: number;
  textValidation?: "strict" | "warn";
}

export interface OfficeHtmlVisualRenderResult {
  evidencePath: string;
  pageCount: number;
  imagePaths: string[];
  renderer: "electron-chromium";
  textWarningPages?: number[];
}

export type OfficeHtmlVisualRenderer = (
  input: OfficeHtmlVisualRenderInput,
) => Promise<OfficeHtmlVisualRenderResult>;

interface VisualRegion {
  selector: string;
  index: number;
  captureSelector?: string;
  activate?: boolean;
}

interface CaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
  text?: string;
}

function buildEvidenceDirectory(outputPath: string): string {
  const parsed = path.parse(outputPath);
  return path.join(parsed.dir, `${parsed.name}-pages`);
}

function pageImageName(index: number): string {
  return `page-${String(index + 1).padStart(3, "0")}.png`;
}

export const renderOfficeHtmlVisualEvidence: OfficeHtmlVisualRenderer = async ({
  htmlPath,
  outputPath,
  maxPages,
  timeoutMs = 60_000,
  textValidation = "strict",
}) => {
  if (!process.versions.electron) {
    throw new Error("NeoWorker's embedded Chromium renderer is only available inside the desktop app.");
  }

  const { app, BrowserWindow, session } = await import("electron");
  if (!app.isReady()) await app.whenReady();

  const partition = `neoworker-office-visual-${randomUUID()}`;
  const isolatedSession = session.fromPartition(partition, { cache: false });
  isolatedSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  isolatedSession.webRequest.onBeforeRequest((details, callback) => {
    try {
      const protocol = new URL(details.url).protocol;
      callback({ cancel: protocol === "http:" || protocol === "https:" });
    } catch {
      callback({ cancel: true });
    }
  });

  const window = new BrowserWindow({
    show: false,
    width: 1800,
    height: 1400,
    backgroundColor: "#ffffff",
    webPreferences: {
      session: isolatedSession,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false,
      offscreen: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== pathToFileURL(path.resolve(htmlPath)).toString()) event.preventDefault();
  });

  const timeout = setTimeout(() => {
    if (!window.isDestroyed()) window.destroy();
  }, timeoutMs);
  try {
    await window.loadURL(pathToFileURL(path.resolve(htmlPath)).toString());
    await window.webContents.insertCSS("* { scroll-behavior: auto !important; }");
    await window.webContents.executeJavaScript(
      "document.fonts ? document.fonts.ready.then(() => true) : true",
      true,
    );

    const documentText = await window.webContents.executeJavaScript(
      "document.body ? document.body.innerText : ''",
      true,
    );
    if (textValidation === "strict" && containsOfficeMojibake(String(documentText || ""))) {
      throw new Error("Rendered Office preview contains replacement or mojibake characters.");
    }

    const regions = (await window.webContents.executeJavaScript(`(() => {
      const thumbnails = Array.from(document.querySelectorAll(".thumb"));
      const visibleSlides = Array.from(document.querySelectorAll(".slide"));
      if (thumbnails.length > 1 && visibleSlides.length === 1) {
        return thumbnails.map((_node, index) => ({
          selector: ".thumb",
          captureSelector: ".slide",
          activate: true,
          index
        }));
      }
      const selectors = [".slide", ".page", "[data-page]", ".page-wrapper", "section"];
      for (const selector of selectors) {
        const nodes = Array.from(document.querySelectorAll(selector)).map((node, index) => ({ node, index })).filter(({ node }) => {
          const rect = node.getBoundingClientRect();
          const style = window.getComputedStyle(node);
          return rect.width >= 200 && rect.height >= 120 && style.display !== "none" && style.visibility !== "hidden";
        });
        if (nodes.length) return nodes.map(({ index }) => ({ selector, index }));
      }
      return document.body ? [{ selector: "body", index: 0 }] : [];
    })()`, true)) as VisualRegion[];

    if (!regions.length) {
      throw new Error("The Office preview did not contain any renderable pages or slides.");
    }

    const evidenceDirectory = buildEvidenceDirectory(outputPath);
    await fs.mkdir(evidenceDirectory, { recursive: true });
    const imagePaths: string[] = [];
    const textWarningPages: number[] = [];
    for (const region of regions.slice(0, maxPages)) {
      const rect = (await window.webContents.executeJavaScript(`(async () => {
        window.__neoworkerRestorePage?.();
        const activationNode = document.querySelectorAll(${JSON.stringify(region.selector)})[${region.index}];
        if (${Boolean(region.activate)} && activationNode) {
          activationNode.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }
        const node = ${region.captureSelector
          ? `document.querySelector(${JSON.stringify(region.captureSelector)})`
          : `activationNode`};
        if (!node) return null;
        await Promise.all(Array.from(node.querySelectorAll("img")).map((image) => image.decode().catch(() => {})));
        const width = Math.ceil(node.offsetWidth);
        const height = Math.ceil(node.offsetHeight);
        // Keep the original ancestry (fonts and scoped selectors), but isolate
        // this page at the viewport origin. Cropping a scrolling multi-page
        // viewer can capture the previous compositor frame or adjacent slides.
        const saved = new Map();
        const set = (element, styles) => {
          if (!saved.has(element)) saved.set(element, element.getAttribute("style"));
          for (const [key, value] of Object.entries(styles)) element.style.setProperty(key, value, "important");
        };
        window.__neoworkerRestorePage = () => {
          for (const [element, style] of saved) {
            if (style === null) element.removeAttribute("style");
            else element.setAttribute("style", style);
          }
        };
        const geometry = {
          display: "block", position: "relative", inset: "auto", margin: "0",
          padding: "0", border: "0", transform: "none", zoom: "1",
          width: width + "px", height: height + "px", "min-width": "0",
          "min-height": "0", "max-width": "none", "max-height": "none",
          "box-sizing": "border-box", overflow: "hidden", "flex-shrink": "0"
        };
        let branch = node;
        while (branch.parentElement) {
          const parent = branch.parentElement;
          for (const sibling of parent.children) {
            if (sibling !== branch && !["STYLE", "LINK", "SCRIPT"].includes(sibling.tagName)) set(sibling, { display: "none" });
          }
          set(parent, geometry);
          parent.scrollTop = 0;
          parent.scrollLeft = 0;
          branch = parent;
        }
        set(node, { position: "relative", inset: "auto", margin: "0", transform: "none", zoom: "1", width: width + "px", height: height + "px", "max-width": "none", "max-height": "none", "flex-shrink": "0" });
        window.scrollTo(0, 0);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return {
          text: node.innerText || '',
          x: 0, y: 0, width, height, scaleFactor: window.devicePixelRatio || 1
        };
      })()`, true)) as CaptureRect | null;
      if (!rect || rect.width < 1 || rect.height < 1) {
        throw new Error(`Page ${region.index + 1} could not be positioned for visual capture.`);
      }
      if (containsOfficeMojibake(rect.text || "")) {
        if (textValidation === "strict") throw new Error(`Page ${region.index + 1} contains replacement or mojibake characters.`);
        textWarningPages.push(region.index + 1);
      }
      if (rect.width > 8192 || rect.height > 8192) {
        throw new Error(`Page ${region.index + 1} exceeds the supported capture dimensions.`);
      }
      // A small marker outside the delivered page identifies the compositor
      // frame. RAF completion alone does not guarantee that a hidden window's
      // first paint belongs to the current page (especially after a resize).
      const markerColor = [30 + imagePaths.length % 200, 190, 137];
      window.setContentSize(rect.width + 8, rect.height);
      await window.webContents.executeJavaScript(`(() => {
        document.getElementById('__neoworkerFrameMarker')?.remove();
        const marker = document.createElement('div');
        marker.id = '__neoworkerFrameMarker';
        marker.style.cssText = 'position:fixed!important;left:${rect.width}px!important;top:0!important;width:8px!important;height:8px!important;background:rgb(${markerColor.join(",")})!important;z-index:2147483647!important;opacity:1!important;';
        document.body.appendChild(marker);
      })()`);
      await window.webContents.executeJavaScript("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      await window.webContents.executeJavaScript(`(() => {
        const node = document.querySelectorAll(${JSON.stringify(region.captureSelector || region.selector)})[${region.captureSelector ? 0 : region.index}];
        // OfficeCLI's resize listener reapplies its interactive scale after the
        // viewport changes. Export the native canvas, not that scaled viewer.
        node.style.setProperty('transform', 'none', 'important');
        node.parentElement.style.setProperty('width', '${rect.width}px', 'important');
        node.parentElement.style.setProperty('height', '${rect.height}px', 'important');
        return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      })()`);
      // Offscreen painting is independent of window occlusion. Wait for a new
      // paint after positioning instead of accepting an old, non-empty frame.
      const png = await new Promise<Buffer>((resolve, reject) => {
        const onPaint = (_event: unknown, _dirty: unknown, frame: import("electron").NativeImage) => {
          const pixels = frame.toBitmap({ scaleFactor: 1 });
          const size = frame.getSize(1);
          const scale = rect.scaleFactor;
          const offset = (Math.round(2 * scale) * size.width + Math.round((rect.width + 2) * scale)) * 4;
          const [r, g, b] = markerColor;
          const current = size.width === Math.round((rect.width + 8) * scale) && size.height === Math.round(rect.height * scale) &&
            pixels[offset + 1] === g && ((pixels[offset] === b && pixels[offset + 2] === r) || (pixels[offset] === r && pixels[offset + 2] === b));
          if (!current) {
            window.webContents.invalidate();
            return;
          }
          clearTimeout(timer);
          window.webContents.removeListener("paint", onPaint);
          resolve(frame.crop({ x: 0, y: 0, width: Math.round(rect.width * scale), height: Math.round(rect.height * scale) }).toPNG());
        };
        const timer = setTimeout(() => {
          window.webContents.removeListener("paint", onPaint);
          reject(new Error(`Page ${region.index + 1} did not paint in time.`));
        }, 5_000);
        window.webContents.on("paint", onPaint);
        window.webContents.invalidate();
      });
      if (png.length === 0) {
        throw new Error(`Page ${region.index + 1} produced an empty visual capture.`);
      }
      const imagePath = path.join(evidenceDirectory, pageImageName(imagePaths.length));
      await fs.writeFile(imagePath, png);
      imagePaths.push(imagePath);
    }

    const evidencePath = path.join(evidenceDirectory, "evidence.json");
    await fs.writeFile(
      evidencePath,
      JSON.stringify(
        {
          schemaVersion: 1,
          renderer: "electron-chromium",
          sourceHtml: path.resolve(htmlPath),
          createdAt: new Date().toISOString(),
          pageCount: imagePaths.length,
          textWarningPages,
          pages: imagePaths.map((imagePath, index) => ({
            page: index + 1,
            imagePath,
          })),
        },
        null,
        2,
      ),
      "utf8",
    );

    return {
      evidencePath,
      pageCount: imagePaths.length,
      imagePaths,
      renderer: "electron-chromium",
      textWarningPages,
    };
  } finally {
    clearTimeout(timeout);
    if (!window.isDestroyed()) window.destroy();
  }
};
