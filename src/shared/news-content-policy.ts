/** Product scope for the curated news feed. Applies equally to all political viewpoints.
 * This deterministic metadata filter is defense in depth, not an image/body classifier.
 * Retired sources are denied independently of their current headline or translation.
 */
export interface NewsContentCandidate {
  id?: string;
  source?: string;
  title?: string;
  summary?: string;
  url?: string;
  imageUrl?: string;
  tags?: readonly string[];
}
export const NEWS_CONTENT_POLICY_VERSION = 1;
const RETIRED_SOURCES = new Set(["chinatalk"]);
const RETIRED_HOSTS = ["chinatalk.media", "chinatalk.substack.com"];
const POLITICAL_ZH = /中国崩溃|中國崩潰|中国威胁|中國威脅|西方霸权|西方霸權|民族主义|民族主義|政治|政局|政权|政權|政党|政黨|党政|黨政|党委|黨委|党建|黨建|党代会|黨代會|党史|黨史|总书记|總書記|国家主席|國家主席|国家领导人|國家領導人|总统|總統|总理|總理|首相|国会|國會|议会|議會|参议院|參議院|众议院|眾議院|大选|大選|选举|選舉|竞选|競選|两会|兩會|中共|共产党|共產黨|国民党|國民黨|民进党|民進黨|民主党|民主黨|共和党|共和黨|习近平|習近平|李强|李強|特朗普|川普|拜登|普京|泽连斯基|澤連斯基|内塔尼亚胡|內塔尼亞胡|莫迪|马克龙|馬克龍|地缘|地緣|外交|国事访问|國事訪問|国际关系|國際關係|台海|两岸|兩岸|台独|台獨|港独|港獨|疆独|疆獨|分离主义|分離主義|主权|主權|领土|領土|人权|人權|政变|政變|意识形态|意識形態|极权|極權|极端主义|極端主義|战争|戰爭|战事|戰事|停火|军队|軍隊|军方|軍方|军演|軍演|军事|軍事|武装冲突|武裝衝突|恐怖袭击|恐怖襲擊|制裁|贸易战|貿易戰|示威|抗议|抗議|镇压|鎮壓|巴以|俄乌|俄烏/;
const POLITICAL_EN = /\b(?:chinatalk|broken china|china is broken|nationalis[tm]|make america great again|politic(?:s|al|ally|ians?)|geopolitic\w*|elections?|electoral|presidential|president|prime minister|parliament\w*|congress(?:ional)?|senat(?:e|or|ors)|democrats?|republicans?|communis[tm]|ccp|cpc|kuomintang|dpp|regimes?|authoritarian\w*|dictator\w*|democra(?:cy|tic)|diploma(?:cy|tic)|state visits?|foreign affairs|foreign policy|national security|sovereignty|separatis[tm]|human rights|coup|protests?|ideolog\w*|war|wars|warfare|ceasefire|military|armed conflict|terroris[tm]|sanctions?|xi jinping|jinping|donald trump|trump|joe biden|biden|vladimir putin|putin|zelensk\w*|netanyahu|narendra modi|emmanuel macron|taiwan strait|cross strait|gaza|hamas|nato|pentagon)\b/i;

function normalizedText(value: string): string {
  return value.normalize("NFKC")
    .replace(/&#(?:x([0-9a-f]+)|(\d+));?/gi, (original, hex, decimal) => {
      const point = Number.parseInt(hex || decimal, hex ? 16 : 10);
      return point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : original;
    })
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
}
function urlText(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}
export function isNewsContentAllowed(item: NewsContentCandidate): boolean {
  const source = (item.source || item.id?.split(":")[0] || "").toLowerCase();
  if (RETIRED_SOURCES.has(source) || RETIRED_SOURCES.has(item.id?.split(":")[0]?.toLowerCase() || "")) return false;
  for (const value of [item.url, item.imageUrl]) {
    if (!value) continue;
    try {
      const host = new URL(value).hostname.toLowerCase().replace(/\.$/, "");
      if (RETIRED_HOSTS.some(retired => host === retired || host.endsWith(`.${retired}`))) return false;
    } catch { /* URL validity is enforced by the source adapter. */ }
  }
  const text = normalizedText([item.title, item.summary, ...(item.tags || []), urlText(item.url || ""), urlText(item.imageUrl || "")].filter(Boolean).join(" "));
  // These phrases refer to software mechanisms, not political reporting. Remove only
  // the phrase itself; any political content elsewhere in the same item still blocks it.
  const scoped = text.replace(/\b(?:leader elections?|election timeouts?|random forest voting|majority voting classifier|star wars)\b/gi, " ")
    .replace(/领导者选举|領導者選舉|选举超时|選舉超時/g, " ");
  return !POLITICAL_ZH.test(scoped) && !POLITICAL_EN.test(scoped);
}

/** Sanitize an entire snapshot before exposing counts, bookmarks or article controls. */
export function filterNewsSnapshot<T extends { items: NewsContentCandidate[]; saved: NewsContentCandidate[] }>(snapshot: T): T {
  return { ...snapshot, items: snapshot.items.filter(isNewsContentAllowed), saved: snapshot.saved.filter(isNewsContentAllowed) };
}
