#!/usr/bin/env node

/** Replace the fixed Beijing-Shanghai flight route with route-agnostic city/IATA routing and reliable-source fallback. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const asar = require("@electron/asar");
const { Pickle } = require("@electron/asar/lib/pickle");

const sourceArchive = path.resolve(process.argv[2] || "/Applications/NeoWorker.app/Contents/Resources/app.asar");
const outputArchive = path.resolve(process.argv[3] || ".novaready/package-output/app.asar.flight-route-general-v14");
const runtimes = ["electron", "daemon", "cli"];
const marker = "NW_FLIGHT_ROUTE_GENERAL_V13";
const providerMarker = "NW_FLIGHT_SEARCH_PROVIDER_V1";
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function packedEntries(node, prefix = "", out = []) {
  for (const [name, entry] of Object.entries(node.files || {})) {
    const archivePath = prefix ? `${prefix}/${name}` : name;
    if (entry.files) packedEntries(entry, archivePath, out);
    else if (!entry.unpacked && entry.offset !== undefined) out.push({ archivePath, entry, oldOffset: Number(entry.offset), oldSize: Number(entry.size) });
  }
  return out;
}

function updateIntegrity(entry, content) {
  if (!entry.integrity) return;
  entry.integrity.hash = sha256(content);
  if (!Array.isArray(entry.integrity.blocks)) return;
  const blockSize = Number(entry.integrity.blockSize || content.length || 1);
  entry.integrity.blocks = [];
  for (let offset = 0; offset < content.length; offset += blockSize) entry.integrity.blocks.push(sha256(content.subarray(offset, Math.min(content.length, offset + blockSize))));
  if (!entry.integrity.blocks.length) entry.integrity.blocks.push(sha256(content));
}

function writeArchive(patches) {
  const raw = asar.getRawHeader(sourceArchive);
  const entries = packedEntries(raw.header).sort((a, b) => a.oldOffset - b.oldOffset);
  const map = new Map(patches.map((item) => [item.archivePath, item.patched]));
  const found = new Set();
  let nextOffset = 0;
  for (const item of entries) {
    item.entry.offset = String(nextOffset);
    const patched = map.get(item.archivePath);
    if (patched) {
      found.add(item.archivePath);
      item.entry.size = patched.length;
      updateIntegrity(item.entry, patched);
    }
    nextOffset += Number(item.entry.size);
  }
  for (const archivePath of map.keys()) if (!found.has(archivePath)) throw new Error(`Missing packed entry: ${archivePath}`);
  const headerPickle = Pickle.createEmpty();
  headerPickle.writeString(JSON.stringify(raw.header));
  const header = headerPickle.toBuffer();
  const sizePickle = Pickle.createEmpty();
  sizePickle.writeUInt32(header.length);
  fs.mkdirSync(path.dirname(outputArchive), { recursive: true });
  const sourceFd = fs.openSync(sourceArchive, "r");
  const outputFd = fs.openSync(outputArchive, "w");
  const dataStart = raw.headerSize + 8;
  const buffer = Buffer.allocUnsafe(4 * 1024 * 1024);
  try {
    fs.writeSync(outputFd, sizePickle.toBuffer());
    fs.writeSync(outputFd, header);
    for (const item of entries) {
      const patched = map.get(item.archivePath);
      if (patched) {
        fs.writeSync(outputFd, patched);
        continue;
      }
      let remaining = item.oldSize;
      let offset = dataStart + item.oldOffset;
      while (remaining > 0) {
        const count = Math.min(remaining, buffer.length);
        fs.readSync(sourceFd, buffer, 0, count, offset);
        fs.writeSync(outputFd, buffer, 0, count);
        remaining -= count;
        offset += count;
      }
    }
    fs.fsyncSync(outputFd);
  } finally {
    fs.closeSync(sourceFd);
    fs.closeSync(outputFd);
  }
}

function patchExecutorHelpers(original, archivePath) {
  let source = original.toString("utf8");
  if (source.includes(marker)) return Buffer.from(source);
  const start = source.indexOf("    const buildVariants = (rawQuery) => {");
  const end = source.indexOf("    const familyForHost", start);
  if (start < 0 || end < 0) throw new Error(`${archivePath}: buildVariants block not found`);
  const replacement = String.raw`    const buildVariants = (rawQuery) => {
        const base = normalizeSpace(rawQuery);
        if (!base || /\bsite:/i.test(base))
            return [base];
        const variants = [];
        const add = (value) => {
            const normalized = normalizeSpace(value);
            if (normalized && !variants.some((item) => item.toLowerCase() === normalized.toLowerCase()))
                variants.push(normalized);
        };
        add(base);
        const chinese = /[\u3400-\u9fff]/u.test(base);
        const flight = /(?:航班|机票|航线|起飞|到达|票价|飞行时间|机场|航空|flight|airfare|airline|airport|departure|arrival)/i.test(base);
        const cityCodes = { 北京: "PEK", 上海: "SHA", 广州: "CAN", 深圳: "SZX", 沈阳: "SHE", 成都: "CTU", 重庆: "CKG", 西安: "XIY", 杭州: "HGH", 南京: "NKG", 武汉: "WUH", 厦门: "XMN", 昆明: "KMG", 长沙: "CSX", 青岛: "TAO", 大连: "DLC", 哈尔滨: "HRB", 郑州: "CGO", 海口: "HAK", 三亚: "SYX", 天津: "TSN", 济南: "TNA", 福州: "FOC", 宁波: "NGB", 乌鲁木齐: "URC", 贵阳: "KWE", 南昌: "KHN", 合肥: "HFE", 温州: "WNZ", 兰州: "LHW", 石家庄: "SJW", 太原: "TYN", 呼和浩特: "HET", 长春: "CGQ", 桂林: "KWL", 珠海: "ZUH", 汕头: "SWA", 惠州: "HUZ", 洛阳: "LYA", 烟台: "YNT", 威海: "WEH", 徐州: "XUZ", 常州: "CZX", 南宁: "NNG", 银川: "INC", 西宁: "XNN", 拉萨: "LXA", 鄂尔多斯: "DSN", 海拉尔: "HLD", 牡丹江: "MDG", 张家界: "DYG", 宜昌: "YIH", 绵阳: "MIG", 泉州: "JJN", 黄山: "TXN", 赣州: "KOW", 香港: "HKG", 澳门: "MFM", 台北: "TPE" };
        if (!chinese) {
            const airportCodes = (base.match(/\b[A-Z]{3}\b/g) || []).slice(0, 2);
            const englishCodes = { beijing: "PEK", shanghai: "SHA", guangzhou: "CAN", shenzhen: "SZX", shenyang: "SHE", chengdu: "CTU", chongqing: "CKG", xian: "XIY", hangzhou: "HGH", nanjing: "NKG", wuhan: "WUH", xiamen: "XMN", kunming: "KMG", changsha: "CSX", qingdao: "TAO", dalian: "DLC", harbin: "HRB", zhengzhou: "CGO", haikou: "HAK", sanya: "SYX", tianjin: "TSN", jinan: "TNA", fuzhou: "FOC", ningbo: "NGB", urumqi: "URC", guiyang: "KWE", nanchang: "KHN", hefei: "HFE", wenzhou: "WNZ", lanzhou: "LHW", shijiazhuang: "SJW", taiyuan: "TYN", hohhot: "HET", changchun: "CGQ", guilin: "KWL", zhuhai: "ZUH", shantou: "SWA", huizhou: "HUZ", luoyang: "LYA", yantai: "YNT", weihai: "WEH", xuzhou: "XUZ", changzhou: "CZX", nanning: "NNG", yinchuan: "INC", xining: "XNN", lhasa: "LXA", hongkong: "HKG", macau: "MFM", taipei: "TPE" };
            const englishRouteCodes = Object.entries(englishCodes).filter(([name]) => new RegExp("\\b" + name + "\\b", "i").test(base)).map(([, code]) => code).slice(0, 2);
            const routeCodes = airportCodes.length >= 2 ? airportCodes : englishRouteCodes;
            const routeLabel = routeCodes.length >= 2 ? routeCodes.join(" ") : "";
            add(base + (flight ? " " + routeLabel + " flight schedule" : " official source"));
            if (flight) {
                add(base + " site:trip.com");
                add(base + " site:zbordirect.com");
                add(base + " airline official schedule");
            }
            else if (/\b(code|software|library|framework|mcp|github|repository|api|model)\b/i.test(base)) add(base + " GitHub documentation");
            else if (/\b(latest|current|today|news|recent|update|release)\b/i.test(base)) add(base + " latest announcement");
            else add(base + " independent analysis");
            return variants.slice(0, 4);
        }
        const core = base
            .replace(/^(?:请|麻烦|劳驾)?(?:帮我|帮忙)?(?:查一下|查询一下|搜索一下|搜一下|看看|了解一下|分析一下|研究一下)/u, "")
            .replace(/[？?。！!]+$/u, "").trim() || base;
        if (flight) {
            const foundCities = Object.entries(cityCodes).filter(([city]) => core.includes(city)).sort((a, b) => core.indexOf(a[0]) - core.indexOf(b[0]));
            const foundCodes = (core.match(/\b[A-Z]{3}\b/g) || []).map((code) => [code, code]);
            const route = foundCities.length >= 2 ? foundCities.slice(0, 2) : foundCodes.slice(0, 2);
            const routeLabel = route.length >= 2 ? route.map((item) => item[0] + " " + item[1]).join(" ") : "";
            const iso = base.match(/\b(20\d{2})[-年](\d{1,2})[-月](\d{1,2})日?\b/);
            const monthDay = base.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/);
            const relative = /后天|day after tomorrow/i.test(base) ? 2 : /明天|tomorrow/i.test(base) ? 1 : /今天|today/i.test(base) ? 0 : null;
            const now = new Date();
            const date = iso ? iso[1] + "-" + String(iso[2]).padStart(2, "0") + "-" + String(iso[3]).padStart(2, "0") : monthDay ? now.getFullYear() + "-" + String(monthDay[1]).padStart(2, "0") + "-" + String(monthDay[2]).padStart(2, "0") : relative === null ? "" : new Date(now.getTime() + relative * 86400000).toISOString().slice(0, 10);
            add(core + " " + routeLabel + " " + date + " site:trip.com");
            add(core + " " + routeLabel + " " + date + " site:zbordirect.com");
            add(core + " " + routeLabel + " " + date + " 航班时刻表");
            add(core + " " + routeLabel + " " + date + " airline official schedule");
            return variants.slice(0, 4);
        }
        const current = /最新|近期|最近|现在|目前|今天|今日|新闻|动态|进展|发布|更新/u.test(base);
        const finance = /股票|股价|上市公司|财报|业绩|融资|估值|营收|利润|证券|基金/u.test(base);
        const technical = /代码|软件|开源|项目|仓库|GitHub|API|MCP|框架|模型|技术/u.test(base);
        const policy = /政策|法规|条例|办法|通知|政府|标准/u.test(base);
        add(core + " 官方原文");
        if (finance) { add(core + " 公告 财报"); add(core + " site:cninfo.com.cn"); }
        else if (technical) { add(core + " GitHub 官方文档"); add(core + (current ? " release changelog" : " 技术文档")); }
        else if (policy) { add(core + " site:gov.cn"); add(core + " 权威解读"); }
        else { add(core + (current ? " 最新进展" : " 权威资料")); add(core + (/对比|比较|竞品|区别|优缺点/u.test(base) ? " 独立对比 评测" : " 独立分析")); }
        return variants.slice(0, 4);
    };
`;
  source = source.slice(0, start) + replacement + source.slice(end);
  return Buffer.from(source + `\n/* ${marker}: generic city-pair and IATA-aware flight query expansion. */\n`, "utf8");
}

function patchSearchTools(original, archivePath) {
  let source = original.toString("utf8");
  // Re-enter the replacement when an older route patch is present but lacks
  // the direction/OTA-alias safeguards added below.  This keeps regeneration
  // idempotent while allowing V13/V14 artifacts to receive the follow-up fix.
  if (source.includes(marker) && source.includes("const ordered") && source.includes("tripCityCodes")) return Buffer.from(source);
  const start = source.indexOf("buildFlightEvidencePolicy(input) {");
  const end = source.indexOf("\n\n    async webSearch(input) {", start);
  if (start < 0 || end < 0) throw new Error(`${archivePath}: flight policy block not found`);
  const replacement = String.raw`buildFlightEvidencePolicy(input) {
        const query = String(input?.query || "").trim();
        if (!this.isFlightQueryText(query)) return null;
        const dateAnchor = this.extractFlightDateAnchor(query);
        const route = this.extractFlightRouteCodes(query);
        return { category: "flight_search", dateAnchor, dateAnchorRequired: true, airportScope: route?.routeLabel || "按查询原文锁定出发与到达机场", searchSnippetsAreLeads: true, indexedDateEvidenceAllowed: true, exactFlightDetailsVerified: false, livePricesVerified: false, warning: "搜索摘要默认只能发现来源；但当索引摘要同时明确包含目标日期、出发/到达航点、航班号和起降时间时，可以标为索引班期参考（不可视为实时余票或价格）。" };
    }
    extractFlightRouteCodes(value) {
        const text = String(value || "");
        const cityCodes = { 北京: ["PEK", "beijing"], 上海: ["SHA", "shanghai"], 广州: ["CAN", "guangzhou"], 深圳: ["SZX", "shenzhen"], 沈阳: ["SHE", "shenyang"], 成都: ["CTU", "chengdu"], 重庆: ["CKG", "chongqing"], 西安: ["XIY", "xian"], 杭州: ["HGH", "hangzhou"], 南京: ["NKG", "nanjing"], 武汉: ["WUH", "wuhan"], 厦门: ["XMN", "xiamen"], 昆明: ["KMG", "kunming"], 长沙: ["CSX", "changsha"], 青岛: ["TAO", "qingdao"], 大连: ["DLC", "dalian"], 哈尔滨: ["HRB", "harbin"], 郑州: ["CGO", "zhengzhou"], 海口: ["HAK", "haikou"], 三亚: ["SYX", "sanya"], 天津: ["TSN", "tianjin"], 济南: ["TNA", "jinan"], 福州: ["FOC", "fuzhou"], 宁波: ["NGB", "ningbo"], 乌鲁木齐: ["URC", "urumqi"], 贵阳: ["KWE", "guiyang"], 南昌: ["KHN", "nanchang"], 合肥: ["HFE", "hefei"], 温州: ["WNZ", "wenzhou"], 兰州: ["LHW", "lanzhou"], 石家庄: ["SJW", "shijiazhuang"], 太原: ["TYN", "taiyuan"], 呼和浩特: ["HET", "hohhot"], 长春: ["CGQ", "changchun"], 桂林: ["KWL", "guilin"], 珠海: ["ZUH", "zhuhai"], 汕头: ["SWA", "shantou"], 惠州: ["HUZ", "huizhou"], 洛阳: ["LYA", "luoyang"], 烟台: ["YNT", "yantai"], 威海: ["WEH", "weihai"], 徐州: ["XUZ", "xuzhou"], 常州: ["CZX", "changzhou"], 南宁: ["NNG", "nanning"], 银川: ["INC", "yinchuan"], 西宁: ["XNN", "xining"], 拉萨: ["LXA", "lhasa"], 鄂尔多斯: ["DSN", "ordos"], 海拉尔: ["HLD", "hailaer"], 牡丹江: ["MDG", "mudanjiang"], 张家界: ["DYG", "zhangjiajie"], 宜昌: ["YIH", "yichang"], 绵阳: ["MIG", "mianyang"], 泉州: ["JJN", "quanzhou"], 黄山: ["TXN", "huangshan"], 赣州: ["KOW", "ganzhou"], 香港: ["HKG", "hongkong"], 澳门: ["MFM", "macau"], 台北: ["TPE", "taipei"] };
        const found = Object.entries(cityCodes).filter(([city, meta]) => text.includes(city) || new RegExp("\\b" + meta[1] + "\\b", "i").test(text)).sort((a, b) => text.indexOf(a[0]) - text.indexOf(b[0]));
        const matched = found.length >= 2 ? found.slice(0, 2) : null;
        const codes = matched ? matched.map((entry) => entry[1][0]) : (text.match(/\b[A-Z]{3}\b/g) || []).slice(0, 2);
        if (codes.length < 2) return null;
        const names = matched ? matched.map((entry) => entry[0]) : codes;
        const slugs = matched ? matched.map((entry) => entry[1][1]) : codes.map((code) => code.toLowerCase());
        // OTA city pages sometimes use a city code that differs from the airport
        // IATA code (Xi'an is SIA on Trip.com/Ctrip but XIY at the airport).
        const tripCityCodes = { 西安: "SIA", xian: "SIA" };
        const tripCodes = names.map((name, index) => tripCityCodes[name] || codes[index]);
        return { fromCity: names[0], fromCode: codes[0], fromTripCode: tripCodes[0], fromSlug: slugs[0], toCity: names[1], toCode: codes[1], toTripCode: tripCodes[1], toSlug: slugs[1], routeLabel: names[0] + " (" + codes[0] + ") → " + names[1] + " (" + codes[1] + ")" };
    }
    annotateFlightSearchResponse(response, input) {
        const policy = this.buildFlightEvidencePolicy(input);
        if (!policy) return response;
        const rows = Array.isArray(response?.results) ? response.results : [];
        const route = this.extractFlightRouteCodes(String(input?.query || ""));
        const routePattern = route ? null : /(?:flightconnections|airpaz|traveloka|flightsfrom|zbordirect|ctrip|trip\\.com|qunar|airchina|hnair|ceair|航班|机票|航线|航空|机场)/i;
        const relevant = rows.filter((row) => {
            const rowText = String((row?.title || "") + " " + (row?.snippet || "") + " " + (row?.url || ""));
            if (!route) return routePattern.test(rowText);
            // Match the requested direction, not merely the unordered airport pair.
            // Reverse-direction pages are common in search results (for example
            // XIY→HGH when the user asked for HGH→XIY) and must not be presented
            // as evidence for the requested route.
            const ordered = (from, to) => {
                const forward = new RegExp("\\b" + from + "\\b[\\s\\S]{0,140}\\b" + to + "\\b", "i");
                const fromIndex = rowText.search(new RegExp("\\b" + from + "\\b", "i"));
                const toIndex = rowText.search(new RegExp("\\b" + to + "\\b", "i"));
                return forward.test(rowText) && (toIndex < 0 || fromIndex <= toIndex);
            };
            const codePair = ordered(route.fromCode, route.toCode);
            const cityPair = ordered(route.fromCity, route.toCity);
            return codePair || cityPair;
        });
        const officialCandidate = route && route.fromCode === "CAN" && route.toCode === "SHE" ? { title: "南航广州 → 沈阳定期班期表（官方参考）", url: "https://csair.com/h5/cn/tourism_strategy/guonei_lvyougonglve/Shenyang2/1c39mjsm7h074.shtml", snippet: "南航官方广州—沈阳班期表；可按目标日期的周几筛选班期，页面提示以官网或 APP 实时结果为准。", source: "csair.com" } : null;
        const titleCaseSlug = (slug) => String(slug || "").replace(/(^|-)([a-z])/g, (_, separator, letter) => separator + letter.toUpperCase());
        const travelokaPath = route ? titleCaseSlug(route.fromSlug) + "-" + titleCaseSlug(route.toSlug) + "." + route.fromCode + "." + route.toCode + "A" : "";
        const candidates = route ? [
            { title: "FlightConnections " + route.fromCode + " → " + route.toCode + " 航线时刻概览（待按日期确认）", url: "https://www.flightconnections.com/flights-from-" + route.fromCode.toLowerCase() + "-to-" + route.toCode.toLowerCase(), snippet: route.routeLabel + " 航线概览；页面需进一步读取目标日期。", source: "flightconnections.com" },
            { title: "Ctrip " + route.fromCity + " → " + route.toCity + " 航班时刻表", url: "https://flights.ctrip.com/international/schedule/" + (route.fromTripCode || route.fromCode) + "-" + (route.toTripCode || route.toCode) + ".html", snippet: "航线时刻表候选来源；具体日期仍需在页面中确认。", source: "flights.ctrip.com" },
            { title: "Airpaz " + route.fromCity + " → " + route.toCity + " 航班查询", url: "https://www.airpaz.com/zh/flight-tickets/city-city/" + route.fromSlug + "-cn-" + route.toSlug + "-cn", snippet: "可继续读取该城市对的日期航班结果。", source: "airpaz.com" },
            { title: "Trip.com " + route.fromCity + " → " + route.toCity + " 日期航班", url: "https://www.trip.com/flights/airport-" + (route.fromTripCode || route.fromCode).toLowerCase() + "-city-" + (route.toTripCode || route.toCode).toLowerCase() + "/", snippet: "城市对页面通常包含目标日期、航司和起降时刻；若未显示航班号则仅作日期航司时刻参考。", source: "trip.com" },
            { title: "ZborDirect " + route.fromCode + " → " + route.toCode + " 日期班期表", url: "https://zbordirect.com/en/tools/schedule?departure_city=" + route.fromCode + "&arrival_city=" + route.toCode, snippet: "按起飞和到达机场展示带日期的航班号、时刻与班期，用于补充动态 OTA 来源。", source: "zbordirect.com" },
            { title: "Traveloka " + route.fromCity + " → " + route.toCity + " 日期航班时刻", url: "https://www.traveloka.com/zh-my/flight/route/" + travelokaPath, snippet: "按城市对展示日期标签和预定航班时刻；用于补充被拦截的 OTA 来源。", source: "traveloka.com" },
            { title: "FlightsFrom " + route.fromCode + " → " + route.toCode + " 周班期表", url: "https://www.flightsfrom.com/" + route.fromCode + "-" + route.toCode, snippet: "路线周历与航班号时刻；需按目标日期星期核对。", source: "flightsfrom.com" },
            ...(officialCandidate ? [officialCandidate] : []),
        ] : [];
        const originalRelevantCount = relevant.length;
        const existingUrls = new Set(relevant.map((row) => String(row?.url || "").replace(/\/$/, "")));
        for (const candidate of candidates) if (!existingUrls.has(candidate.url)) relevant.push(candidate);
        return { ...response, results: relevant.map((row) => ({ ...row, evidenceType: "search_snippet", dateAnchored: false, exactDetailsVerified: false })), metadata: { ...(response?.metadata || {}), flightEvidencePolicy: policy, filteredIrrelevantResultCount: Math.max(0, rows.length - originalRelevantCount), injectedFlightCandidates: candidates.length } };
    }
`;
  source = source.slice(0, start) + replacement + source.slice(end);
  return Buffer.from(source + `\n/* ${marker}: generic city-pair route candidates and irrelevant-result filtering. */\n`, "utf8");
}

/**
 * The Chinese-first Bing shortcut is useful for ordinary Chinese research, but
 * it is a poor default for flight lookups: Bing frequently returns unrelated
 * results for IATA/date queries while DuckDuckGo's HTML index has the actual
 * route pages.  Keep Bing as a fallback, but let flight queries try DDG first.
 */
function patchFlightSearchProvider(original, archivePath) {
  let source = original.toString("utf8");
  if (source.includes(providerMarker)) return Buffer.from(source);
  const anchor = `const chinaFirst = query.preferChinaRoute === true ||\n(query.preferChinaRoute !== false && (query.region === "cn" || query.region === "cn-zh" || /[\\u3400-\\u9fff]/u.test(query.query)));`;
  if (!source.includes(anchor)) throw new Error(`${archivePath}: Chinese-first search block not found`);
  const replacement = `${anchor}\nconst flightQuery = /(?:航班|机票|航线|起飞|到达|票价|飞行时间|机场|航空|flight|airfare|airline|airport|departure|arrival)/i.test(String(query.query || ""));`;
  source = source.replace(anchor, replacement);
  const guard = `if (chinaFirst) {`;
  if (!source.includes(guard)) throw new Error(`${archivePath}: provider guard not found`);
  source = source.replace(guard, `if (chinaFirst && !flightQuery) {`);
  source = source.replace(`if (Date.now() < primaryUnavailableUntil)\nreturn this.searchBing(query, maxResults, requestedSearchType);`, `if (Date.now() < primaryUnavailableUntil && !flightQuery)\nreturn this.searchBing(query, maxResults, requestedSearchType);`);
  return Buffer.from(`${source}\n/* ${providerMarker}: flight searches try DuckDuckGo before the Chinese Bing shortcut. */\n`, "utf8");
}

function patchExecutorGuidance(original, archivePath) {
  let source = original.toString("utf8");
  if (source.includes(marker)) return Buffer.from(source);
  const replacements = [
    ["concrete year/date plus PEK/SHA", "concrete year/date plus the detected city pair and IATA codes"],
    ["injected PEK/SHA/date candidates", "injected city-pair/IATA/date candidates"],
    ["Use web_search once for discovery; use its injected city-pair/IATA/date candidates instead of repeating generic Chinese searches.", "Use web_search for discovery and use its injected city-pair/IATA/date candidates. If every direct candidate is blocked or empty, make one additional targeted web_search using the detected IATA pair and date (maximum two searches total); do not stop solely because a host returned 403."],
    ["Fetch or browse Airpaz/Ctrip/airline candidates directly after discovery. Use FlightConnections only for route scope unless its rendered page explicitly exposes the requested date.", "Fetch or browse the injected Airpaz/Ctrip/Trip.com/ZborDirect/airline candidates directly after discovery. Use FlightConnections only for route scope unless its rendered page explicitly exposes the requested date. If direct pages fail, use the targeted indexed-search fallback described below. A date-confirmed Trip.com row with an airline and both clock times is acceptable as 日期航司时刻参考 when no flight number is exposed; never invent a flight number."],
    ["if (!entry?.url || ![\"web_fetch\", \"http_request\", \"browser_get_content\", \"browser_get_text\", \"browser_snapshot\"].includes(entry.tool)) return false;", "if (!entry?.url || ![\"web_search\", \"web_fetch\", \"http_request\", \"browser_get_content\", \"browser_get_text\", \"browser_snapshot\"].includes(entry.tool)) return false;"],
    ["Only a fetched/rendered page containing the requested date, route, flight number, and time may unlock exact rows; otherwise report that the date could not be verified.", "A fetched/rendered page containing the requested date, route, flight number, and time may unlock exact rows. If a rendered Trip.com row contains the requested date, route, airline name, and both departure and arrival times but no flight number, show it only as 日期航司时刻参考 and explicitly say the flight number is not exposed. If direct pages are blocked or empty, make one targeted web_search for an indexed schedule source using the detected IATA pair and date. An indexed result may be shown only as 索引班期参考 when its snippet itself contains the requested date, route, flight number, and time; label it non-real-time and never infer prices or availability. A published weekly schedule whose weekday matches the requested date may also be shown as 班期参考; otherwise report that the date could not be verified."],
    ["Exact rows are allowed only when one fetched/rendered page contains the requested date, route, flight number, and time. Otherwise return a concise no-verifiable-results statement with the source limitation.", "Exact rows are allowed when one fetched/rendered page contains the requested date, route, flight number, and time. If direct pages are unavailable, one targeted web_search may supply indexed date evidence; use rows only when the indexed snippet itself contains the requested date, route, flight number, and time, label them 索引班期参考, and do not claim live prices or availability. A published weekly schedule whose weekday matches the requested date may be shown as 班期参考 with a non-real-time caveat. Otherwise return a concise no-verifiable-results statement with the source limitation."],
  ];
  let changed = 0;
  for (const [from, to] of replacements) if (source.includes(from)) { source = source.split(from).join(to); changed++; }
  const v10FlightFallback = " A rendered Trip.com row with the requested date, route, named airline, and two clock values but no flight number may be shown only as 日期航司时刻参考; state that the number is not exposed and do not invent it.";
  if (source.includes("Fetch or browse the injected Airpaz/Ctrip/ZborDirect/airline candidates directly after discovery.")) {
    source = source.split("Fetch or browse the injected Airpaz/Ctrip/ZborDirect/airline candidates directly after discovery.").join("Fetch or browse the injected Airpaz/Ctrip/Trip.com/ZborDirect/airline candidates directly after discovery." + v10FlightFallback);
    changed++;
  }
  const priorityRule = " When a Trip.com candidate is present, fetch that date-capable Trip.com page first (before route-only sites such as FlightConnections, FlightsFrom, airportoverview, or directflights); only move to another source if Trip.com is blocked or empty. Do not spend the first fetches on monthly or route-wide summaries.";
  source = source.split("Fetch or browse one candidate directly; do not retry BCIA/FlightConnections URL variants after a 4xx, empty body, or route-only page.").join("Fetch or browse the Trip.com date candidate first when it is present; do not retry BCIA/FlightConnections URL variants after a 4xx, empty body, or route-only page." + priorityRule);
  source = source.split("Fetch or browse the injected Airpaz/Ctrip/Trip.com/ZborDirect/airline candidates directly after discovery.").join("Fetch or browse the injected Airpaz/Ctrip/Trip.com/ZborDirect/airline candidates directly after discovery." + priorityRule);
  source = source.split("A published weekly schedule whose weekday matches the requested date may also be shown as 班期参考;").join(v10FlightFallback + " A published weekly schedule whose weekday matches the requested date may also be shown as 班期参考;");
  const defaultScope = "默认北京首都/大兴→上海虹桥/浦东";
  if (source.includes(defaultScope)) {
    source = source.split(defaultScope).join("按请求中的出发地与目的地锁定机场范围");
    changed++;
  }
  const routeStart = source.indexOf("const hasRouteScope =");
  const returnAfterRoute = source.indexOf("\nreturn hasFlightRow", routeStart);
  const routeEnd = returnAfterRoute >= 0 ? source.lastIndexOf("})();", returnAfterRoute) : -1;
  if (routeStart >= 0 && routeEnd > routeStart) {
    const routeCheck = String.raw`const hasRouteScope = (() => {
const promptText = String((this.task?.title || "") + "\n" + (this.getContractPrompt?.() || this.task?.prompt || ""));
const cityCodes = { 北京: "PEK", 上海: "SHA", 广州: "CAN", 深圳: "SZX", 沈阳: "SHE", 成都: "CTU", 重庆: "CKG", 西安: "XIY", 杭州: "HGH", 南京: "NKG", 武汉: "WUH", 厦门: "XMN", 昆明: "KMG", 长沙: "CSX", 青岛: "TAO", 大连: "DLC", 哈尔滨: "HRB", 郑州: "CGO", 海口: "HAK", 三亚: "SYX", 天津: "TSN", 济南: "TNA", 福州: "FOC", 宁波: "NGB", 乌鲁木齐: "URC", 贵阳: "KWE", 南昌: "KHN", 合肥: "HFE", 温州: "WNZ", 兰州: "LHW", 石家庄: "SJW", 太原: "TYN", 呼和浩特: "HET", 长春: "CGQ", 桂林: "KWL", 珠海: "ZUH", 汕头: "SWA", 惠州: "HUZ", 洛阳: "LYA", 烟台: "YNT", 威海: "WEH", 徐州: "XUZ", 常州: "CZX", 南宁: "NNG", 银川: "INC", 西宁: "XNN", 拉萨: "LXA", 鄂尔多斯: "DSN", 海拉尔: "HLD", 牡丹江: "MDG", 张家界: "DYG", 宜昌: "YIH", 绵阳: "MIG", 泉州: "JJN", 黄山: "TXN", 赣州: "KOW", 香港: "HKG", 澳门: "MFM", 台北: "TPE" };
const routeNames = Object.keys(cityCodes).filter((city) => promptText.includes(city)).slice(0, 2);
const routeCodes = routeNames.map((city) => cityCodes[city]);
if (routeNames.length >= 2) return routeNames.every((token) => text.includes(token)) || routeCodes.every((token) => new RegExp("\\b" + token + "\\b", "i").test(text));
const explicitCodes = (promptText.match(/\b[A-Z]{3}\b/g) || []).slice(0, 2);
return explicitCodes.length < 2 || explicitCodes.every((token) => new RegExp("\\b" + token + "\\b", "i").test(text));
})();`;
    source = source.slice(0, routeStart) + routeCheck + source.slice(routeEnd + "})();".length);
    changed++;
  }
  let dateStart = source.indexOf("const dateConfirmed = dateAnchors.some");
  if (dateStart < 0) {
    const existingEnglishAnchors = source.indexOf("const englishDateAnchors =");
    if (existingEnglishAnchors >= 0) dateStart = source.lastIndexOf("const targetDate = this.getRequestedFlightDate();", existingEnglishAnchors);
  }
  const rowStart = source.indexOf("const hasFlightRow", dateStart);
  if (!source.includes("const dateAirlineRow") && dateStart >= 0 && rowStart > dateStart) {
const dateCheck = String.raw`const targetDate = this.getRequestedFlightDate();
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const targetMonthName = targetDate ? monthNames[Number(targetDate.slice(5, 7)) - 1] : null;
const targetDay = targetDate ? Number(targetDate.slice(8, 10)) : null;
const targetMonth = targetDate ? Number(targetDate.slice(5, 7)) : null;
const targetYear = targetDate ? targetDate.slice(0, 4) : null;
const englishDateAnchors = targetDate && targetMonthName ? [targetMonthName + " " + targetDay, targetMonthName.slice(0, 3) + " " + targetDay, targetDay + " " + targetMonthName, targetDay + " " + targetMonthName.slice(0, 3), targetMonthName + " " + targetDay + ", " + targetYear, String(targetDay).padStart(2, "0") + "." + String(targetMonth).padStart(2, "0") + "." + targetYear.slice(2), String(targetDay).padStart(2, "0") + "/" + String(targetMonth).padStart(2, "0") + "/" + targetYear.slice(2)] : [];
const comparableText = text.toLowerCase();
const dateConfirmed = dateAnchors.concat(englishDateAnchors).some((anchor) => anchor && comparableText.includes(String(anchor).toLowerCase()));
const weekday = targetDate ? new Date(targetDate + "T00:00:00").getDay() : null;
const weekdayShort = weekday === null ? null : ["日", "一", "二", "三", "四", "五", "六"][weekday];
const scheduleLines = text.split("\n").filter((line) => /(?:班期|每天|每日|周[一二三四五六日天]|星期[一二三四五六日天]|daily|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(line)).join("\n");
const weekdayEnglish = weekday === null ? null : ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][weekday];
const weekdayConfirmed = Boolean(scheduleLines) && (/(?:每天|每日|daily)/i.test(scheduleLines) || (weekdayShort && (new RegExp("(?:周|星期)" + weekdayShort).test(scheduleLines) || new RegExp("(?:^|[、,，\\s])" + weekdayShort + "(?=$|[、,，\\s])").test(scheduleLines))) || (weekdayEnglish && new RegExp("\\b" + weekdayEnglish + "\\b", "i").test(scheduleLines)));
if (!dateConfirmed && !weekdayConfirmed) return false;
`;
    source = source.slice(0, dateStart) + dateCheck + source.slice(rowStart);
    const strictFlightRow = "const hasFlightRow = /\\b[A-Z]{2}\\s?\\d{3,4}\\b/i.test(text) && /\\b\\d{1,2}:\\d{2}\\b/.test(text);";
    const permissiveFlightRow = "const flightNumberRow = /\\b[A-Z]{2}\\s?\\d{3,4}\\b/i.test(text) && /\\b\\d{1,2}:\\d{2}\\b/.test(text); const clockValues = text.match(/\\b\\d{1,2}:\\d{2}\\b/g) || []; const dateAirlineRow = clockValues.length >= 2 && /(?:airlines?|航空|航空公司|air china|sichuan|shenzhen airlines|chengdu airlines|china southern|china eastern|normal airline|成都航空)/i.test(text); const hasFlightRow = flightNumberRow || dateAirlineRow;";
    if (source.includes(strictFlightRow)) { source = source.replace(strictFlightRow, permissiveFlightRow); changed++; }
    changed++;
  }
  if (!changed) throw new Error(`${archivePath}: fixed-route flight guards not found`);
  return Buffer.from(source + `\n/* ${marker}: executor guidance and dated flight evidence follow the detected route. */\n`, "utf8");
}

/**
 * Keep the post-tool answer budget when this route patch is regenerated.
 *
 * The route patch is sometimes run again by a separate repair/update flow.  If
 * it writes an archive from an older base, a standalone output-length patch
 * can otherwise be silently lost.  Applying this small, idempotent layer to
 * the executor entries here makes the route artifact safe to install or copy.
 */
function patchOutputLength(original, archivePath) {
  let source = original.toString("utf8");
  const outputMarker = "NW_OUTPUT_LENGTH_V1";
  if (source.includes(outputMarker)) return Buffer.from(source);
  const replacements = [
    [
      "initialMaxTokens: finalizationAttempt === 0 ? 1200 : 1600",
      "initialMaxTokens: finalizationAttempt === 0 ? 4000 : 4000",
      "finalization initial budget",
    ],
    [
      "continuationMaxTokens: finalizationAttempt === 0 ? 600 : 800",
      "continuationMaxTokens: finalizationAttempt === 0 ? 4000 : 4000",
      "finalization continuation budget",
    ],
    [
      "t.length>4000?`${t.slice(0,4000)}...`:t",
      "t.length>20000?`${t.slice(0,20000)}...`:t",
      "follow-up result-summary cap",
    ],
    [
      'return languageSafe.length > 4000\n? `${languageSafe.slice(0, 4000)}...`\n: languageSafe;',
      'return languageSafe.length > 20000\n? `${languageSafe.slice(0, 20000)}...`\n: languageSafe;',
      "regular result-summary cap",
    ],
  ];
  for (const [from, to, label] of replacements) {
    const first = source.indexOf(from);
    const last = source.lastIndexOf(from);
    if (first < 0 || first !== last) {
      throw new Error(`${archivePath}: ${label}: expected exactly one match, found ${first < 0 ? 0 : "multiple"}`);
    }
    source = source.slice(0, first) + to + source.slice(first + from.length);
  }
  return Buffer.from(
    `${source}\n/* ${outputMarker}: post-tool finalization has 4k + 4k output budget; final summaries retain up to 20k chars. */\n`,
    "utf8",
  );
}

function patchExecutorWithOutputLength(original, archivePath) {
  return patchOutputLength(patchExecutorGuidance(original, archivePath), archivePath);
}

if (!fs.existsSync(sourceArchive)) throw new Error(`Source ASAR not found: ${sourceArchive}`);
if (sourceArchive === outputArchive) throw new Error("Refusing to patch source archive in place");
const patches = [];
for (const runtime of runtimes) {
  const prefix = `dist/${runtime}/electron/agent`;
  for (const [archivePath, patcher] of [
    [`${prefix}/executor-helpers.js`, patchExecutorHelpers],
    [`${prefix}/tools/search-tools.js`, patchSearchTools],
    [`${prefix}/executor.js`, patchExecutorWithOutputLength],
    [`${prefix}/search/duckduckgo-provider.js`, patchFlightSearchProvider],
  ]) patches.push({ archivePath, patched: patcher(asar.extractFile(sourceArchive, archivePath), archivePath) });
}
writeArchive(patches);
asar.uncache(outputArchive);
for (const patch of patches) if (!asar.extractFile(outputArchive, patch.archivePath).equals(patch.patched)) throw new Error(`Post-write verification failed: ${patch.archivePath}`);
console.log(JSON.stringify({ sourceArchive, outputArchive, patchedEntries: patches.length, marker }, null, 2));
