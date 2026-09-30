import type { PaperNewsSource } from "../../shared/paper-news";

import { newsCategory, type NewsCategoryId } from "../../shared/news-preferences";
export type { NewsCategoryId } from "../../shared/news-preferences";
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
      { id: "mitai", adapter: "mitai", name: "MIT 人工智能", nameEn: "MIT AI" },
      {
        id: "natureml",
        adapter: "natureml",
        name: "Nature · 机器学习",
        nameEn: "Nature · Machine learning",
      },
      { id: "arxiv", name: "arXiv", adapter: "arxiv" },
      { id: "hf-papers", name: "Hugging Face Papers", adapter: "huggingface" },
      { id: "openalex", name: "OpenAlex" },
    ],
  },
  {
    id: "development",
    name: "开源与开发",
    nameEn: "Open source",
    description: "开源项目、模型、数据集与工程实践",
    descriptionEn: "Repositories, models, datasets and engineering practice",
    providers: [
      { id: "githubblog", adapter: "githubblog", name: "GitHub Blog", nameEn: "GitHub Blog" },
      { id: "github", name: "GitHub", adapter: "github" },
      { id: "hf-models", name: "Hugging Face Models", adapter: "hf-models" },
      { id: "hf-datasets", name: "Hugging Face Datasets", adapter: "hf-datasets" },
      { id: "hackernews", adapter: "hackernews", name: "Hacker News" },
      { id: "cnblogs", adapter: "cnblogs", name: "博客园", nameEn: "Cnblogs" },
      { id: "cloudflare", adapter: "cloudflare", name: "Cloudflare Blog" },
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
      { id: "eeo", adapter: "eeo", name: "经济观察网", nameEn: "Economic Observer" },
      { id: "ftchinese", adapter: "ftchinese", name: "FT 中文网", nameEn: "FT Chinese" },
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
      { id: "ecb", adapter: "ecb", name: "欧洲央行", nameEn: "European Central Bank" },
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
      { id: "sloan", adapter: "sloan", name: "MIT 斯隆管理学院", nameEn: "MIT Sloan" },
      { id: "huxiu", adapter: "huxiu", name: "虎嗅", nameEn: "Huxiu" },
      { id: "stratechery", adapter: "stratechery", name: "Stratechery" },
      { id: "benevans", adapter: "benevans", name: "Benedict Evans" },
      { id: "bcg", adapter: "bcg", name: "波士顿咨询", nameEn: "BCG" },
    ],
  },
  {
    id: "health", name: "健康与生活", nameEn: "Health & living",
    description: "健康科普、运动、营养与生活方式", descriptionEn: "Health research, exercise, nutrition and wellbeing",
    providers: [
      { id: "who", adapter: "who", name: "世界卫生组织", nameEn: "WHO" },
      { id: "sciencedailyhealth", adapter: "sciencedailyhealth", name: "ScienceDaily · 健康", nameEn: "ScienceDaily \u00b7 Health" },
    ],
  },
  {
    id: "consumer", name: "消费与好物", nameEn: "Shopping & reviews",
    description: "产品评测、选购指南与数码家电", descriptionEn: "Product reviews, buying guides and consumer technology",
    providers: [
      { id: "androidreviews", adapter: "androidreviews", name: "Android Authority · 评测", nameEn: "Android Authority \u00b7 Reviews" },
      { id: "engadget", adapter: "engadget", name: "Engadget", nameEn: "Engadget" },
    ],
  },
  {
    id: "productivity", name: "效率与工具", nameEn: "Productivity & tools",
    description: "实用软件、AI 工具与办公技巧", descriptionEn: "Useful software, AI tools and productive workflows",
    providers: [
      { id: "zapier", adapter: "zapier", name: "Zapier · 效率指南", nameEn: "Zapier \u00b7 Productivity" },
    ],
  },
  {
    id: "learning", name: "学习与成长", nameEn: "Learning & growth",
    description: "学习方法、课程与职业发展", descriptionEn: "Learning methods, courses and career development",
    providers: [
      { id: "learningresearch", adapter: "learningresearch", name: "学习科学", nameEn: "The Learning Scientists" },
      { id: "coursera", adapter: "coursera", name: "Coursera", nameEn: "Coursera" },
    ],
  },
];

export function newsCategoryForSource(source: PaperNewsSource): NewsCategoryId {
  return newsCategory(source);
}

export function newsSourcesForCategory(category: NewsCategoryId | "all"): PaperNewsSource[] {
  return NEWS_FEED_CATEGORIES.filter(
    (entry) => category === "all" || entry.id === category,
  ).flatMap((entry) =>
    entry.providers.flatMap((provider) => (provider.adapter ? [provider.adapter] : [])),
  );
}
