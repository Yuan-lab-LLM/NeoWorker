import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Function>(),
  get: vi.fn(),
  refresh: vi.fn(),
  config: vi.fn(),
  save: vi.fn(),
  find: vi.fn(),
  cover: vi.fn(),
}));
vi.mock("electron", () => ({
  app: { getPath: () => "/test-profile" },
  ipcMain: { handle: (channel: string, fn: Function) => mocks.handlers.set(channel, fn) },
}));
vi.mock("../paper-news/service", () => ({
  PaperNewsService: class {
    snapshot = mocks.get;
    refresh = mocks.refresh;
    saveConfig = mocks.config;
    setSaved = mocks.save;
    findItem = mocks.find;
  },
}));
vi.mock("../paper-news/translation-model", () => ({ translateNewsWithModel: vi.fn() }));
vi.mock("../utils/network-fetch", () => ({ fetchWithSystemProxy: vi.fn() }));
vi.mock("../paper-news/covers", () => ({ PaperNewsCovers: class { get = mocks.cover; } }));
vi.mock("../paper-news/cover-renderer", () => ({ resizeNewsCover: vi.fn(), renderNewsPdfCover: vi.fn() }));
import { setupPaperNewsHandlers } from "./paper-news-handlers";
import { IPC_CHANNELS } from "../../shared/types";

describe("Paper News IPC boundary", () => {
  it("rejects every operation from foreign windows and subframes", async () => {
    const mainFrame = {},
      sender = { mainFrame };
    setupPaperNewsHandlers((event) => event.sender === sender);
    expect(mocks.handlers.size).toBe(7);
    for (const handler of mocks.handlers.values()) {
      expect(() => handler({ sender: {}, senderFrame: mainFrame })).toThrow("restricted");
      expect(() => handler({ sender, senderFrame: {} })).toThrow("restricted");
    }
    mocks.handlers.get(IPC_CHANNELS.PAPER_NEWS_SAVE)!(
      { sender, senderFrame: mainFrame },
      "arxiv:123",
      true,
    );
    expect(mocks.handlers.get(IPC_CHANNELS.PAPER_NEWS_COVER)!({ sender, senderFrame: mainFrame }, "https://127.0.0.1/private")).toBeNull();
    expect(mocks.cover).not.toHaveBeenCalled();
    await expect(mocks.handlers.get(IPC_CHANNELS.PAPER_NEWS_SUMMARY)!({ sender, senderFrame: mainFrame }, "https://127.0.0.1/private")).resolves.toEqual({ error: "unavailable" });
    await expect(mocks.handlers.get(IPC_CHANNELS.PAPER_NEWS_TRANSLATE)!({ sender, senderFrame: mainFrame }, "not-cached")).resolves.toEqual({ error: "unavailable" });
    expect(mocks.save).toHaveBeenCalledWith("arxiv:123", true);
    mocks.handlers.get(IPC_CHANNELS.PAPER_NEWS_REFRESH)!({ sender, senderFrame: mainFrame });
    expect(mocks.refresh).toHaveBeenCalledOnce();
    mocks.handlers.get(IPC_CHANNELS.PAPER_NEWS_REFRESH)!(
      { sender, senderFrame: mainFrame },
      "github",
    );
    expect(mocks.refresh).toHaveBeenLastCalledWith("github");
    expect(() =>
      mocks.handlers.get(IPC_CHANNELS.PAPER_NEWS_REFRESH)!(
        { sender, senderFrame: mainFrame },
        "https://evil.example",
      ),
    ).toThrow("Invalid paper news source");
  });
});
