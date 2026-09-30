import { BookOpen, BriefcaseBusiness, ChartNoAxesCombined, Code2, Cpu, GraduationCap, HeartPulse, Landmark, ShoppingBag, Zap } from "lucide-react";
import { NEWS_FEED_CATEGORIES, type NewsCategoryId } from "./news-feed-catalog";
import { useLanguage } from "../i18n";

export const newsCategoryIcons = {
  research: GraduationCap, development: Code2, technology: Cpu,
  finance: ChartNoAxesCombined, policy: Landmark, business: BriefcaseBusiness,
  health: HeartPulse, consumer: ShoppingBag, productivity: Zap, learning: BookOpen,
};

const categorySubtitles: Record<NewsCategoryId, [string, string]> = {
  research: ["论文与前沿", "Papers & discoveries"],
  development: ["模型与工程", "Models & engineering"],
  technology: ["AI 与算力", "AI & computing"],
  finance: ["公司与市场", "Companies & markets"],
  policy: ["发布与观察", "Releases & perspectives"],
  business: ["战略与组织", "Strategy & organizations"],
  health: ["运动与营养", "Exercise & nutrition"],
  consumer: ["产品与选购", "Products & buying guides"],
  productivity: ["软件与方法", "Software & workflows"],
  learning: ["课程与职业", "Courses & careers"],
};

export function NewsCategoryNavigation({ category, onSelect }: {
  category: NewsCategoryId | "all";
  onSelect: (category: NewsCategoryId | "all") => void;
}) {
  const language = useLanguage();
  const t = (zh: string, en: string) => language === "zh-CN" ? zh : en;
  return <nav className="pn-category-navigation" aria-label={t("资讯分类", "News categories")}>
    <div className="pn-category-intro">
      <h2>{t("探索领域", "Explore topics")}</h2>
      <button className={`pn-category pn-category-all ${category === "all" ? "is-active" : ""}`} aria-pressed={category === "all"} onClick={() => onSelect("all")}>
        <strong>{t("全部动态", "All topics")}</strong>
      </button>
    </div>
    <div className="pn-categories">
      {NEWS_FEED_CATEGORIES.map(entry => {
        return <button key={entry.id} className={`pn-category ${category === entry.id ? "is-active" : ""}`} aria-pressed={category === entry.id} title={t(entry.description, entry.descriptionEn)} onClick={() => onSelect(entry.id)}>
          <strong>{t(entry.name, entry.nameEn)}</strong>
          <span className="pn-category-description">{t(...categorySubtitles[entry.id])}</span>
        </button>;
      })}
    </div>
  </nav>;
}
