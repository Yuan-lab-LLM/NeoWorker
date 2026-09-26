import {
  ipcMain,
  webContents,
  BrowserWindow,
  type IpcMainInvokeEvent,
} from "electron";
import { pathToFileURL } from "node:url";
import { extractPdfText } from "../browser/reading/pdf-text";
import {
  READING_CHANNELS,
  readingUrl,
  validateReadingRequest,
  type ReadingContext,
  type ReadingRequest,
  type ReadingSelectionRequest,
} from "../../shared/browser-reading";
import { getBrowserWorkbenchService } from "../browser/browser-workbench-service";
import {
  CAPTURE_ARTICLE_SCRIPT,
  readingPrompt,
  type captureArticle,
} from "../browser/reading/context";
import { LLMProviderFactory } from "../agent/llm/provider-factory";
import {
  recordLlmCallError,
  recordLlmCallSuccess,
} from "../agent/llm/usage-telemetry";

const importPdf = new Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")>;

async function pdfDocument(
  guest: Electron.WebContents,
  url: string,
  signal: AbortSignal,
): Promise<ReadingContext> {
  const response = await guest.session.fetch(url, { signal });
  if (!response.ok || !response.body)
    throw new Error("无法读取 PDF，请先在浏览器中打开，或选中段落后右键操作");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 30 * 1024 * 1024)
        throw new Error("PDF 超过 30 MB，请选择一段文字后右键操作");
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const buffer = Buffer.concat(parts);
  if (!buffer.subarray(0, 1024).includes(Buffer.from("%PDF-")))
    throw new Error("当前链接没有返回 PDF，请使用选中文本");
  const pdfjs = await importPdf(
    pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.mjs")).href,
  );
  const loading = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: 0,
  });
  const cancel = () => {
    void loading.destroy().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    const doc = await loading.promise;
    return {
      url,
      title: guest.getTitle(),
      scope: "pdf-document",
      ...(await extractPdfText(doc, signal)),
    };
  } finally {
    signal.removeEventListener("abort", cancel);
    await loading.destroy().catch(() => {});
  }
}

export function setupBrowserReadingHandlers(
  isTrusted: (event: IpcMainInvokeEvent) => boolean,
) {
  const running = new Map<string, AbortController>();
  const trust = (event: IpcMainInvokeEvent) => {
    if (!isTrusted(event) || event.senderFrame !== event.sender.mainFrame)
      throw new Error("阅读助手仅限主窗口使用");
  };
  const listening = new WeakSet<Electron.WebContents>();
  // Native PDF context menus bubble to the embedding window, not the webview tag.
  ipcMain.handle(READING_CHANNELS.listen, (event) => {
    trust(event);
    if (listening.has(event.sender)) return;
    listening.add(event.sender);
    event.sender.on("context-menu", (_menuEvent, params) => {
      if (params.isEditable || !params.selectionText?.trim()) return;
      event.sender.send(READING_CHANNELS.selection, {
        text: params.selectionText.slice(0, 12000),
        x: params.x,
        y: params.y,
        pageURL: params.pageURL,
        frameURL: params.frameURL,
      });
    });
  });
  const probing = new Set<number>();
  ipcMain.handle(
    READING_CHANNELS.probeSelection,
    async (event, input: ReadingSelectionRequest) => {
      trust(event);
      if (
        !input ||
        typeof input.taskId !== "string" ||
        input.taskId.length > 200 ||
        typeof input.sessionId !== "string" ||
        input.sessionId.length > 200 ||
        typeof input.url !== "string"
      )
        throw new Error("无效的阅读会话");
      const registered = getBrowserWorkbenchService().getSession(
        input.taskId,
        input.sessionId,
      );
      const guest = registered && webContents.fromId(registered.webContentsId);
      if (
        !guest ||
        guest.isDestroyed() ||
        guest.hostWebContents !== event.sender
      )
        throw new Error("浏览器尚未就绪");
      const url = readingUrl(guest.getURL());
      if (url !== readingUrl(input.url)) throw new Error("页面已切换");
      if (probing.has(guest.id)) return null;
      // Only query Chromium's bundled PDF viewer inside this owned guest, never arbitrary site frames.
      const frame = guest.mainFrame.framesInSubtree.find((f) =>
        f.url.startsWith(
          "chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/",
        ),
      );
      if (!frame) return null;
      const contentFrames = guest.mainFrame.framesInSubtree.filter(
        (child) => child === guest.mainFrame || child.parent === frame,
      );
      probing.add(guest.id);
      try {
        // Native PDF mouse events land in its content frame, not the extension
        // shell. Only attach to this owned PDF's root and direct content frames.
        const points = await Promise.all(
          contentFrames.map((child) =>
            child
              .executeJavaScript(
                `(() => {
          if (!globalThis.__neoPdfPointer) {
            const state = globalThis.__neoPdfPointer = { point: null };
            document.addEventListener('mouseup', event => {
              if (event.button === 0) state.point = { x: event.screenX, y: event.screenY };
            }, true);
            for (const name of ['mousedown', 'wheel', 'scroll'])
              document.addEventListener(name, () => { state.point = null; }, true);
          }
          return globalThis.__neoPdfPointer.point;
        })()`,
              )
              .catch(() => null),
          ),
        );
        const result = await frame.executeJavaScript(`(async () => {
        const viewer = document.querySelector('pdf-viewer');
        const controller = viewer?.pluginController_;
        if (!viewer?.documentDimensions || !controller?.getSelectedText) return null;
        let timer;
        try {
          const result = await Promise.race([
            controller.getSelectedText(),
            new Promise(resolve => { timer = setTimeout(() => resolve(null), 500); })
          ]);
          const text = result?.selectedText?.trim();
          return text ? { text: text.slice(0, 12000) } : null;
        } finally { clearTimeout(timer); }
      })()`);
        if (guest.isDestroyed() || readingUrl(guest.getURL()) !== url)
          return null;
        if (
          !result ||
          typeof result !== "object" ||
          !("text" in result) ||
          typeof result.text !== "string" ||
          !result.text
        )
          return null;
        const pointer = points.find(
          (point) =>
            point &&
            typeof point === "object" &&
            "x" in point &&
            "y" in point &&
            Number.isFinite(point.x) &&
            Number.isFinite(point.y),
        ) as { x: number; y: number } | undefined;
        const window = BrowserWindow.fromWebContents(event.sender);
        if (!pointer || !window) return null;
        const bounds = window.getContentBounds(),
          zoom = event.sender.getZoomFactor();
        return {
          text: result.text,
          x: (pointer.x - bounds.x) / zoom,
          y: (pointer.y - bounds.y) / zoom,
          coordinateSpace: "host",
        };
      } catch {
        return null;
      } finally {
        probing.delete(guest.id);
      }
    },
  );
  ipcMain.handle(READING_CHANNELS.cancel, (event, id: string) => {
    trust(event);
    running.get(`${event.sender.id}:${id}`)?.abort();
  });
  ipcMain.handle(READING_CHANNELS.ask, async (event, raw: ReadingRequest) => {
    trust(event);
    const input = validateReadingRequest(raw);
    const registered = getBrowserWorkbenchService().getSession(
      input.taskId,
      input.sessionId,
    );
    const guest = registered && webContents.fromId(registered.webContentsId);
    if (!guest || guest.isDestroyed() || guest.hostWebContents !== event.sender)
      throw new Error("浏览器尚未就绪，请等待页面加载完成");
    const url = readingUrl(guest.getURL());
    if (url !== readingUrl(input.url))
      throw new Error("页面已切换，请在当前页面重新提问");
    const key = `${event.sender.id}:${input.requestId}`;
    if (running.has(key) || running.size >= 4)
      throw new Error("请等待当前问题完成");
    const controller = new AbortController();
    running.set(key, controller);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const work = async () => {
      let context: ReadingContext;
      if (input.selection?.trim()) {
        context = {
          url,
          title: guest.getTitle(),
          scope: "selection",
          truncated: false,
          blocks: [{ id: "选文", text: input.selection.trim() }],
        };
      } else {
        const article = (await guest.executeJavaScript(
          CAPTURE_ARTICLE_SCRIPT,
        )) as ReturnType<typeof captureArticle>;
        controller.signal.throwIfAborted();
        context =
          article.pdf ||
          /\.pdf(?:$|\?)/i.test(url) ||
          /arxiv\.org\/pdf\//.test(url)
            ? await pdfDocument(guest, url, controller.signal)
            : {
                url,
                title: article.title,
                scope: "webpage",
                blocks: article.blocks,
                truncated: article.truncated,
              };
        if (!context.blocks.length)
          throw new Error(
            "没有读取到正文，请等待页面加载或选中一段文字。登录和付费内容需要你在网页中自行获得访问权限。",
          );
      }
      if (guest.isDestroyed() || readingUrl(guest.getURL()) !== url)
        throw new Error("页面已切换，请重新提问");
      controller.signal.throwIfAborted();
      const provider = LLMProviderFactory.createProvider();
      const model = LLMProviderFactory.getSelectedModel();
      const telemetry = {
        sourceKind: "browser_reading",
        providerType: provider.type,
        modelId: model,
      };
      const prompt = readingPrompt(
        context,
        input.question,
        input.action,
        input.history,
      );
      try {
        const response = await provider.createMessage({
          model,
          maxTokens: 3500,
          signal: controller.signal,
          system: prompt.system,
          messages: [{ role: "user", content: prompt.content }],
        });
        controller.signal.throwIfAborted();
        recordLlmCallSuccess(telemetry, response.usage);
        const text = response.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("")
          .trim();
        if (!text) throw new Error("模型没有返回文字，请重试");
        return { text, context, model };
      } catch (error) {
        recordLlmCallError(telemetry, error);
        throw error;
      }
    };
    try {
      return await Promise.race([
        work(),
        new Promise<never>((_, reject) => {
          const abort = () => reject(new Error("已停止阅读请求，可重新提问"));
          controller.signal.addEventListener("abort", abort, { once: true });
          timer = setTimeout(() => controller.abort(), 90000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      running.delete(key);
    }
  });
}
