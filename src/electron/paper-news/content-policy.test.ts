import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PaperNewsService } from "./service";
import { NewsTranslations } from "./translation";
import { NewsSummaries } from "./summaries";
import { PaperNewsCovers } from "./covers";
import { DEFAULT_PAPER_NEWS_CONFIG, type PaperNewsItem } from "../../shared/paper-news";
const dirs: string[] = [];
const cache = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "news-scope-test-")); dirs.push(dir); return path.join(dir, "news.json"); };
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, {recursive:true, force:true}); });
const now = Date.parse("2026-09-30T12:00:00Z");
const neutral: PaperNewsItem = { id: "qbitai:neutral", source: "qbitai", title: "新一代 GPU 性能评测", summary: "分析推理效率与能耗表现。", authors: [], date: "2026-09-30T00:00:00Z", tags: [], matchedTopics: [], score: 0, url: "https://www.qbitai.com/2026/09/123" };
const political = { ...neutral, id: "qbitai:political", title: "总统竞选最新消息", url: "https://www.qbitai.com/2026/09/456" };
function seed(file: string, items: unknown[], version = 4) {
  fs.writeFileSync(file, JSON.stringify({ version, config: {...DEFAULT_PAPER_NEWS_CONFIG, chinatalk: {topics:[],days:365}}, items, saved: items, sources: {chinatalk: {updatedAt: new Date(now).toISOString()}} }));
}
describe("news content policy across persistence and derived content", () => {
  it.each([1,2,3,4])("purges political and retired-source records before exposing version %s cache/bookmarks", version => {
    const file = cache();
    seed(file, [neutral, political, {...neutral, id:"chinatalk:old",source:"chinatalk",title:"Logan Wright on Broken China",url:"https://www.chinatalk.media/p/broken-china"}], version);
    const service = new PaperNewsService(file, vi.fn(), () => now);
    expect(service.snapshot().items.map(i=>i.id)).toEqual([neutral.id]);
    expect(service.snapshot().saved.map(i=>i.id)).toEqual([neutral.id]);
    expect(service.findItem(political.id)).toBeUndefined();
    expect(service.findItem("chinatalk:old")).toBeUndefined();
    expect(()=>service.setSaved(political.id,true)).toThrow("unavailable");
    const persisted = fs.readFileSync(file,"utf8");
    expect(persisted).not.toContain("chinatalk");
    expect(persisted).not.toContain(political.title);
    expect(JSON.parse(persisted).contentPolicyVersion).toBe(1);
  });
  it("rejects retired sources and filters fetched articles before persistence", async () => {
    const file = cache();
    const feed = `<rss><channel>${[neutral, political].map(i=>`<item><title>${i.title}</title><link>${i.url}</link><description>${i.summary}</description><pubDate>Wed, 30 Sep 2026 00:00:00 GMT</pubDate></item>`).join('')}</channel></rss>`;
    const fetcher = vi.fn(async()=>new Response(feed));
    const service = new PaperNewsService(file,fetcher,()=>now);
    expect(()=>service.refresh("chinatalk" as never)).toThrow("Invalid");
    const state=await service.refresh("qbitai");
    expect(state.items.map(i=>i.title)).toEqual([neutral.title]);
    expect(fs.readFileSync(file,"utf8")).not.toContain(political.title);
  });
  it("removes a previously bland card when its fetched summary reveals political content", () => {
    const file=cache(); const item={...neutral,summary:""};seed(file,[item]);
    const service=new PaperNewsService(file,vi.fn(),()=>now);
    service.applySummary(item,{summary:"Foreign policy and presidential elections",kind:"description"});
    expect(service.snapshot().items).toEqual([]);expect(service.snapshot().saved).toEqual([]);
    expect(service.findItem(item.id)).toBeUndefined();
    expect(new PaperNewsService(file,vi.fn(),()=>now).snapshot().items).toEqual([]);
    expect(JSON.parse(fs.readFileSync(file,"utf8")).excludedIds).toContain(item.id);
  });
  it("keeps explicitly excluded IDs blocked across restarts and refreshes", async () => {
    const file=cache();seed(file,[neutral]);
    const service=new PaperNewsService(file,vi.fn(),()=>now);service.excludeItem(neutral.id);
    const state=JSON.parse(fs.readFileSync(file,"utf8"));state.items=[neutral];state.saved=[neutral];fs.writeFileSync(file,JSON.stringify(state));
    const restored=new PaperNewsService(file,vi.fn(),()=>now);
    expect(restored.snapshot().items).toEqual([]);expect(restored.findItem(neutral.id)).toBeUndefined();
  });
  it("does not fetch a cover, summary or translation for a blocked article", async () => {
    const fetcher=vi.fn();const model=vi.fn();
    expect(await new PaperNewsCovers(path.dirname(cache()),fetcher,vi.fn(),vi.fn()).get(political)).toBeNull();
    expect(await new NewsSummaries(fetcher).get(political)).toEqual({error:"excluded"});
    expect(await new NewsTranslations(cache(),model).get(political)).toEqual({error:"excluded"});
    expect(fetcher).not.toHaveBeenCalled();expect(model).not.toHaveBeenCalled();
  });
  it("checks fetched excerpts and translated output before returning them to the renderer", async () => {
    const fetcher=vi.fn(async()=>new Response('<meta name="description" content="Political leaders discuss foreign policy and election results.">',{headers:{"content-type":"text/html"}}));
    expect(await new NewsSummaries(fetcher).get({...neutral,summary:""})).toEqual({error:"excluded"});
    const source={...neutral,title:"A new computing platform",summary:"Improved inference throughput and energy efficiency."};
    const file=cache();const model=vi.fn(async()=>JSON.stringify({title:"总统发表政治演讲",summary:"讨论选举及外交政策"}));
    expect(await new NewsTranslations(file,model).get(source)).toEqual({error:"excluded"});
    expect(fs.existsSync(file)).toBe(false);
  });
  it("purges old political translations instead of serving their cached text", () => {
    const file=cache();fs.writeFileSync(file,JSON.stringify([
      {id:"chinatalk:old",originalTitle:"Old story",originalSummary:"",title:"历史标题",summary:""},
      {id:neutral.id,originalTitle:"Election results",originalSummary:"",title:"选举结果",summary:""},
    ]));
    new NewsTranslations(file,vi.fn());
    expect(JSON.parse(fs.readFileSync(file,"utf8"))).toEqual([]);
  });
});
