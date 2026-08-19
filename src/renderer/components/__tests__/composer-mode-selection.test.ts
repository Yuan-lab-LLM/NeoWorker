import { describe, expect, it } from "vitest";
import {
  COMPOSER_MODE_ORDER,
  deriveComposerModeSelection,
  resolveComposerModeSelection,
} from "../MainContent/composer-mode-selection";

describe("composer mode selection", () => {
  it("exposes one concise mutually exclusive mode list", () => {
    expect(COMPOSER_MODE_ORDER).toEqual(["auto", "execute", "research"]);
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
});
