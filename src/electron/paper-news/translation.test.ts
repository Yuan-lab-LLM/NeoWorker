import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { PaperNewsItem } from "../../shared/paper-news";
import { needsNewsTranslation } from "../../shared/news-translation";
import { NewsTranslations } from "./translation";
const dirs: string[] = [];
afterEach(() =>
  dirs
    .splice(0)
    .forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })),
);
const file = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "news-translation-"));
  dirs.push(dir);
  return path.join(dir, "cache.json");
};
const item: PaperNewsItem = {
  id: "arxiv:1234.56789",
  source: "arxiv",
  title: "Learning to use tools",
  summary: "A study of agents that learn to use tools.",
  url: "https://arxiv.org/abs/1234.56789",
  authors: [],
  date: "",
  tags: [],
  matchedTopics: [],
  score: 0,
};
const translated = JSON.stringify({
  title: "学习使用工具",
  summary: "一项关于学习使用工具的智能体的研究。",
});
describe("news card translation", () => {
  it("deduplicates calls and persists exact-content translations across restarts", async () => {
    const cache = file();
    const run = vi.fn(async () => translated);
    const service = new NewsTranslations(cache, run);
    const [a, b] = await Promise.all([service.get(item), service.get(item)]);
    expect(a).toEqual(b);
    expect(run).toHaveBeenCalledTimes(1);
    const restored = new NewsTranslations(cache, run);
    expect(await restored.get(item)).toEqual(a);
    expect(run).toHaveBeenCalledTimes(1);
    await restored.get({
      ...item,
      summary: "A revised abstract about tool usage.",
    });
    expect(run).toHaveBeenCalledTimes(2);
  });
  it("never invents a missing summary or translates a repository identifier", async () => {
    const run = vi.fn(async () => translated);
    const service = new NewsTranslations(file(), run);
    const result = await service.get({ ...item, summary: "" });
    expect(result).toMatchObject({
      translation: { summary: "", title: "学习使用工具" },
    });
    expect(
      await service.get({
        ...item,
        id: "github:org/tools",
        source: "github",
        title: "org/tools",
      }),
    ).toMatchObject({ translation: { title: "org/tools" } });
  });
  it("skips Chinese content, empty model cards and unknown IDs without model calls", async () => {
    const run = vi.fn(async () => translated);
    const service = new NewsTranslations(file(), run);
    expect(await service.get(undefined)).toEqual({ error: "unavailable" });
    await service.get({
      ...item,
      title: "智能体学习使用工具",
      summary: "保留来源提供的中文摘要。",
    });
    await service.get({
      ...item,
      source: "hf-models",
      title: "Qwen/Qwen3-8B",
      summary: "",
    });
    expect(run).not.toHaveBeenCalled();
    expect(needsNewsTranslation(item)).toBe(true);
  });
  it("retains originals on malformed, unchanged-English, incomplete and failed responses; retries explicitly", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce("not json")
      .mockResolvedValueOnce(
        JSON.stringify({ title: item.title, summary: item.summary }),
      )
      .mockResolvedValueOnce(JSON.stringify({ title: "学习工具", summary: "" }))
      .mockRejectedValueOnce(new Error("secret upstream error"))
      .mockResolvedValue(translated);
    const service = new NewsTranslations(file(), run);
    for (let i = 0; i < 4; i++)
      expect(await service.get(item)).toEqual({ error: "failed" });
    expect(await service.get(item)).toHaveProperty("translation");
    expect(item.summary).toBe("A study of agents that learn to use tools.");
  });
  it("bounds concurrent model work and tolerates corrupt cache", async () => {
    const cache = file();
    fs.writeFileSync(cache, "invalid");
    let finish!: (value: string) => void;
    const gate = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const service = new NewsTranslations(cache, () => gate);
    const a = service.get(item),
      b = service.get({ ...item, id: "arxiv:other" });
    expect(await service.get({ ...item, id: "arxiv:third" })).toEqual({
      error: "busy",
    });
    finish(translated);
    await Promise.all([a, b]);
    expect(await service.get({ ...item, id: "arxiv:third" })).toHaveProperty(
      "translation",
    );
  });
  it("reports missing model configuration without exposing secrets", async () => {
    const service = new NewsTranslations(file(), async () => {
      throw new Error("NEWS_MODEL_UNAVAILABLE");
    });
    expect(await service.get(item)).toEqual({ error: "model" });
  });
});
