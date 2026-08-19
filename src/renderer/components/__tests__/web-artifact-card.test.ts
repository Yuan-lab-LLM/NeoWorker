import React from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import { WebArtifactCard } from "../WebArtifactCard";
import { changeLanguage } from "../../i18n";

const styles = readFileSync(
  fileURLToPath(new URL("../MainContent/main-content.css", import.meta.url)),
  "utf8",
);

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe("WebArtifactCard", () => {
  beforeEach(async () => {
    await changeLanguage("en");
  });

  it("renders a compact Codex-style web page output card", () => {
    const markup = render(
      React.createElement(WebArtifactCard, {
        filePath: "/workspace/artifacts/index.html",
        workspacePath: "/workspace",
        onOpenViewer: () => {},
      }),
    );

    expect(markup).toContain("web-artifact-card");
    expect(markup).toContain("index.html");
    expect(markup).toContain("Web page · HTML");
    expect(markup).toContain("Open");
    expect(markup).toMatch(/Download|下载/);
    expect(markup).toContain("artifact-download-button");
    expect(markup).toContain("web-artifact-menu-btn");
    expect(markup).not.toContain('role="menu"');
  });

  it("labels htm outputs", () => {
    const markup = render(
      React.createElement(WebArtifactCard, {
        filePath: "/workspace/output.htm",
        workspacePath: "/workspace",
        onOpenViewer: () => {},
      }),
    );

    expect(markup).toContain("Web page · HTM");
  });

  it("keeps the filename and localized metadata clear of clipping", () => {
    const fileRule = styles.match(/\.web-artifact-file\s*\{[^}]*\}/)?.[0] || "";
    const nameRule = styles.match(/\.web-artifact-name\s*\{[^}]*\}/)?.[0] || "";

    expect(fileRule).toContain("width: 100%");
    expect(fileRule).toContain("padding: 1px 0 2px 2px");
    expect(nameRule).toContain("line-height: 1.35");
    expect(styles).toMatch(/\.web-artifact-meta\s*\{[^}]*line-height: 1\.4/);
  });

  it("uses a quiet primary and secondary action hierarchy", () => {
    const start = styles.indexOf(
      "/* Artifact actions use a quiet primary/secondary hierarchy",
    );
    const end = styles.indexOf(".artifact-download-button-spinner", start);
    const actionStyles = styles.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(actionStyles).toMatch(
      /\.web-artifact-actions\s*\{[\s\S]*?gap: 4px;[\s\S]*?border: 0;/,
    );
    expect(actionStyles).toMatch(
      /\.web-artifact-open\s*\{[\s\S]*?border-radius: 8px;[\s\S]*?var\(--color-accent/,
    );
    expect(actionStyles).toMatch(
      /\.web-artifact-actions > \.artifact-download-button\s*\{[\s\S]*?border: 0;[\s\S]*?background: transparent;/,
    );
  });
});
