import { BookOpen, BriefcaseBusiness, ChartNoAxesCombined, Code2, Cpu, GraduationCap, HeartPulse, Landmark, LayoutGrid, ShoppingBag, Zap } from "lucide-react";
import { NEWS_FEED_CATEGORIES, type NewsCategoryId } from "./news-feed-catalog";
import { useLanguage } from "../i18n";

export const newsCategoryIcons = {
  research: GraduationCap, development: Code2, technology: Cpu,
  finance: ChartNoAxesCombined, policy: Landmark, business: BriefcaseBusiness,
  health: HeartPulse, consumer: ShoppingBag, productivity: Zap, learning: BookOpen,
};

export function NewsCategoryNavigation({ category, onSelect }: {
  category: NewsCategoryId | "all";
  onSelect: (category: NewsCategoryId | "all") => void;
}) {
  const language = useLanguage();
  const t = (zh: string, en: string) => language === "zh-CN" ? zh : en;
  return <nav className="pn-category-navigation" aria-label={t("资讯分类", "News categories")}>
    <div className="pn-category-intro">
      <h2 className="pn-visually-hidden">{t("探索领域", "Explore topics")}</h2>
      <button className={`pn-category pn-category-all ${category === "all" ? "is-active" : ""}`} aria-pressed={category === "all"} onClick={() => onSelect("all")}>
        <LayoutGrid size={16} strokeWidth={1.8} aria-hidden="true" />
        <strong>{t("全部动态", "All topics")}</strong>
      </button>
    </div>
    <div className="pn-categories">
      {NEWS_FEED_CATEGORIES.map(entry => {
        const Icon = newsCategoryIcons[entry.id];
        return <button key={entry.id} className={`pn-category ${category === entry.id ? "is-active" : ""}`} aria-pressed={category === entry.id} title={t(entry.description, entry.descriptionEn)} onClick={() => onSelect(entry.id)}>
          <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
          <strong>{t(entry.name, entry.nameEn)}</strong>
        </button>;
      })}
    </div>
  </nav>;
}
