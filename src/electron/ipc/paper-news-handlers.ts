import { NewsTranslations } from "../paper-news/translation";
import { translateNewsWithModel } from "../paper-news/translation-model";
import { PaperNewsCovers } from "../paper-news/covers";
import { resizeNewsCover, renderNewsPdfCover } from "../paper-news/cover-renderer";
import { app, ipcMain, type IpcMainInvokeEvent } from "electron";
import * as path from "node:path";
import { PAPER_NEWS_SOURCES, type PaperNewsSource } from "../../shared/paper-news";
import { IPC_CHANNELS } from "../../shared/types";
import { PaperNewsService } from "../paper-news/service";
import { fetchWithSystemProxy } from "../utils/network-fetch";

export function setupPaperNewsHandlers(isTrusted: (event: IpcMainInvokeEvent) => boolean): void {
  const service = new PaperNewsService(
    path.join(app.getPath("userData"), "paper-news.json"),
    fetchWithSystemProxy,
  );
  const translations = new NewsTranslations(
    path.join(app.getPath("userData"), "news-translations-zh.json"),
    translateNewsWithModel,
  );
  const covers = new PaperNewsCovers(
    path.join(app.getPath("userData"), "news-covers"),
    fetchWithSystemProxy,
    resizeNewsCover,
    renderNewsPdfCover,
  );
  const handle = (channel: string, run: (...args: unknown[]) => unknown) => {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      if (!isTrusted(event) || event.senderFrame !== event.sender.mainFrame)
        throw new Error("Paper news access is restricted to the main app window");
      return run(...args);
    });
  };
  handle(IPC_CHANNELS.PAPER_NEWS_TRANSLATE, (id: unknown) => translations.get(service.findItem(id)));
  handle(IPC_CHANNELS.PAPER_NEWS_COVER, (id: unknown) => {
    const item = service.findItem(id);
    return item ? covers.get(item) : null;
  });
  handle(IPC_CHANNELS.PAPER_NEWS_GET, () => service.snapshot());
  handle(IPC_CHANNELS.PAPER_NEWS_REFRESH, (source: unknown) => {
    if (
      source !== undefined &&
      !(Array.isArray(source)
        ? source.length <= PAPER_NEWS_SOURCES.length &&
          source.every((s) => PAPER_NEWS_SOURCES.includes(s))
        : PAPER_NEWS_SOURCES.includes(source as PaperNewsSource))
    )
      throw new Error("Invalid paper news source");
    return service.refresh(source as PaperNewsSource | PaperNewsSource[] | undefined);
  });
  handle(IPC_CHANNELS.PAPER_NEWS_CONFIG, (config: unknown) => service.saveConfig(config));
  handle(IPC_CHANNELS.PAPER_NEWS_SAVE, (id: unknown, saved: unknown) =>
    service.setSaved(id, saved),
  );
}
