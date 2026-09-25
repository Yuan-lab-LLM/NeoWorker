import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  normalizePaperNewsConfig,
  paperNewsEndpoint,
  parsePaperNews,
  rankPaperNews,
} from "./adapters";
import { PaperNewsService } from "./service";
import {
  DEFAULT_PAPER_NEWS_CONFIG,
  type PaperNewsConfig,
  paperNewsPrompt,
} from "../../shared/paper-news";
import { HF_HUB_SOURCES } from "../../shared/news-hub";
import { getNewsPreferences, newsCategory } from "../../shared/news-preferences";
const now = Date.parse("2026-09-25T12:00:00Z");
const row = {
  id: "org/Agent-v1",
  author: "org",
  lastModified: "2026-09-24T10:00:00Z",
  likes: 23,
  downloads: 456,
  pipeline_tag: "text-generation",
  tags: ["agents", "license:apache-2.0"],
  cardData: { license: "apache-2.0" },
  private: false,
  gated: false,
};
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
function file() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hf-news-test-"));
  dirs.push(dir);
  return path.join(dir, "news.json");
}
describe("Hugging Face models and datasets", () => {
  it.each(HF_HUB_SOURCES)("parses %s metadata and canonical repository links", (source) => {
    const [item] = parsePaperNews(
      source,
      JSON.stringify([
        row,
        row,
        { ...row, id: "../bad" },
        { ...row, id: "private/hidden", private: true },
      ]),
    );
    expect(parsePaperNews(source, JSON.stringify([row, row]))).toHaveLength(1);
    expect(item).toMatchObject({
      source,
      id: `${source}:org/Agent-v1`,
      popularity: 23,
      downloads: 456,
      license: "apache-2.0",
      hubTask: "text-generation",
    });
    expect(item.url).toBe(
      `https://huggingface.co/${source === "hf-datasets" ? "datasets/" : ""}org/Agent-v1`,
    );
    expect(item.pdfUrl).toBeUndefined();
    expect(newsCategory(source)).toBe("development");
    expect(() => parsePaperNews(source, '{"error":"limit"}')).toThrow();
    expect(paperNewsPrompt(item, "translate", "zh-CN")).toContain("Markdown");
    expect(paperNewsPrompt(item, "translate", "zh-CN")).not.toContain("输出中文 PDF");
  });
  it("adds new defaults to old caches without replacing customized settings", () => {
    const old: Omit<PaperNewsConfig, "hf-models" | "hf-datasets"> &
      Partial<Pick<PaperNewsConfig, "hf-models" | "hf-datasets">> =
      structuredClone(DEFAULT_PAPER_NEWS_CONFIG);
    delete old["hf-models"];
    delete old["hf-datasets"];
    old.github.language = "Rust";
    const config = normalizePaperNewsConfig(old);
    expect(config.github.language).toBe("Rust");
    expect(config["hf-models"].listSort).toBe("trendingScore");
    const prefs = getNewsPreferences(config);
    prefs.categories.development.days = 30;
    prefs.sources["hf-models"] = { days: 7, topics: ["agents"] };
    const inherited = normalizePaperNewsConfig({
      ...config,
      preferences: prefs,
    });
    expect(inherited["hf-models"].days).toBe(7);
    expect(inherited["hf-datasets"].days).toBe(30);
    expect(new URL(paperNewsEndpoint("hf-models", inherited, now)).searchParams.get("limit")).toBe(
      "60",
    );
    expect(() =>
      normalizePaperNewsConfig({
        ...config,
        "hf-models": { ...config["hf-models"], listSort: "invalid" },
      }),
    ).toThrow();
  });
  it("filters dates and optional topic matches without confusing the two feeds", () => {
    const config = structuredClone(DEFAULT_PAPER_NEWS_CONFIG);
    config["hf-models"] = {
      ...config["hf-models"],
      topics: ["agents"],
      matchedOnly: true,
    };
    const items = parsePaperNews(
      "hf-models",
      JSON.stringify([
        row,
        {
          ...row,
          id: "other/vision",
          tags: ["vision"],
          pipeline_tag: "image-classification",
        },
        { ...row, id: "old/model", lastModified: "2020-01-01" },
      ]),
    );
    expect(rankPaperNews(items, config, now).map((i) => i.title)).toEqual([row.id]);
  });
  it("fetches anonymously, restores bookmarks, preserves cache on failure and respects disabled feeds", async () => {
    const cache = file();
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify([row])));
    const service = new PaperNewsService(cache, fetcher, () => now);
    await service.refresh([...HF_HUB_SOURCES]);
    expect(service.snapshot().items).toHaveLength(2);
    expect(fetcher.mock.calls).toHaveLength(2);
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      credentials: "omit",
      redirect: "manual",
    });
    service.setSaved(service.snapshot().items[0].id, true);
    const retry = new PaperNewsService(
      cache,
      async () => new Response("busy", { status: 429 }),
      () => now + 31 * 60_000,
    );
    expect(retry.snapshot().saved).toHaveLength(1);
    await retry.refresh("hf-models");
    expect(retry.snapshot().items).toHaveLength(2);
    expect(retry.snapshot().sources["hf-models"].error).toBe("rateLimit");
    const preferences = getNewsPreferences(retry.snapshot().config);
    preferences.categories.development.disabledSources = [...HF_HUB_SOURCES];
    retry.saveConfig({ ...retry.snapshot().config, preferences });
    expect(retry.snapshot().items).toHaveLength(0);
    expect(retry.snapshot().saved).toHaveLength(1);
    const finalFetch = vi.fn();
    const reloaded = new PaperNewsService(cache, finalFetch, () => now + 60 * 60_000);
    await reloaded.refresh([...HF_HUB_SOURCES]);
    expect(finalFetch).not.toHaveBeenCalled();
  });
});
