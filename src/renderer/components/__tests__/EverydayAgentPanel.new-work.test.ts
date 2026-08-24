import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const panelSource = readFileSync(
  fileURLToPath(new URL("../EverydayAgentPanel.tsx", import.meta.url)),
  "utf8",
);
const appSource = readFileSync(
  fileURLToPath(new URL("../../App.tsx", import.meta.url)),
  "utf8",
);

describe("Everyday Agent new work handoff", () => {
  it("hides the approval card until a real pending approval exists", () => {
    expect(panelSource).toContain("{approvalItem && (");
    expect(panelSource).toContain('"Awaiting my approval"');
    expect(panelSource).not.toContain("目前没有需要你确认的动作。");
  });

  it("opens the unified inline composer instead of navigating or executing placeholder copy", () => {
    expect(panelSource).toContain("<UnifiedTaskComposer");
    expect(panelSource).toContain("setShowInlineComposer(true)");
    expect(panelSource).toContain(
      'cacheKey={`everyday:${workspace?.id || "no-workspace"}`}',
    );
    expect(panelSource).not.toContain("请帮我完成以下工作：");
    expect(appSource).toMatch(
      /onCreateTask=\{\(title, prompt\)\s*=>\s*handleCreateTask\(title, prompt\)\s*\}/,
    );
    expect(appSource).not.toContain(
      'onCreateTask={(title, prompt) => {\n                    setCurrentView("main")',
    );
  });

  it("keeps recommendations and daily priorities as draft-only actions", () => {
    expect(panelSource).toContain("onOpenComposerDraft(prompt, workspace)");
    expect(panelSource).not.toContain("actOnSuggestion(suggestion.id)");
  });

  it("keeps daily-assistant run records inside the daily assistant", () => {
    expect(panelSource).toContain('actionKind: routine ? "activity" : "mission"');
    expect(panelSource).toContain("setShowDailyActivity(true)");
    expect(panelSource).toContain('className="ea-activity-view"');
    expect(panelSource).toContain("routines.map((routine)");
    expect(panelSource).toContain("recentReceipts.map((receipt)");
    expect(panelSource).not.toContain("onOpenAutomationRuns");
    expect(appSource).not.toContain("onOpenAutomationRuns=");
  });

  it("rejects empty prompts at the task creation boundary", () => {
    const handlerStart = appSource.indexOf("const handleCreateTask = async");
    const handlerEnd = appSource.indexOf(
      "const handleSendMessage",
      handlerStart,
    );
    const handler = appSource.slice(handlerStart, handlerEnd);

    expect(handlerStart).toBeGreaterThan(-1);
    expect(handler).toMatch(/if \(!prompt\.trim\(\)\) return(?: false)?;/);
  });
});
