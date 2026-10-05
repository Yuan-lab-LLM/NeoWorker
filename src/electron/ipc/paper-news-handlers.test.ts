import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Function>(),
  get: vi.fn(),
  refresh: vi.fn(),
  config: vi.fn(),
  follow: vi.fn(),
  save: vi.fn(),
  find: vi.fn(),
  cover: vi.fn(),
  exclude: vi.fn(),
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
    setFollowedCategories = mocks.follow;
    setSaved = mocks.save;
    findItem = mocks.find;
    excludeItem = mocks.exclude;
  },
}));
vi.mock("../paper-news/translation-model", () => ({ translateNewsWithModel: vi.fn() }));
vi.mock("../utils/network-fetch", () => ({ fetchWithSystemProxy: vi.fn() }));
vi.mock("../paper-news/covers", () => ({ PaperNewsCovers: class { get = mocks.cover; } }));
vi.mock("../paper-news/cover-renderer", () => ({ resizeNewsCover: vi.fn(), renderNewsPdfCover: vi.fn() }));
import { setupPaperNewsHandlers } from "./paper-news-handlers";
import { IPC_CHANNELS } from "../../shared/types";
import { NewsSummaries } from "../paper-news/summaries";
import { NewsTranslations } from "../paper-news/translation";

describe("Paper News IPC boundary", () => {
  it("rejects every operation from foreign windows and subframes", async () => {
    const mainFrame = {},
      sender = { mainFrame };
    setupPaperNewsHandlers((event) => event.sender === sender);
    expect(mocks.handlers.size).toBe(8);
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
    mocks.handlers.get(IPC_CHANNELS.PAPER_NEWS_FOLLOW)!({ sender, senderFrame: mainFrame }, ["health"]);
    expect(mocks.follow).toHaveBeenCalledWith(["health"]);
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
  it("persists exclusions discovered by excerpt and translation responses", async () => {
    const mainFrame = {}, sender = { mainFrame };
    setupPaperNewsHandlers(event => event.sender === sender);
    const event = { sender, senderFrame: mainFrame };
    mocks.find.mockReturnValue({ id: "qbitai:reviewed" });
    const summary = vi.spyOn(NewsSummaries.prototype, "get").mockResolvedValue({error:"excluded"});
    const translation = vi.spyOn(NewsTranslations.prototype, "get").mockResolvedValue({error:"excluded"});
    try {
      for (const channel of [IPC_CHANNELS.PAPER_NEWS_SUMMARY, IPC_CHANNELS.PAPER_NEWS_TRANSLATE]) {
        await expect(mocks.handlers.get(channel)!(event,"qbitai:reviewed")).resolves.toEqual({error:"excluded"});
      }
      expect(mocks.exclude).toHaveBeenCalledTimes(2);
      expect(mocks.exclude).toHaveBeenLastCalledWith("qbitai:reviewed");
    } finally {
      summary.mockRestore(); translation.mockRestore(); mocks.find.mockReset();
    }
  });

});
