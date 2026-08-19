import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DocumentArtifactViewer } from "../DocumentArtifactViewer";

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe("DocumentArtifactViewer", () => {
  it("shows the document filename only in the header", () => {
    const markup = render(
      React.createElement(DocumentArtifactViewer, {
        filePath: "/workspace/sample.docx",
        workspacePath: "/workspace",
        mode: "sidebar",
        onClose: () => {},
        onFullscreen: () => {},
        onExitFullscreen: () => {},
      }),
    );

    expect(markup.match(/sample\.docx/g)?.length).toBe(1);
    expect(markup).toContain("全屏打开文档");
    expect(markup).toContain("document-zoom-controls");
    expect(markup).toContain("100%");
    expect(markup).toMatch(/Folder|文件夹/);
    expect(markup).toMatch(/Download|下载/);
  });

  it("keeps the latest update visible when fullscreen turn context is collapsed", () => {
    const markup = render(
      React.createElement(DocumentArtifactViewer, {
        filePath: "/workspace/sample.docx",
        workspacePath: "/workspace",
        mode: "fullscreen",
        onClose: () => {},
        onFullscreen: () => {},
        onExitFullscreen: () => {},
        onSendMessage: async () => {},
        turnContext: {
          statusLabel: "Latest turn",
          summary: "Created the sample document.",
          artifactPath: "/workspace/sample.docx",
          artifactName: "sample.docx",
        },
      }),
    );

    expect(markup).toContain("spreadsheet-viewer-turn-frame collapsed");
    expect(markup).toContain("Latest turn");
    expect(markup).toContain("Created the sample document.");
  });

  it("uses the compact workbench header for PDF files", () => {
    const markup = render(
      React.createElement(DocumentArtifactViewer, {
        filePath: "/workspace/report.pdf",
        workspacePath: "/workspace",
        mode: "sidebar",
        onClose: () => {},
        onFullscreen: () => {},
        onExitFullscreen: () => {},
      }),
    );

    expect(markup).toContain("document-viewer-pdf");
    expect(markup).toContain("document-viewer-tab-meta");
    expect(markup).toContain("PDF");
    expect(markup).toContain("文档缩放控制");
    expect(markup).toMatch(/Folder|文件夹/);
    expect(markup).toMatch(/Download|下载/);
    expect(markup).not.toContain("document-viewer-titlebar");
  });

  it("does not render edit controls before a DOCX preview is loaded", () => {
    const markup = render(
      React.createElement(DocumentArtifactViewer, {
        filePath: "/workspace/sample.rtf",
        workspacePath: "/workspace",
        mode: "sidebar",
        onClose: () => {},
        onFullscreen: () => {},
        onExitFullscreen: () => {},
      }),
    );

    expect(markup).not.toContain(">编辑</button>");
    expect(markup).toContain("复制");
  });
});
