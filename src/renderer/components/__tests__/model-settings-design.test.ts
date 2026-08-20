import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const settingsSource = readFileSync(
  new URL("../Settings.tsx", import.meta.url),
  "utf8",
);
const settingsStyles = readFileSync(
  new URL("../settings.css", import.meta.url),
  "utf8",
);

describe("model settings presentation", () => {
  it("keeps model rows compact and reveals the activity chart on demand", () => {
    expect(settingsSource).toContain('className="llm-model-usage-list"');
    expect(settingsSource).toContain('className="llm-model-primary-metrics"');
    expect(settingsSource).toMatch(
      /\{detailsExpanded && \([\s\S]*?<ModelUsageHeatmap/,
    );
    expect(settingsStyles).toMatch(
      /\.settings-page \.llm-model-usage-card,[\s\S]*?box-shadow:\s*none;/,
    );
  });

  it("explains a usage cell with localized date, token and call values", () => {
    expect(settingsSource).toContain('new Intl.DateTimeFormat("zh-CN"');
    expect(settingsSource).toContain("data-tooltip={tooltipLabel}");
    expect(settingsSource).toContain("· 无调用");
    expect(settingsSource).toContain("次调用");
    expect(settingsSource).toContain(
      "tabIndex={value > 0 || callCount > 0 ? 0 : -1}",
    );
    expect(settingsStyles).toContain("span[data-tooltip]::after");
    expect(settingsStyles).toContain("span[data-tooltip]:focus-visible::after");
  });
});
