export type NewsSummaryKind = "description" | "excerpt";
export type NewsSummaryResult =
  | { summary: string; kind: NewsSummaryKind }
  | { error: "unavailable" | "blocked" | "failed" | "busy" };
