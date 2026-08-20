import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import { DocumentArtifactCard } from "../DocumentArtifactCard";
import { changeLanguage } from "../../i18n";

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe("DocumentArtifactCard", () => {
  beforeEach(async () => {
    await changeLanguage("en");
  });

  it("renders a compact Codex-style document output card", () => {
    const markup = render(
      React.createElement(DocumentArtifactCard, {
        filePath: "/workspace/artifacts/sample_report.docx",
        workspacePath: "/workspace",
        onOpenViewer: () => {},
      }),
    );

    expect(markup).toContain("document-artifact-card");
    expect(markup).toContain("artifact-file-type-icon-word");
    expect(markup).toContain("sample_report.docx");
    expect(markup).toContain("Document · DOCX");
    expect(markup).toContain("Open");
    expect(markup).toMatch(/Download|下载/);
    expect(markup).toContain("artifact-download-button");
    expect(markup).toContain("document-artifact-menu-btn");
    expect(markup).not.toContain('role="menu"');
  });

  it("uses a dedicated red PDF icon instead of the generic document icon", () => {
    const markup = render(
      React.createElement(DocumentArtifactCard, {
        filePath: "/workspace/artifacts/report.pdf",
        workspacePath: "/workspace",
        onOpenViewer: () => {},
      }),
    );

    expect(markup).toContain("artifact-file-type-icon-pdf");
    expect(markup).toContain("Document · PDF");
  });

  it("labels common Word-style formats", () => {
    const cases = [
      ["/workspace/report.doc", "Document · DOC"],
      ["/workspace/notes.rtf", "Document · RTF"],
      ["/workspace/memo.odt", "Document · ODT"],
      ["/workspace/proposal.pages", "Document · Pages"],
      ["/workspace/channels.md", "Document · MD"],
    ] as const;

    for (const [filePath, label] of cases) {
      const markup = render(
        React.createElement(DocumentArtifactCard, {
          filePath,
          workspacePath: "/workspace",
          onOpenViewer: () => {},
        }),
      );
      expect(markup).toContain(label);
    }
  });
});
