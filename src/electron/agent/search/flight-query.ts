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
  { city: "沈阳", code: "SHE", aliases: ["沈阳", "shenyang", "she"] },
  { city: "长沙", code: "CSX", aliases: ["长沙", "changsha", "csx"] },
  { city: "郑州", code: "CGO", aliases: ["郑州", "zhengzhou", "cgo"] },
  { city: "海口", code: "HAK", aliases: ["海口", "haikou", "hak"] },
  { city: "天津", code: "TSN", aliases: ["天津", "tianjin", "tsn"] },
  { city: "济南", code: "TNA", aliases: ["济南", "jinan", "tna"] },
  { city: "福州", code: "FOC", aliases: ["福州", "fuzhou", "foc"] },
  { city: "宁波", code: "NGB", aliases: ["宁波", "ningbo", "ngb"] },
  { city: "乌鲁木齐", code: "URC", aliases: ["乌鲁木齐", "urumqi", "urc"] },
  { city: "贵阳", code: "KWE", aliases: ["贵阳", "guiyang", "kwe"] },
  { city: "南昌", code: "KHN", aliases: ["南昌", "nanchang", "khn"] },
  { city: "合肥", code: "HFE", aliases: ["合肥", "hefei", "hfe"] },
  { city: "温州", code: "WNZ", aliases: ["温州", "wenzhou", "wnz"] },
  { city: "兰州", code: "LHW", aliases: ["兰州", "lanzhou", "lhw"] },
  { city: "石家庄", code: "SJW", aliases: ["石家庄", "shijiazhuang", "sjw"] },
  { city: "太原", code: "TYN", aliases: ["太原", "taiyuan", "tyn"] },
  { city: "呼和浩特", code: "HET", aliases: ["呼和浩特", "hohhot", "het"] },
  { city: "长春", code: "CGQ", aliases: ["长春", "changchun", "cgq"] },
  { city: "桂林", code: "KWL", aliases: ["桂林", "guilin", "kwl"] },
  { city: "珠海", code: "ZUH", aliases: ["珠海", "zhuhai", "zuh"] },
  { city: "南宁", code: "NNG", aliases: ["南宁", "nanning", "nng"] },
  { city: "银川", code: "INC", aliases: ["银川", "yinchuan", "inc"] },
  { city: "西宁", code: "XNN", aliases: ["西宁", "xining", "xnn"] },
  { city: "拉萨", code: "LXA", aliases: ["拉萨", "lhasa", "lxa"] },
  { city: "张家界", code: "DYG", aliases: ["张家界", "zhangjiajie", "dyg"] },
  { city: "宜昌", code: "YIH", aliases: ["宜昌", "yichang", "yih"] },
  { city: "泉州", code: "JJN", aliases: ["泉州", "quanzhou", "jjn"] },
  { city: "哈尔滨", code: "HRB", aliases: ["哈尔滨", "harbin", "hrb"] },
  { city: "汕头", code: "SWA", aliases: ["汕头", "shantou", "swa"] },
  { city: "惠州", code: "HUZ", aliases: ["惠州", "huizhou", "huz"] },
  { city: "洛阳", code: "LYA", aliases: ["洛阳", "luoyang", "lya"] },
  { city: "烟台", code: "YNT", aliases: ["烟台", "yantai", "ynt"] },
  { city: "威海", code: "WEH", aliases: ["威海", "weihai", "weh"] },
  { city: "徐州", code: "XUZ", aliases: ["徐州", "xuzhou", "xuz"] },
  { city: "常州", code: "CZX", aliases: ["常州", "changzhou", "czx"] },
  { city: "鄂尔多斯", code: "DSN", aliases: ["鄂尔多斯", "ordos", "dsn"] },
  { city: "海拉尔", code: "HLD", aliases: ["海拉尔", "hailaer", "hld"] },
  { city: "牡丹江", code: "MDG", aliases: ["牡丹江", "mudanjiang", "mdg"] },
  { city: "绵阳", code: "MIG", aliases: ["绵阳", "mianyang", "mig"] },
  { city: "黄山", code: "TXN", aliases: ["黄山", "huangshan", "txn"] },
  { city: "赣州", code: "KOW", aliases: ["赣州", "ganzhou", "kow"] },
  { city: "东京", code: "TYO", aliases: ["东京", "tokyo", "tyo", "成田", "羽田"] },
  { city: "大阪", code: "OSA", aliases: ["大阪", "osaka", "osa", "关西"] },
  { city: "香港", code: "HKG", aliases: ["香港", "hong kong", "hongkong", "hkg"] },
  { city: "台北", code: "TPE", aliases: ["台北", "taipei", "tpe", "桃园"] },
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
    const aliasOffset = match[0].toLowerCase().indexOf(alias.toLowerCase());
    const index = match.index + Math.max(0, aliasOffset);
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
  ) || query.match(/(?:^|[^A-Za-z])([A-Za-z]{3})\s+([A-Za-z]{3})(?:$|[^A-Za-z])/i);
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

function containsOrderedSignalPair(
  value: string,
  fromSignals: string[],
  toSignals: string[],
): boolean {
  const lowered = value.toLowerCase();
  for (const from of fromSignals) {
    const fromIndex = lowered.indexOf(from.toLowerCase());
    if (fromIndex < 0) continue;
    for (const to of toSignals) {
      const toIndex = lowered.indexOf(to.toLowerCase(), fromIndex + from.length);
      if (toIndex >= 0 && toIndex - fromIndex <= 180) return true;
    }
  }
  return false;
}

export function filterFlightResults(
  results: SearchResult[],
  route: FlightRoute,
): { results: SearchResult[]; matchedCount: number } {
  const fromSignals = [route.fromCode, route.fromCity];
  const toSignals = [route.toCode, route.toCity];
  const filtered = results.filter((result) => {
    return [result.title, result.url, result.snippet].some((field) =>
      containsOrderedSignalPair(field, fromSignals, toSignals),
    );
  });

  const unorderedRouteMatches = results.filter((result) => {
    const haystack = `${result.title} ${result.url} ${result.snippet}`;
    const lowered = haystack.toLowerCase();
    return fromSignals.some((signal) => lowered.includes(signal.toLowerCase())) &&
      toSignals.some((signal) => lowered.includes(signal.toLowerCase()));
  });

  // A provider may omit city/IATA tokens from otherwise relevant snippets.
  // Keep the original response in that case rather than turning a valid
  // search into an empty answer; the caller still exposes the policy metadata
  // so the model knows that the evidence was not route-confirmed.
  return {
    results: filtered.length > 0 ? filtered : unorderedRouteMatches.length > 0 ? [] : results,
    matchedCount: filtered.length,
  };
}

export function getFlightRouteTable(): ReadonlyArray<Pick<CityAlias, "city" | "code">> {
  return CITY_ALIASES.map(({ city, code }) => ({ city, code }));
}
