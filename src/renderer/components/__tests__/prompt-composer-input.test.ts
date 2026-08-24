import React from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  PromptComposerInput,
  formatPastedWebLinkAsMarkdown,
  replaceComposerDraftText,
} from "../PromptComposerInput";

const promptComposerInputSource = readFileSync(
  fileURLToPath(new URL("../PromptComposerInput.tsx", import.meta.url)),
  "utf8",
);

describe("PromptComposerInput", () => {
  it("renders integration mention chips inline from canonical mention text", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PromptComposerInput, {
        value: "Use @Gmail for triage",
        mentions: [
          {
            spanId: "gmail-1",
            start: 4,
            end: 10,
            mention: {
              id: "builtin:gmail",
              label: "Gmail",
              source: "builtin",
              providerKey: "google-workspace:gmail",
              iconKey: "gmail",
              tools: ["gmail_action"],
              promptHint: "Use gmail_action.",
            },
          },
        ],
        className: "input-field input-textarea",
        ariaLabel: "Message",
        onChange: vi.fn(),
        onKeyDown: vi.fn(),
        onPaste: vi.fn(),
        onCursorChange: vi.fn(),
      }),
    );

    expect(markup).toContain("integration-mention-chip");
    expect(markup).toContain("integration-mention-icon-svg");
    expect(markup).toContain("Gmail");
    expect(markup).toContain("for triage");
  });

  it("formats pasted standalone GitHub URLs as compact Markdown links", () => {
    expect(
      formatPastedWebLinkAsMarkdown(
        "https://github.com/nousresearch/hermes-agent",
      ),
    ).toBe(
      "[nousresearch/hermes-agent](https://github.com/nousresearch/hermes-agent)",
    );
  });

  it("does not rewrite pasted text containing more than one token", () => {
    expect(
      formatPastedWebLinkAsMarkdown(
        "see https://github.com/nousresearch/hermes-agent",
      ),
    ).toBeNull();
  });

  it("renders Markdown web links as inline favicon chips", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PromptComposerInput, {
        value:
          "[nousresearch/hermes-agent](https://github.com/nousresearch/hermes-agent)",
        mentions: [],
        className: "input-field input-textarea",
        ariaLabel: "Message",
        onChange: vi.fn(),
        onKeyDown: vi.fn(),
        onPaste: vi.fn(),
        onCursorChange: vi.fn(),
      }),
    );

    expect(markup).toContain("composer-link-chip");
    expect(markup).toContain("composer-link-favicon");
    expect(markup).toContain("nousresearch/hermes-agent");
    expect(markup).toContain("github.com");
    expect(markup).not.toContain(
      "https://github.com/nousresearch/hermes-agent</span>",
    );
  });

  it("keeps the canonical draft synchronized during IME composition", () => {
    const inputHandlerStart = promptComposerInputSource.indexOf(
      "const handleInput = () =>",
    );
    const inputHandlerEnd = promptComposerInputSource.indexOf(
      "const handleCompositionStart",
      inputHandlerStart,
    );
    const inputHandler = promptComposerInputSource.slice(
      inputHandlerStart,
      inputHandlerEnd,
    );

    expect(inputHandlerStart).toBeGreaterThan(-1);
    expect(inputHandler).toContain("emitDomChange(false)");
    expect(inputHandler).not.toContain("return;");
    expect(promptComposerInputSource).toContain(
      "if (isComposingRef.current) {\n      isComposingRef.current = false;",
    );
    expect(promptComposerInputSource).toContain("onBlur={handleBlur}");
    expect(promptComposerInputSource).toContain("new MutationObserver(() =>");
    expect(promptComposerInputSource).toContain(
      "getSnapshot: getLatestSnapshot",
    );
    expect(promptComposerInputSource).toContain(
      "const snapshot = readEditable(root, mentionsById)",
    );
    expect(promptComposerInputSource).toContain(
      "onDraftPresenceChange?: (hasDraft: boolean) => void",
    );
    expect(promptComposerInputSource).toContain(
      "reportDraftPresence(snapshot.value)",
    );
  });

  it("preserves two links when they are pasted back-to-back before a render", () => {
    const workBuddyUrl = "https://example.com/workbuddy";
    const neoWorkerUrl = "https://github.com/Yuan-lab-LLM/NeoWorker";
    const workBuddyLink = formatPastedWebLinkAsMarkdown(workBuddyUrl);
    const neoWorkerLink = formatPastedWebLinkAsMarkdown(neoWorkerUrl);
    expect(workBuddyLink).not.toBeNull();
    expect(neoWorkerLink).not.toBeNull();

    const initial = {
      value: "分析一下 WorkBuddy 和 NeoWorker，网址：",
      mentions: [],
    };
    const afterFirstPaste = replaceComposerDraftText(
      initial,
      initial.value.length,
      initial.value.length,
      workBuddyLink!,
    );
    const afterSecondPaste = replaceComposerDraftText(
      afterFirstPaste,
      afterFirstPaste.cursor,
      afterFirstPaste.cursor,
      neoWorkerLink!,
    );

    expect(afterSecondPaste.value).toContain(workBuddyUrl);
    expect(afterSecondPaste.value).toContain(neoWorkerUrl);
    expect(afterSecondPaste.value.indexOf(workBuddyUrl)).toBeLessThan(
      afterSecondPaste.value.indexOf(neoWorkerUrl),
    );
  });

  it("submits from the atomic editor snapshot instead of render-time state", () => {
    expect(promptComposerInputSource).toContain(
      "hasPendingProgrammaticEditRef.current = true",
    );
    expect(promptComposerInputSource).toContain(
      "if (hasPendingProgrammaticEditRef.current && pendingSelectionRef.current)",
    );
    expect(promptComposerInputSource).not.toContain(
      "const next = replaceRange(\n        value,\n        validMentions,",
    );
    expect(promptComposerInputSource).toContain(
      "getValue: () => getLatestSnapshot().value",
    );
  });
});
