export type UsageInsightsPeriodPreset =
  1 | 7 | 14 | 30 | 90 | 180 | 365 | "custom";

export const DEFAULT_USAGE_INSIGHTS_PERIOD_PRESET: UsageInsightsPeriodPreset = 7;

export const USAGE_INSIGHTS_PERIOD_PRESETS: Array<{
  value: UsageInsightsPeriodPreset;
  label: string;
}> = [
  { value: 1, label: "1d" },
  { value: 7, label: "7d" },
  { value: 14, label: "14d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
  { value: 180, label: "6mo" },
  { value: 365, label: "1y" },
  { value: "custom", label: "Custom" },
];

export function getVisibleUsageInsightsPeriodPresets(
  dataAgeDays: number | null,
) {
  if (dataAgeDays === null) return USAGE_INSIGHTS_PERIOD_PRESETS;
  return USAGE_INSIGHTS_PERIOD_PRESETS.filter(
    ({ value }) => value === "custom" || value <= Math.max(dataAgeDays, 7),
  );
}
