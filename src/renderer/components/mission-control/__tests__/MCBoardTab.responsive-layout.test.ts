import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesPath = fileURLToPath(
  new URL("../task-workspace-june.css", import.meta.url),
);

describe("MCBoardTab responsive action layout", () => {
  it("uses one shared header and summary-card system for every task tab", () => {
    const styles = readFileSync(stylesPath, "utf8");
    const unifiedLayout = styles.slice(
      styles.lastIndexOf("/* Run center: one shared page skeleton"),
    );

    expect(unifiedLayout).toMatch(
      /\.mc-task-workspace \.mc-task-view-header\s*\{[\s\S]*?min-height:\s*56px;[\s\S]*?padding:\s*0 2px 14px;/,
    );
    expect(unifiedLayout).toMatch(
      /\.mc-task-workspace \.mc-task-summary-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);[\s\S]*?gap:\s*8px;[\s\S]*?border:\s*0;/,
    );
    expect(unifiedLayout).toMatch(
      /\.mc-task-workspace \.mc-task-summary-card\s*\{[\s\S]*?min-height:\s*70px;[\s\S]*?border:\s*1px solid var\(--task-border\);[\s\S]*?border-radius:\s*10px;/,
    );
    expect(unifiedLayout).not.toContain(".mc-task-workspace.view-active");
  });

  it("reserves the full action width instead of clipping the task controls", () => {
    const styles = readFileSync(stylesPath, "utf8");
    const finalLayout = styles.slice(
      styles.lastIndexOf("/* Keep priority and row actions"),
    );

    expect(finalLayout).toMatch(/grid-template-columns:[\s\S]*88px\s+126px;/);
    expect(finalLayout).toMatch(
      /\.mc-task-row-actions\s*\{[\s\S]*?width:\s*126px;[\s\S]*?min-width:\s*126px;/,
    );
    expect(finalLayout).not.toMatch(/grid-template-columns:[^;]*\s32px;/);
  });

  it("keeps actions visible in compact panes and drops priority before clipping", () => {
    const styles = readFileSync(stylesPath, "utf8");
    const finalLayout = styles.slice(
      styles.lastIndexOf("/* Keep priority and row actions"),
    );

    expect(finalLayout).toContain(
      "grid-template-columns: minmax(0, 1fr) 72px 116px;",
    );
    expect(finalLayout).toContain("@container (max-width: 430px)");
    expect(finalLayout).toMatch(
      /@container \(max-width: 430px\)[\s\S]*?\.mc-task-row-priority\s*\{\s*display:\s*none;/,
    );
    expect(finalLayout).toMatch(
      /@container \(max-width: 430px\)[\s\S]*?\.mc-task-row-actions\s*\{[\s\S]*?min-width:\s*104px;/,
    );
  });
});
