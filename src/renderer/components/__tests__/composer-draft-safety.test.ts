import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const mainContentSource = readFileSync(
  fileURLToPath(new URL("../MainContent/MainContent.tsx", import.meta.url)),
  "utf8",
);
const appSource = readFileSync(
  fileURLToPath(new URL("../../App.tsx", import.meta.url)),
  "utf8",
);
const skillModalSource = readFileSync(
  fileURLToPath(new URL("../SkillParameterModal.tsx", import.meta.url)),
  "utf8",
);
const homeSource = readFileSync(
  fileURLToPath(new URL("../HomeDashboard.tsx", import.meta.url)),
  "utf8",
);
const everydaySource = readFileSync(
  fileURLToPath(new URL("../EverydayAgentPanel.tsx", import.meta.url)),
  "utf8",
);
const capabilityCenterSource = readFileSync(
  fileURLToPath(new URL("../CapabilityCenter.tsx", import.meta.url)),
  "utf8",
);
const unifiedComposerSource = readFileSync(
  fileURLToPath(new URL("../UnifiedTaskComposer.tsx", import.meta.url)),
  "utf8",
);
const promptComposerSource = readFileSync(
  fileURLToPath(new URL("../PromptComposerInput.tsx", import.meta.url)),
  "utf8",
);

describe("composer draft safety", () => {
  it("fills parameterized skills into the composer instead of creating a task", () => {
    const handlerStart = mainContentSource.indexOf(
      "const handleSkillParamSubmit",
    );
    const handlerEnd = mainContentSource.indexOf(
      "const handleSkillParamCancel",
      handlerStart,
    );
    const handler = mainContentSource.slice(handlerStart, handlerEnd);

    expect(handlerStart).toBeGreaterThan(-1);
    expect(handler).toContain("setInputValue(draft)");
    expect(handler).toContain("promptInputRef.current?.focus()");
    expect(handler).not.toContain("onCreateTask(");
    expect(skillModalSource).toContain('"skillParameter.fillDraft"');
  });

  it("keeps raw skill prompts out of the visible Chinese composer draft", () => {
    expect(mainContentSource).toContain(
      "const draft = expandSkillPrompt(skill, {})",
    );
    expect(mainContentSource).not.toContain("setInputValue(skill.prompt)");
    expect(mainContentSource).toContain("Boolean(composerSkillContext)");
    expect(skillModalSource).toContain('getCurrentLanguage() === "zh-CN"');
    expect(skillModalSource).toContain("buildLocalizedSkillComposerPrompt");
    expect(capabilityCenterSource).toContain(
      "const examplePrompt = buildLocalizedSkillComposerPrompt(skill",
    );
  });

  it("keeps recommendation actions on the editable-draft path", () => {
    expect(homeSource).toContain(
      "onOpenComposerDraft(prompt, targetWorkspace)",
    );
    expect(homeSource).not.toContain("onCreateTask(suggestion.title, prompt)");
    expect(everydaySource).toContain("onOpenComposerDraft(prompt, workspace)");
    expect(everydaySource).not.toContain(
      "onCreateTask?.(suggestion.title, prompt)",
    );
  });

  it("caches drafts by project, workspace, and session while switching pages", () => {
    expect(mainContentSource).toContain(
      "const composerDraftCache = new Map<string, string>()",
    );
    expect(mainContentSource).toContain('projectId || "no-project"');
    expect(mainContentSource).toContain(
      "task?.sessionId || task?.id || selectedTaskId",
    );
    expect(mainContentSource).toContain("cacheComposerDraft(");
    expect(mainContentSource).toContain(
      "composerDraftCache.get(composerDraftCacheKey)",
    );
  });

  it("keeps attachment drafts isolated by workspace session", () => {
    expect(mainContentSource).toContain(
      "const composerAttachmentDraftCache = new Map<string, PendingAttachment[]>()",
    );
    expect(mainContentSource).toMatch(
      /cacheComposerAttachmentDraft\(\s*composerDraftCacheKeyRef\.current/,
    );
    expect(mainContentSource).toContain(
      "composerAttachmentDraftCache.get(composerDraftCacheKey)",
    );
    expect(mainContentSource).toContain(
      "setPendingAttachmentsState(nextAttachments)",
    );
    expect(mainContentSource).toContain(
      "appendPendingAttachments(pending, attachmentDraftKey)",
    );
    expect(mainContentSource).toContain(
      "const submittedAttachmentDraftKey = composerDraftCacheKeyRef.current",
    );
    expect(mainContentSource).toContain(
      "updateAttachmentDraftForKey(submittedAttachmentDraftKey, [])",
    );
  });

  it("clears an accepted follow-up before awaiting the long-running agent turn", () => {
    const followUpBranchStart = mainContentSource.indexOf(
      "// Task is selected (even if not in current list) - send follow-up message",
    );
    const followUpBranchEnd = mainContentSource.indexOf(
      "const submittedWelcomeSuggestionDraft",
      followUpBranchStart,
    );
    const followUpBranch = mainContentSource.slice(
      followUpBranchStart,
      followUpBranchEnd,
    );

    expect(followUpBranchStart).toBeGreaterThan(-1);
    expect(followUpBranch).toContain("clearSubmittedComposerDraft();");
    expect(followUpBranch).toContain("await onSendMessage(");
    expect(followUpBranch.indexOf("clearSubmittedComposerDraft();")).toBeLessThan(
      followUpBranch.indexOf("await onSendMessage("),
    );
    expect(mainContentSource).toContain("restoreSubmittedComposerDraft();");
    expect(mainContentSource).toContain(
      "composerDraftCacheKeyRef.current !== submittedAttachmentDraftKey",
    );
    expect(mainContentSource).toContain("if (!submittedComposerCleared) {");
    expect(appSource).toContain(
      "throw error instanceof Error ? error : new Error(errorMessage)",
    );
  });

  it("restores scroll position independently for each workspace session", () => {
    expect(mainContentSource).toContain("const composerScrollCache = new Map<");
    expect(mainContentSource).toContain(
      "composerScrollCache.set(composerScrollCacheKeyRef.current",
    );
    expect(mainContentSource).toContain(
      "const snapshot = composerScrollCache.get(composerDraftCacheKey)",
    );
    expect(mainContentSource).toContain("new ResizeObserver(restore)");
  });

  it("closes slash and mention menus with Escape even when search has no results", () => {
    expect(mainContentSource).toContain(
      'if (e.key === "Escape" && (mentionOpen || slashOpen))',
    );
    expect(mainContentSource).toContain("setMentionOpen(false)");
    expect(mainContentSource).toContain("setSlashOpen(false)");
  });

  it("does not let a stale React draft disable a visibly populated editor", () => {
    expect(mainContentSource).toContain(
      "const liveDraftSnapshot = promptInputRef.current?.getSnapshot()",
    );
    expect(mainContentSource).toContain(
      "liveDraftSnapshot?.value ?? composerDraftValueRef.current",
    );
    expect(mainContentSource).toContain(
      "liveDraftSnapshot?.mentions ?? integrationMentionSpans",
    );
    expect(mainContentSource).toContain(
      "onDraftPresenceChange={setHasLiveComposerDraft}",
    );
    expect(mainContentSource).toContain("const hasSendableComposerDraft =");
    expect(mainContentSource).toContain("disabled={isComposerSendBusy}");
    expect(promptComposerSource).toContain(
      'rootRef.current?.setAttribute(',
    );
    expect(promptComposerSource).toContain('"data-has-draft"');
    expect(mainContentSource).not.toContain(
      "(!inputValue.trim() &&\n                      pendingAttachments.length === 0",
    );
    expect(unifiedComposerSource).toContain(
      "const liveDraftSnapshot = inputRef.current?.getSnapshot()",
    );
    expect(unifiedComposerSource).toContain(
      "const liveValue = liveDraftSnapshot?.value ?? valueRef.current",
    );
    expect(unifiedComposerSource).toContain("const draft = liveValue.trim()");
  });

  it("preserves every real plan description in the composer progress popover", () => {
    expect(mainContentSource).toContain("{planSteps.map((step, index) => {");
    expect(mainContentSource).not.toContain(
      "const visibleSteps = useMemo(\n    () => getVisibleProgressSteps(planSteps)",
    );
    expect(mainContentSource).toContain("? trimmed\n    : generic || trimmed");
  });
});
