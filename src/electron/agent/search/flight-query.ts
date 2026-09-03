import { SearchResult } from "./types";

export interface FlightRoute {
  fromCity: string;
  fromCode: string;
  toCity: string;
  toCode: string;
  date?: string;
}

interface CityAlias {
  city: string;
  code: string;
  aliases: string[];
}

// Keep this table deliberately small and explicit. It is used only to build
// search queries, never to invent a flight, time, seat or price.
const CITY_ALIASES: CityAlias[] = [
  { city: "北京", code: "PEK", aliases: ["北京", "beijing", "pek", "首都机场"] },
  { city: "上海", code: "SHA", aliases: ["上海", "shanghai", "sha", "虹桥", "浦东"] },
  { city: "广州", code: "CAN", aliases: ["广州", "guangzhou", "can"] },
  { city: "深圳", code: "SZX", aliases: ["深圳", "shenzhen", "szx"] },
  { city: "成都", code: "CTU", aliases: ["成都", "chengdu", "ctu", "天府"] },
  { city: "重庆", code: "CKG", aliases: ["重庆", "chongqing", "ckg"] },
  { city: "杭州", code: "HGH", aliases: ["杭州", "hangzhou", "hgh"] },
  { city: "西安", code: "XIY", aliases: ["西安", "xian", "xi'an", "xiy"] },
  { city: "武汉", code: "WUH", aliases: ["武汉", "wuhan", "wuh"] },
  { city: "南京", code: "NKG", aliases: ["南京", "nanjing", "nkg"] },
  { city: "厦门", code: "XMN", aliases: ["厦门", "xiamen", "xmn"] },
  { city: "青岛", code: "TAO", aliases: ["青岛", "qingdao", "tao"] },
  { city: "三亚", code: "SYX", aliases: ["三亚", "sanya", "syx"] },
  { city: "昆明", code: "KMG", aliases: ["昆明", "kunming", "kmg"] },
  { city: "大连", code: "DLC", aliases: ["大连", "dalian", "dlc"] },
  { city: "东京", code: "TYO", aliases: ["东京", "tokyo", "tyo", "成田", "羽田"] },
  { city: "大阪", code: "OSA", aliases: ["大阪", "osaka", "osa", "关西"] },
  { city: "香港", code: "HKG", aliases: ["香港", "hong kong", "hongkong", "hkg"] },
  { city: "新加坡", code: "SIN", aliases: ["新加坡", "singapore", "sin"] },
  { city: "首尔", code: "SEL", aliases: ["首尔", "seoul", "sel", "仁川"] },
  { city: "纽约", code: "NYC", aliases: ["纽约", "new york", "nyc"] },
  { city: "伦敦", code: "LON", aliases: ["伦敦", "london", "lon"] },
  { city: "巴黎", code: "PAR", aliases: ["巴黎", "paris", "par"] },
  { city: "旧金山", code: "SFO", aliases: ["旧金山", "san francisco", "sfo"] },
  { city: "洛杉矶", code: "LAX", aliases: ["洛杉矶", "los angeles", "lax"] },
];

const SORTED_ALIASES = CITY_ALIASES.flatMap((city) =>
  city.aliases.map((alias) => ({ alias, city })),
).sort((a, b) => b.alias.length - a.alias.length);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findCityMentions(query: string): Array<{ city: CityAlias; index: number }> {
  const lowered = query.toLowerCase();
  const mentions: Array<{ city: CityAlias; index: number }> = [];
  for (const { alias, city } of SORTED_ALIASES) {
    const pattern = new RegExp(`(?:^|[^a-z])${escapeRegExp(alias.toLowerCase())}(?:$|[^a-z])`, "i");
    const match = pattern.exec(lowered);
    if (!match || match.index < 0) continue;
    const index = match.index + (match[0].length - alias.length) / 2;
    if (mentions.some((item) => item.city.code === city.code && Math.abs(item.index - index) < alias.length)) {
      continue;
    }
    mentions.push({ city, index });
  }
  return mentions.sort((a, b) => a.index - b.index);
}

function extractDate(query: string): string | undefined {
  const match = query.match(
    /(20\d{2}[年/-]\d{1,2}[月/-]\d{1,2}日?|\d{1,2}月\d{1,2}日|\d{1,2}[/-]\d{1,2}|明天|后天|今天)/i,
  );
  return match?.[1];
}

export function isFlightQuery(query: string): boolean {
  return /(航班|机票|飞机|航空|flight|airfare|airline|airport|飞往|飞到|飞去)/i.test(query);
}

export function extractFlightRoute(query: string): FlightRoute | null {
  if (!isFlightQuery(query) && !/[A-Za-z]{3}\s*(?:-|→|>|至|到|to)\s*[A-Za-z]{3}/i.test(query)) {
    return null;
  }

  const codeRoute = query.match(
    /(?:^|[^A-Za-z])([A-Za-z]{3})\s*(?:-|→|>|至|到|to)\s*([A-Za-z]{3})(?:$|[^A-Za-z])/i,
  );
  if (codeRoute) {
    const from = CITY_ALIASES.find((city) => city.code === codeRoute[1].toUpperCase());
    const to = CITY_ALIASES.find((city) => city.code === codeRoute[2].toUpperCase());
    if (from && to && from.code !== to.code) {
      return {
        fromCity: from.city,
        fromCode: from.code,
        toCity: to.city,
        toCode: to.code,
        date: extractDate(query),
      };
    }
  }

  const mentions = findCityMentions(query);
  if (mentions.length < 2) return null;
  const [from, to] = mentions;
  if (from.city.code === to.city.code) return null;
  return {
    fromCity: from.city.city,
    fromCode: from.city.code,
    toCity: to.city.city,
    toCode: to.city.code,
    date: extractDate(query),
  };
}

export function buildFlightQueryVariants(query: string): string[] {
  const route = extractFlightRoute(query);
  if (!route) return [query.trim()];

  const date = route.date ? ` ${route.date}` : "";
  const variants = [
    query.trim(),
    `${route.fromCode} ${route.toCode} flight schedule${date}`,
    `${route.fromCity} ${route.toCity} 航班时刻表${date}`,
    `site:trip.com ${route.fromCode} ${route.toCode} flights${date}`,
  ];
  return Array.from(new Set(variants.filter(Boolean))).slice(0, 4);
}

function containsSignal(value: string, signals: string[]): boolean {
  const lowered = value.toLowerCase();
  return signals.some((signal) => lowered.includes(signal.toLowerCase()));
}

export function filterFlightResults(
  results: SearchResult[],
  route: FlightRoute,
): { results: SearchResult[]; matchedCount: number } {
  const fromSignals = [route.fromCode, route.fromCity];
  const toSignals = [route.toCode, route.toCity];
  const filtered = results.filter((result) => {
    const haystack = `${result.title} ${result.url} ${result.snippet}`;
    return containsSignal(haystack, fromSignals) && containsSignal(haystack, toSignals);
  });

  // A provider may omit city/IATA tokens from otherwise relevant snippets.
  // Keep the original response in that case rather than turning a valid
  // search into an empty answer; the caller still exposes the policy metadata
  // so the model knows that the evidence was not route-confirmed.
  return {
    results: filtered.length > 0 ? filtered : results,
    matchedCount: filtered.length,
  };
}

export function getFlightRouteTable(): ReadonlyArray<Pick<CityAlias, "city" | "code">> {
  return CITY_ALIASES.map(({ city, code }) => ({ city, code }));
}
