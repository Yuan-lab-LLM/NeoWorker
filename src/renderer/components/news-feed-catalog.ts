import { isNewsPublisher, NEWS_PUBLISHERS } from "../../shared/news-sources";
import type { PaperNewsSource } from "../../shared/paper-news";

export type NewsCategoryId =
  | "research"
  | "development"
  | "technology"
  | "finance"
  | "policy"
  | "business";
export interface NewsFeedProvider {
  id: string;
  name: string;
  nameEn?: string;
  /** Only a shipping adapter makes a source available. An access audit does not. */
  adapter?: PaperNewsSource;
}
export interface NewsFeedCategory {
  id: NewsCategoryId;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  providers: NewsFeedProvider[];
}

export const NEWS_FEED_CATEGORIES: NewsFeedCategory[] = [
  {
    id: "research",
    name: "学术与研究",
    nameEn: "Research",
    description: "论文、研究成果与学术前沿",
    descriptionEn: "Papers, discoveries and research frontiers",
    providers: [
      { id: "arxiv", name: "arXiv", adapter: "arxiv" },
      { id: "hf-papers", name: "Hugging Face Papers", adapter: "huggingface" },
      { id: "openalex", name: "OpenAlex" },
    ],
  },
  {
    id: "development",
    name: "开源与开发",
    nameEn: "Open source",
    description: "开源项目、模型与工程实践",
    descriptionEn: "Repositories, models and engineering practice",
    providers: [
      { id: "github", name: "GitHub", adapter: "github" },
      { id: "hf-models", name: "Hugging Face Models" },
      { id: "hackernews", name: "Hacker News" },
      { id: "cnblogs", name: "博客园", nameEn: "Cnblogs" },
      { id: "cloudflare", name: "Cloudflare Blog" },
    ],
  },
  {
    id: "technology",
    name: "科技与产业",
    nameEn: "Technology",
    description: "AI 动态、算力与产业趋势",
    descriptionEn: "AI, computing and industry trends",
    providers: [
      { id: "qbitai", adapter: "qbitai", name: "量子位", nameEn: "QbitAI" },
      { id: "semianalysis", adapter: "semianalysis", name: "SemiAnalysis" },
      {
        id: "trendforce",
        adapter: "trendforce",
        name: "集邦咨询",
        nameEn: "TrendForce",
      },
      {
        id: "eetimes",
        adapter: "eetimes",
        name: "电子工程专辑",
        nameEn: "EE Times China",
      },
      { id: "chinatalk", adapter: "chinatalk", name: "ChinaTalk" },
    ],
  },
  {
    id: "finance",
    name: "财经与市场",
    nameEn: "Markets",
    description: "财经新闻、公司动向与市场观察",
    descriptionEn: "Financial news, companies and market perspectives",
    providers: [
      { id: "yicai", adapter: "yicai", name: "第一财经", nameEn: "Yicai" },
      { id: "cls", adapter: "cls", name: "财联社", nameEn: "CLS" },
      {
        id: "wallstreetcn",
        adapter: "wallstreetcn",
        name: "华尔街见闻",
        nameEn: "Wallstreetcn",
      },
    ],
  },
  {
    id: "policy",
    name: "政策与宏观",
    nameEn: "Policy & economy",
    description: "官方发布、经济数据与政策变化",
    descriptionEn: "Official releases, economic data and policy changes",
    providers: [
      {
        id: "pboc",
        adapter: "pboc",
        name: "中国人民银行",
        nameEn: "People’s Bank of China",
      },
      {
        id: "nbs",
        adapter: "nbs",
        name: "国家统计局",
        nameEn: "National Bureau of Statistics",
      },
      { id: "ndrc", adapter: "ndrc", name: "国家发展改革委", nameEn: "NDRC" },
      { id: "miit", adapter: "miit", name: "工信部", nameEn: "MIIT" },
      { id: "csrc", adapter: "csrc", name: "证监会", nameEn: "CSRC" },
      { id: "fed", adapter: "fed", name: "美联储", nameEn: "Federal Reserve" },
    ],
  },
  {
    id: "business",
    name: "商业与管理",
    nameEn: "Business",
    description: "商业模式、企业战略与管理洞察",
    descriptionEn: "Business models, strategy and management insights",
    providers: [
      { id: "huxiu", adapter: "huxiu", name: "虎嗅", nameEn: "Huxiu" },
      { id: "stratechery", adapter: "stratechery", name: "Stratechery" },
      { id: "benevans", adapter: "benevans", name: "Benedict Evans" },
      { id: "bcg", adapter: "bcg", name: "波士顿咨询", nameEn: "BCG" },
    ],
  },
];

export function newsCategoryForSource(source: PaperNewsSource): NewsCategoryId {
  if (isNewsPublisher(source)) return NEWS_PUBLISHERS[source].category;
  return source === "github" ? "development" : "research";
}

export function newsSourcesForCategory(category: NewsCategoryId | "all"): PaperNewsSource[] {
  return NEWS_FEED_CATEGORIES.filter(
    (entry) => category === "all" || entry.id === category,
  ).flatMap((entry) =>
    entry.providers.flatMap((provider) => (provider.adapter ? [provider.adapter] : [])),
  );
}
