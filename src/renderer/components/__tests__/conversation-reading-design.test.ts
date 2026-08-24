import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const readingStylesPath = fileURLToPath(
  new URL("../../styles/conversation-reading.css", import.meta.url),
);
const entryPath = fileURLToPath(new URL("../../main.tsx", import.meta.url));

describe("conversation reading design", () => {
  it("loads the reading layer after the legacy design styles", () => {
    const source = readFileSync(entryPath, "utf8");
    const designSystemImport = source.indexOf(
      'import "./styles/neoworker-design-system.css"',
    );
    const readingImport = source.indexOf(
      'import "./styles/conversation-reading.css"',
    );

    expect(designSystemImport).toBeGreaterThan(-1);
    expect(readingImport).toBeGreaterThan(designSystemImport);
  });

  it("uses a wider transcript and a restrained long-form type scale", () => {
    const styles = readFileSync(readingStylesPath, "utf8");

    expect(styles).toContain("--conversation-content-max: 1200px");
    expect(styles).toContain("--conversation-reading-max: 1080px");
    expect(styles).toMatch(
      /font-size:\s*14px;\s*font-weight:\s*400;\s*line-height:\s*1\.72;/,
    );
    expect(styles).toMatch(/h1\s*\{[\s\S]*?font-size:\s*19px;/);
    expect(styles).toMatch(/h2\s*\{[\s\S]*?font-size:\s*16px;/);
    expect(styles).toMatch(/h3\s*\{[\s\S]*?font-size:\s*14\.5px;/);
  });

  it("keeps unordered-list bullets in a dedicated gutter", () => {
    const styles = readFileSync(readingStylesPath, "utf8");

    expect(styles).toMatch(/:is\(ul, ol\)\s*\{[\s\S]*?padding-left:\s*22px;/);
    expect(styles).toMatch(
      /\.visual-oblivion[\s\S]*?ul\s*\{[\s\S]*?list-style-position:\s*outside;/,
    );
    expect(styles).toMatch(/ul\s*> li::before\s*\{\s*content:\s*none;/);
    expect(styles).toMatch(
      /ul\s*> li::marker\s*\{[\s\S]*?font-size:\s*0\.8em;/,
    );
  });

  it("gives tables and result files a calm, space-efficient layout", () => {
    const styles = readFileSync(readingStylesPath, "utf8");

    expect(styles).toMatch(
      /\.markdown-table-wrapper\s*\{[\s\S]*?border-radius:\s*11px;/,
    );
    expect(styles).toMatch(
      /\.assistant-artifact-cards\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 820px\)[\s\S]*?\.assistant-artifact-cards\s*\{[\s\S]*?grid-template-columns:\s*1fr;/,
    );
  });

  it("centers ordinary long-form reports and their result files", () => {
    const styles = readFileSync(readingStylesPath, "utf8");

    expect(styles).toMatch(
      /\.conversation-flow \.assistant-identity-header\s*\{[\s\S]*?width:\s*100%;[\s\S]*?margin-inline:\s*auto;/,
    );
    expect(styles).toMatch(
      /:is\(\s*\.conversation-flow[\s\S]*?\.event-details\.assistant-message > \.markdown-content\s*\)\s*\{[\s\S]*?max-width:\s*var\(--conversation-reading-max\);[\s\S]*?margin-inline:\s*auto;/,
    );
    expect(styles).toMatch(
      /\.conversation-flow \.assistant-artifact-cards\s*\{[\s\S]*?margin:\s*14px auto 0;/,
    );
  });

  it("keeps assistant identity, prose and execution rows on one reading rail", () => {
    const styles = readFileSync(readingStylesPath, "utf8");

    expect(styles).toMatch(
      /\.density-focused[\s\S]*?\.chat-message\.assistant-message[\s\S]*?\.chat-bubble-content\.markdown-content,[\s\S]*?\.event-details\.assistant-message[\s\S]*?> \.markdown-content\s*\{[\s\S]*?max-width:\s*var\(--conversation-reading-max\);[\s\S]*?margin-inline:\s*auto;/,
    );
    expect(styles).toMatch(
      /\.density-focused \.conversation-flow :is\(\.action-block, \.step-feed-card\)\s*\{[\s\S]*?max-width:\s*var\(--conversation-reading-max\);[\s\S]*?margin-inline:\s*auto;/,
    );
    expect(styles).toMatch(
      /\.density-focused \.conversation-flow \.action-block-summary\s*\{[\s\S]*?flex:\s*0 1 auto;/,
    );
    expect(styles).toMatch(
      /\.density-focused \.conversation-flow \.action-block\.expanded \.action-block-meta\s*\{[\s\S]*?margin-left:\s*0;/,
    );
  });

  it("keeps collaborative execution summaries visually subordinate to reports", () => {
    const styles = readFileSync(readingStylesPath, "utf8");

    expect(styles).toMatch(
      /\.density-focused \.collab-summary-heading\s*\{[\s\S]*?font-size:\s*14px;/,
    );
    expect(styles).toMatch(
      /\.density-focused :is\(\.collab-timeline-spawn, \.collab-timeline-status\)\s*\{[\s\S]*?font-size:\s*12px;[\s\S]*?line-height:\s*1\.42;/,
    );
    expect(styles).toMatch(
      /\.density-focused \.collab-summary-synthesis-content\s*\{[\s\S]*?font-size:\s*13px;/,
    );
  });

  it("centers team-agent reports inside the full detail surface", () => {
    const styles = readFileSync(readingStylesPath, "utf8");

    expect(styles).toMatch(
      /\.spawned-agent-sidebar-transcript \.task-session-shell\s*\{[\s\S]*?align-items:\s*center;/,
    );
    expect(styles).toMatch(
      /\.spawned-agent-sidebar-transcript \.task-content\s*\{[\s\S]*?width:\s*min\(100%, var\(--conversation-content-max\)\);[\s\S]*?margin-inline:\s*auto;/,
    );
  });

  it("uses a compact type scale for team streams and expert detail results", () => {
    const styles = readFileSync(readingStylesPath, "utf8");

    expect(styles).toContain(
      ".collaborative-thoughts-main .thought-content.markdown-content",
    );
    expect(styles).toContain(
      ".spawned-agent-sidebar-transcript\n      .conversation-flow\n      .chat-bubble-content.markdown-content",
    );
    expect(styles).toMatch(/font-size:\s*13\.5px;\s*line-height:\s*1\.64;/);
    expect(styles).toMatch(/h1\s*\{[\s\S]*?font-size:\s*18px;/);
    expect(styles).toMatch(/h2\s*\{[\s\S]*?font-size:\s*15\.5px;/);
    expect(styles).toMatch(/h3\s*\{[\s\S]*?font-size:\s*14px;/);
    expect(styles).toMatch(
      /:is\(table, code\)\s*\{[\s\S]*?font-size:\s*12\.5px;/,
    );
  });
});
