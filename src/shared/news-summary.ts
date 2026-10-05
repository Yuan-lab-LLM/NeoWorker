export type NewsSummaryKind = "description" | "excerpt";
export type NewsSummaryResult =
  | { summary: string; kind: NewsSummaryKind }
  | { error: "unavailable" | "excluded" | "blocked" | "failed" | "busy" };
