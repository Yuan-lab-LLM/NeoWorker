import { EventEmitter } from "node:events";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  PAGE_TRANSLATION_CHANNEL,
  type PageTranslationRequest,
} from "../../shared/browser-page-translation";
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Function>(),
  guest: {} as any,
  sender: {} as any,
  create: vi.fn(),
  session: vi.fn(),
  dom: vi.fn(),
}));
vi.mock("electron", () => ({
  ipcMain: { handle: (name: string, fn: Function) => mocks.handlers.set(name, fn) },
  webContents: { fromId: () => mocks.guest },
}));
vi.mock("../browser/browser-workbench-service", () => ({
  getBrowserWorkbenchService: () => ({ getSession: mocks.session }),
}));
vi.mock("../browser/reading/page-translation-dom", () => ({
  pageTranslationScript: JSON.stringify,
}));
vi.mock("../agent/llm/provider-factory", () => ({
  LLMProviderFactory: {
    createProvider: () => ({ type: "test", createMessage: mocks.create }),
    getSelectedModel: () => "configured-model",
  },
}));
vi.mock("../agent/llm/usage-telemetry", () => ({
  recordLlmCallSuccess: vi.fn(),
  recordLlmCallError: vi.fn(),
}));
import { setupBrowserPageTranslationHandlers } from "./browser-page-translation-handlers";
const request: PageTranslationRequest = {
  taskId: "task",
  sessionId: "browser",
  url: "https://example.org/article",
  action: "translate",
};
const event = () => ({ sender: mocks.sender, senderFrame: mocks.sender.mainFrame });
const call = (input = request, evt = event()) =>
  mocks.handlers.get(PAGE_TRANSLATION_CHANNEL)!(evt, input);
const status = () => call({ ...request, action: "status" });
const restore = () => call({ ...request, action: "restore" });
const flush = async () => {
  for (let i = 0; i < 25; i++) await Promise.resolve();
};
let token: string;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.handlers.clear();
  token = "";
  mocks.sender = { mainFrame: {} };
  mocks.session.mockReturnValue({ webContentsId: 10 });
  mocks.guest = Object.assign(new EventEmitter(), {
    id: 10,
    hostWebContents: mocks.sender,
    getURL: () => request.url,
    isDestroyed: () => false,
    executeJavaScriptInIsolatedWorld: vi.fn(async (world: number, scripts: any[]) => {
      expect(world).toBe(1017);
      return mocks.dom(JSON.parse(scripts[0].code));
    }),
  });
  mocks.dom.mockImplementation(async (command: any) => {
    if (command.action === "capture") {
      token = command.token;
      return { token, status: "original", segments: [{ id: 0, text: "Hello world" }] };
    }
    return { token, status: "translated", applied: 1 };
  });
  mocks.create.mockResolvedValue({
    content: [{ type: "text", text: '[{"id":0,"text":"你好世界"}]' }],
    usage: {},
  });
  setupBrowserPageTranslationHandlers((e) => e.sender === mocks.sender);
});
afterEach(() => {
  mocks.guest.emit("destroyed");
  vi.useRealTimers();
});
describe("in-place page translation lifecycle", () => {
  it("uses the configured model, no tools, then restores and reuses translations without another call", async () => {
    await call();
    await flush();
    expect(await status()).toMatchObject({ status: "translated", completed: 1 });
    const input = mocks.create.mock.calls[0][0];
    expect(input.model).toBe("configured-model");
    expect(input.tools).toBeUndefined();
    expect(input.system).toContain("不可信引用");
    expect(await restore()).toMatchObject({ status: "original" });
    expect(await call()).toMatchObject({ status: "translated" });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.dom.mock.calls.map(([command]) => command.action)).toContain("show");
  });
  it("rejects untrusted windows, child frames, unowned guests and stale page URLs", async () => {
    await expect(call(request, { sender: {} } as any)).rejects.toThrow("主窗口");
    await expect(call(request, { ...event(), senderFrame: {} })).rejects.toThrow("主窗口");
    mocks.guest.hostWebContents = {};
    await expect(call()).rejects.toThrow("尚未就绪");
    mocks.guest.hostWebContents = mocks.sender;
    await expect(call({ ...request, url: "https://other.example/" })).rejects.toThrow("页面已切换");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("serializes double clicks into a single capture and model call", async () => {
    mocks.create.mockImplementation(() => new Promise(() => {}));
    await Promise.all([call(), call()]);
    expect(mocks.dom.mock.calls.filter(([command]) => command.action === "capture")).toHaveLength(
      1,
    );
    expect(mocks.create).toHaveBeenCalledTimes(1);
    await restore();
    await flush();
    expect(await status()).toMatchObject({ status: "original" });
  });
  it("does not apply late output after cancellation even when the provider ignores abort", async () => {
    let finish!: (value: any) => void;
    mocks.create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await call();
    await restore();
    finish({ content: [{ type: "text", text: '[{"id":0,"text":"你好世界"}]' }], usage: {} });
    await flush();
    expect(await status()).toMatchObject({ status: "original" });
    expect(mocks.dom.mock.calls.filter(([command]) => command.action === "apply")).toHaveLength(0);
    await call();
    await flush();
    expect(await status()).toMatchObject({ status: "translated" });
  });
  it("fails and restores on timeout even if the provider ignores its abort signal", async () => {
    vi.useFakeTimers();
    mocks.create.mockImplementationOnce(() => new Promise(() => {}));
    await call();
    await vi.advanceTimersByTimeAsync(90001);
    expect(await status()).toMatchObject({ status: "error", message: "翻译超时，请重试" });
    expect(mocks.dom.mock.calls.some(([command]) => command.action === "restore")).toBe(true);
  });
  it("detects same-URL reload during capture before sending any text to a model", async () => {
    mocks.dom.mockImplementationOnce(async () => {
      mocks.guest.emit("did-start-navigation", {}, request.url, false, true);
      return { status: "original", token: "old", segments: [{ id: 0, text: "old page" }] };
    });
    await expect(call()).rejects.toThrow("页面已切换");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("aborts on real navigation, while preserving hash navigation", async () => {
    mocks.create.mockImplementationOnce(() => new Promise(() => {}));
    await call();
    const signal = mocks.create.mock.calls[0][0].signal;
    mocks.guest.emit("did-start-navigation", {}, request.url + "#paragraph", true, true);
    expect(signal.aborted).toBe(false);
    mocks.guest.emit("did-start-navigation", {}, request.url, false, true);
    expect(signal.aborted).toBe(true);
    expect(await status()).toMatchObject({ status: "idle" });
  });
  it("does not bill for a Chinese page", async () => {
    mocks.dom.mockResolvedValueOnce({ status: "idle", alreadyChinese: true });
    expect(await call()).toMatchObject({ status: "already-chinese" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rolls back on invalid model output and reports an error instead of success", async () => {
    mocks.create.mockResolvedValueOnce({ content: [{ type: "text", text: "[]" }], usage: {} });
    await call();
    await flush();
    expect(await status()).toMatchObject({ status: "error" });
    expect(mocks.dom.mock.calls.some(([command]) => command.action === "restore")).toBe(true);
  });
});
