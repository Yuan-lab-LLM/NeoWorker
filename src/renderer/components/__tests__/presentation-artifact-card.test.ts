import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import { PresentationArtifactCard } from "../PresentationArtifactCard";
import { changeLanguage } from "../../i18n";

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe("PresentationArtifactCard", () => {
  beforeEach(async () => {
    await changeLanguage("en");
  });

  it("renders a compact Codex-style presentation output card", () => {
    const markup = render(
      React.createElement(PresentationArtifactCard, {
        filePath: "/workspace/artifacts/sample_deck.pptx",
        workspacePath: "/workspace",
        onOpenViewer: () => {},
      }),
    );

    expect(markup).toContain("presentation-artifact-card");
    expect(markup).toContain("artifact-file-type-icon-powerpoint");
    expect(markup).toContain("sample_deck.pptx");
    expect(markup).toContain("Presentation · PPTX");
    expect(markup).toContain("Open");
    expect(markup).toMatch(/Download|下载/);
    expect(markup).toContain("artifact-download-button");
    expect(markup).toContain("presentation-artifact-menu-btn");
    expect(markup).not.toContain('role="menu"');
  });

  it("labels common PowerPoint-style formats", () => {
    const cases = [
      ["/workspace/legacy.ppt", "Presentation · PPT"],
      ["/workspace/macro.pptm", "Presentation · PPTM"],
      ["/workspace/template.potx", "Presentation · POTX"],
      ["/workspace/show.ppsx", "Presentation · PPSX"],
    ] as const;

    for (const [filePath, label] of cases) {
      const markup = render(
        React.createElement(PresentationArtifactCard, {
          filePath,
          workspacePath: "/workspace",
          onOpenViewer: () => {},
        }),
      );
      expect(markup).toContain(label);
    }
  });
});
