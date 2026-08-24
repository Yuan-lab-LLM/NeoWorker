import { describe, expect, it } from "vitest";
import {
  COMPOSER_MODE_ORDER,
  deriveComposerModeSelection,
  resolveComposerModeSelection,
  shouldSuggestExecuteForChat,
} from "../MainContent/composer-mode-selection";

describe("composer mode selection", () => {
  it("exposes one concise mutually exclusive mode list", () => {
    expect(COMPOSER_MODE_ORDER).toEqual(["chat", "auto", "execute", "research"]);
  });

  it("selects and restores the explicit read-only chat mode", () => {
    const state = resolveComposerModeSelection("chat");

    expect(state).toEqual({
      executionMode: "chat",
      executionModeDirty: true,
      taskDomain: "auto",
      taskDomainDirty: true,
    });
    expect(deriveComposerModeSelection(state)).toBe("chat");
    expect(
      deriveComposerModeSelection({
        executionMode: "chat",
        executionModeDirty: false,
        taskDomain: "auto",
        taskDomainDirty: false,
      }),
    ).toBe("chat");
  });

  it("keeps automatic selection free of manual overrides", () => {
    const state = resolveComposerModeSelection("auto");

    expect(state).toEqual({
      executionMode: "execute",
      executionModeDirty: false,
      taskDomain: "auto",
      taskDomainDirty: false,
    });
    expect(deriveComposerModeSelection(state)).toBe("auto");
  });

  it("forces execution only when the user explicitly chooses it", () => {
    const state = resolveComposerModeSelection("execute");

    expect(state.executionMode).toBe("execute");
    expect(state.executionModeDirty).toBe(true);
    expect(state.taskDomain).toBe("auto");
    expect(deriveComposerModeSelection(state)).toBe("execute");
  });

  it("uses the research domain without forcing an execution strategy", () => {
    const state = resolveComposerModeSelection("research");

    expect(state.executionModeDirty).toBe(false);
    expect(state.taskDomain).toBe("research");
    expect(state.taskDomainDirty).toBe(true);
    expect(deriveComposerModeSelection(state)).toBe("research");
  });

  it("suggests Execute for concrete mutations but keeps explanatory questions in Chat", () => {
    expect(shouldSuggestExecuteForChat("帮我生成一个 Excel 文件")).toBe(true);
    expect(shouldSuggestExecuteForChat("Please run this code and save the output file")).toBe(true);
    expect(shouldSuggestExecuteForChat("修复这个 bug")).toBe(true);
    expect(shouldSuggestExecuteForChat("/skill spreadsheet 生成台账")).toBe(true);
    expect(shouldSuggestExecuteForChat("为什么生成 Excel 会失败？")).toBe(false);
    expect(shouldSuggestExecuteForChat("如何写一段 Python 代码？")).toBe(false);
  });
});
