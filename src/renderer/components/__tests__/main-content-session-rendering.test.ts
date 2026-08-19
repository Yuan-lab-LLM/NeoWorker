import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const mainContentPath = fileURLToPath(
  new URL("../MainContent/MainContent.tsx", import.meta.url),
);
const mainContentStylesPath = fileURLToPath(
  new URL("../MainContent/main-content.css", import.meta.url),
);
const globalStylesPath = fileURLToPath(
  new URL("../../styles/index.css", import.meta.url),
);

describe("session conversation rendering", () => {
  it("keeps welcome and session composers free of animated border beams", () => {
    const source = readFileSync(mainContentPath, "utf8");

    expect(source).not.toContain("NeoWorkerBorderBeam");
    expect(source).not.toContain("neoworker-border-beam-host");
  });

  it("always defines transcript events before filtering assistant messages", () => {
    const source = readFileSync(mainContentPath, "utf8");

    expect(source).toContain(
      "const transcriptEvents = Array.isArray(props.filteredEvents)",
    );
    expect(source).toContain(": events;");
    expect(source).toMatch(
      /shouldRenderAssistantMessageInTranscript\(\s*transcriptEvents,\s*item\.eventIndex,?\s*\)/,
    );
    expect(source).toContain("filteredEvents={filteredEvents}");
  });

  it("keeps multiple user turns in one session and exposes a Codex-style preview rail", () => {
    const source = readFileSync(mainContentPath, "utf8");
    const styles = readFileSync(mainContentStylesPath, "utf8");

    expect(source).toContain('data-conversation-turn-id="initial"');
    expect(source).toContain("data-conversation-turn-id={`event:${event.id}`}");
    expect(source).toContain("<ConversationTurnRail");
    expect(source).toContain("getConversationTurnPreview");
    expect(source).toContain("turns.length < 4");
    expect(source).toContain("conversation-turn-preview");
    expect(source).toContain("onClick={() => onSelectTurn(turn.id)}");
    expect(source).toContain('aria-current={isActive ? "true" : undefined}');
    expect(styles).toContain(".conversation-turn-rail");
    expect(styles).toContain(
      ".conversation-turn-marker-row.is-active .conversation-turn-marker",
    );
    expect(styles).toContain(".conversation-turn-preview");
    expect(styles).toContain("--marker-progress");
    expect(styles).toContain("@media (max-width: 620px)");
  });

  it("does not render the redundant task context action row", () => {
    const source = readFileSync(mainContentPath, "utf8");

    expect(source).not.toContain('from "../TaskContextBar"');
    expect(source).not.toContain("<TaskContextBar");
  });

  it("cancels bottom-follow before jumping to a conversation round", () => {
    const source = readFileSync(mainContentPath, "utf8");

    expect(source).toMatch(
      /handleSelectConversationTurn[\s\S]*?cancelAnimationFrame\(autoScrollFrameRef\.current\)[\s\S]*?setAutoScroll\(false\)[\s\S]*?behavior:\s*"auto"/,
    );
    expect(source).toContain("stickToBottom: false");
  });

  it("uses relaxed reading rhythm for long-form answers and research updates", () => {
    const styles = readFileSync(mainContentStylesPath, "utf8");

    expect(styles).toMatch(
      /\.chat-message\.assistant-message\.assistant-response-message[\s\S]*?\.chat-bubble-content\.markdown-content,[\s\S]*?\.event-details\.assistant-message\s*>\s*\.markdown-content\s*\{\s*line-height:\s*1\.82;/,
    );
    expect(styles).toMatch(
      /\.chat-message\.assistant-message\.assistant-process-message[\s\S]*?\.chat-bubble-content\.markdown-content\s*\{[^}]*font-size:\s*14px;\s*line-height:\s*1\.72;/,
    );
    expect(styles).toMatch(
      /\.chat-message\.assistant-message\.assistant-process-message[\s\S]*?\.chat-bubble-content\.markdown-content li\s*\{\s*margin-top:\s*6px;\s*margin-bottom:\s*6px;/,
    );
    expect(styles).toMatch(
      /\.event-details\.assistant-message\s*>\s*\.markdown-content[\s\S]*?h1\s*\{[^}]*font-size:\s*20px;[^}]*line-height:\s*1\.4;/,
    );
    expect(styles).toMatch(
      /\.event-details\.assistant-message\s*>\s*\.markdown-content[\s\S]*?h2\s*\{[^}]*font-size:\s*17px;[^}]*line-height:\s*1\.45;/,
    );
    expect(styles).toMatch(
      /\.event-details\.assistant-message\s*>\s*\.markdown-content[\s\S]*?h3\s*\{[^}]*font-size:\s*15px;[^}]*line-height:\s*1\.5;/,
    );
  });

  it("keeps collapsed execution summaries compact in focused density", () => {
    const styles = readFileSync(globalStylesPath, "utf8");

    expect(styles).toMatch(
      /\.density-focused\s+\.conversation-flow\s*\{[^}]*gap:\s*2px;/s,
    );
    expect(styles).toMatch(
      /\.density-focused\s+\.timeline-event\s*\{[^}]*gap:\s*2px;[^}]*padding:\s*0;/s,
    );
    expect(styles).toMatch(
      /\.density-focused\s+\.action-block\.collapsed\s+\.action-block-header\s*\{[^}]*min-height:\s*30px;[^}]*padding-block:\s*0;/s,
    );
  });
});
