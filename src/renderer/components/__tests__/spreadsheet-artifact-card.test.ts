import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import { SpreadsheetArtifactCard } from "../SpreadsheetArtifactCard";
import { changeLanguage } from "../../i18n";

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe("SpreadsheetArtifactCard", () => {
  beforeEach(async () => {
    await changeLanguage("en");
  });

  it("renders a compact Codex-style spreadsheet output card", () => {
    const markup = render(
      React.createElement(SpreadsheetArtifactCard, {
        filePath:
          "/workspace/artifacts/IceCubesApp_recent_open_issues_by_topic_2026-04-16.xlsx",
        workspacePath: "/workspace",
        onOpenViewer: () => {},
      }),
    );

    expect(markup).toContain("spreadsheet-artifact-card");
    expect(markup).toContain("artifact-file-type-icon-excel");
    expect(markup).toContain(
      "IceCubesApp_recent_open_issues_by_topic_2026-04-16.xlsx",
    );
    expect(markup).toContain("Spreadsheet · XLSX");
    expect(markup).toContain("Open");
    expect(markup).toMatch(/Download|下载/);
    expect(markup).toContain("artifact-download-button");
    expect(markup).toContain("spreadsheet-artifact-menu-btn");
    expect(markup).not.toContain('role="menu"');
  });

  it("shows the actual spreadsheet format for delimited and native spreadsheet files", () => {
    const csvMarkup = render(
      React.createElement(SpreadsheetArtifactCard, {
        filePath: "/workspace/artifacts/report.csv",
        workspacePath: "/workspace",
        onOpenViewer: () => {},
      }),
    );
    const numbersMarkup = render(
      React.createElement(SpreadsheetArtifactCard, {
        filePath: "/workspace/artifacts/budget.numbers",
        workspacePath: "/workspace",
        onOpenViewer: () => {},
      }),
    );

    expect(csvMarkup).toContain("Spreadsheet · CSV");
    expect(csvMarkup).toContain("artifact-file-type-icon-spreadsheet");
    expect(numbersMarkup).toContain("Spreadsheet · Numbers");
  });
});
