/** Public, anonymous sources maintained by NeoWorker. No user-provided endpoints. */
export const NEWS_PUBLISHERS = {
  qbitai: {
    name: "量子位",
    nameEn: "QbitAI",
    category: "technology",
    endpoint: "https://www.qbitai.com/feed",
    format: "rss",
    hosts: ["www.qbitai.com", "qbitai.com"],
  },
  semianalysis: {
    name: "SemiAnalysis",
    nameEn: "SemiAnalysis",
    category: "technology",
    endpoint: "https://newsletter.semianalysis.com/feed",
    format: "rss",
    hosts: ["newsletter.semianalysis.com", "semianalysis.com"],
  },
  trendforce: {
    name: "集邦咨询",
    nameEn: "TrendForce",
    category: "technology",
    endpoint: "https://www.trendforce.cn/",
    format: "html",
    hosts: ["www.trendforce.cn"],
  },
  eetimes: {
    name: "电子工程专辑",
    nameEn: "EE Times China",
    category: "technology",
    endpoint: "https://www.eet-china.com/",
    format: "html",
    hosts: ["www.eet-china.com"],
  },
  chinatalk: {
    name: "ChinaTalk",
    nameEn: "ChinaTalk",
    category: "technology",
    endpoint: "https://www.chinatalk.media/feed",
    format: "rss",
    hosts: ["www.chinatalk.media", "chinatalk.media"],
  },
  yicai: {
    name: "第一财经",
    nameEn: "Yicai",
    category: "finance",
    endpoint: "https://www.yicai.com/",
    format: "html",
    hosts: ["www.yicai.com"],
  },
  cls: {
    name: "财联社",
    nameEn: "CLS",
    category: "finance",
    endpoint: "https://www.cls.cn/",
    format: "html",
    hosts: ["www.cls.cn"],
  },
  wallstreetcn: {
    name: "华尔街见闻",
    nameEn: "Wallstreetcn",
    category: "finance",
    endpoint: "https://wallstreetcn.com/",
    format: "html",
    hosts: ["wallstreetcn.com"],
  },
  pboc: {
    name: "中国人民银行",
    nameEn: "People’s Bank of China",
    category: "policy",
    endpoint: "https://www.pbc.gov.cn/",
    format: "html",
    hosts: ["www.pbc.gov.cn"],
  },
  nbs: {
    name: "国家统计局",
    nameEn: "National Bureau of Statistics",
    category: "policy",
    endpoint: "https://www.stats.gov.cn/",
    format: "html",
    hosts: ["www.stats.gov.cn"],
  },
  ndrc: {
    name: "国家发展改革委",
    nameEn: "NDRC",
    category: "policy",
    endpoint: "https://www.ndrc.gov.cn/",
    format: "html",
    hosts: ["www.ndrc.gov.cn"],
  },
  miit: {
    name: "工信部",
    nameEn: "MIIT",
    category: "policy",
    endpoint: "https://www.miit.gov.cn/",
    format: "html",
    hosts: ["www.miit.gov.cn"],
  },
  csrc: {
    name: "证监会",
    nameEn: "CSRC",
    category: "policy",
    endpoint: "https://www.csrc.gov.cn/",
    format: "html",
    hosts: ["www.csrc.gov.cn"],
  },
  fed: {
    name: "美联储",
    nameEn: "Federal Reserve",
    category: "policy",
    endpoint: "https://www.federalreserve.gov/feeds/press_monetary.xml",
    format: "rss",
    hosts: ["www.federalreserve.gov"],
  },
  huxiu: {
    name: "虎嗅",
    nameEn: "Huxiu",
    category: "business",
    endpoint: "https://www.huxiu.com/",
    format: "html",
    hosts: ["www.huxiu.com"],
  },
  stratechery: {
    name: "Stratechery",
    nameEn: "Stratechery",
    category: "business",
    endpoint: "https://stratechery.com/feed/",
    format: "rss",
    hosts: ["stratechery.com"],
  },
  benevans: {
    name: "Benedict Evans",
    nameEn: "Benedict Evans",
    category: "business",
    endpoint: "https://www.ben-evans.com/benedictevans?format=rss",
    format: "rss",
    hosts: ["www.ben-evans.com", "ben-evans.com"],
  },
  bcg: {
    name: "波士顿咨询",
    nameEn: "BCG",
    category: "business",
    endpoint: "https://www.bcg.com/publications",
    format: "html",
    hosts: ["www.bcg.com"],
  },
} as const;
export type NewsPublisher = keyof typeof NEWS_PUBLISHERS;
export const NEWS_PUBLISHER_IDS = Object.keys(NEWS_PUBLISHERS) as NewsPublisher[];
export function isNewsPublisher(source: string): source is NewsPublisher {
  return Object.prototype.hasOwnProperty.call(NEWS_PUBLISHERS, source);
}
/** Keep article navigation and cache hydration on the source's public origin. */
export function publisherArticleUrl(source: NewsPublisher, value: string): string | undefined {
  try {
    const spec = NEWS_PUBLISHERS[source];
    const url = new URL(value, spec.endpoint);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port ||
      !(spec.hosts as readonly string[]).includes(url.hostname)
    )
      return;
    url.protocol = "https:";
    url.hash = "";
    // Snapshot keys because deleting while iterating skips adjacent tracking parameters.
    const keys = Array.from(url.searchParams.keys());
    for (const key of keys)
      if (/^utm_|^fbclid$|^gclid$/.test(key)) url.searchParams.delete(key);
    return url.href;
  } catch {
    return;
  }
}
