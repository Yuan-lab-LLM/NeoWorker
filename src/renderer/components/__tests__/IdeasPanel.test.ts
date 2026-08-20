import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { stripIdeaSkillInvocation } from "../IdeasPanel";

const ideasPanelSource = readFileSync(
  fileURLToPath(new URL("../IdeasPanel.tsx", import.meta.url)),
  "utf8",
);
const appSource = readFileSync(
  fileURLToPath(new URL("../../App.tsx", import.meta.url)),
  "utf8",
);
const mainContentSource = readFileSync(
  fileURLToPath(new URL("../MainContent/MainContent.tsx", import.meta.url)),
  "utf8",
);

describe("Ideas prompt handoff", () => {
  it("hands the selected template to the composer instead of creating a task", () => {
    const composerHandlerStart = appSource.indexOf(
      "const handleOpenComposerDraft",
    );
    const handlerStart = appSource.indexOf("const handleUseIdeaPrompt");
    const handlerEnd = appSource.indexOf(
      "const handleComposerDraftConsumed",
      handlerStart,
    );
    const composerHandler = appSource.slice(composerHandlerStart, handlerStart);
    const handler = appSource.slice(handlerStart, handlerEnd);

    expect(composerHandlerStart).toBeGreaterThan(-1);
    expect(handlerStart).toBeGreaterThan(-1);
    expect(composerHandler).toContain("setComposerDraftRequest");
    expect(handler).toContain("selection: IdeaPromptSelection");
    expect(handler).toContain("await handleOpenComposerDraft(draft, {");
    expect(handler).not.toContain("handleCreateTask(");
    expect(ideasPanelSource).toContain(
      "stripIdeaSkillInvocation(prompt, idea.skill)",
    );
    expect(ideasPanelSource).toContain("onUsePrompt({");
  });

  it("fills and focuses the composer as a one-time request", () => {
    expect(mainContentSource).toContain(
      "setInputValue(composerDraftRequest.value)",
    );
    expect(mainContentSource).toContain("setComposerSkillContext(");
    expect(mainContentSource).toContain(
      "data-skill-id={composerSkillContext.skillId}",
    );
    expect(mainContentSource).toContain(
      "requestedSkillId: composerSkillContext.skillId",
    );
    expect(mainContentSource).toContain("input.focus()");
    expect(mainContentSource).toContain(
      "onComposerDraftConsumed?.(composerDraftRequest.id)",
    );
  });

  it("removes the internal skill invocation while preserving the editable task", () => {
    expect(
      stripIdeaSkillInvocation(
        "使用 dcf-valuation 技能。我会提供公司或财务假设。请建立折现现金流模型。",
        "dcf-valuation",
      ),
    ).toBe("我会提供公司或财务假设。请建立折现现金流模型。");
    expect(
      stripIdeaSkillInvocation(
        "Use the stock-analysis skill. Ticker: [enter ticker]. Analyze it.",
        "stock-analysis",
      ),
    ).toBe("Ticker: [enter ticker]. Analyze it.");
  });

  it("asks for required stock input before the template can be sent", () => {
    expect(ideasPanelSource).toContain("Ticker: [enter ticker]");
  });

  it("exposes the idea category for restrained per-category visual accents", () => {
    expect(ideasPanelSource).toContain("data-idea-category={idea.category}");
  });
});
