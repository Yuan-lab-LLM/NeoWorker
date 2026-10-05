import type { NewsCategoryId } from "../../shared/news-preferences";

// Reuse bundled editorial artwork so every stream entry has an offline cover.
// These illustrate a topic, not the event described by an individual article.
const TOPIC_IMAGES: Record<NewsCategoryId, string> = {
  research: "ideas/research-analytics-v2.webp",
  development: "ideas/development.webp",
  technology: "ideas/architecture.webp",
  finance: "ideas/finance-screen.webp",
  policy: "ideas/legal-paper-illustration.webp",
  business: "ideas/team-planning-illustration.webp",
  health: "ideas/generated/00-morning-brief-sunrise.webp",
  consumer: "ideas/workspace.webp",
  productivity: "ideas/coffee-notes.webp",
  learning: "ideas/books.webp",
};

export function newsTopicImage(category: NewsCategoryId): string {
  return `${import.meta.env.BASE_URL}${TOPIC_IMAGES[category]}`;
}
