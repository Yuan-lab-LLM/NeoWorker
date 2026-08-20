import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PresentationArtifactViewer } from "../PresentationArtifactViewer";
import { PresentationViewer } from "../PresentationViewer";

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe("PresentationArtifactViewer", () => {
  it("shows the presentation filename only in the header", () => {
    const markup = render(
      React.createElement(PresentationArtifactViewer, {
        filePath: "/workspace/sample.pptx",
        workspacePath: "/workspace",
        mode: "sidebar",
        onClose: () => {},
        onFullscreen: () => {},
        onExitFullscreen: () => {},
      }),
    );

    expect(markup.match(/sample\.pptx/g)?.length).toBe(1);
    expect(markup).toMatch(/Open presentation in full screen|全屏打开演示文稿/);
    expect(markup).toContain("presentation-artifact-viewer-tab-meta");
    expect(markup).not.toContain("presentation-artifact-viewer-titlebar");
  });

  it("keeps the latest update visible when fullscreen turn context is collapsed", () => {
    const markup = render(
      React.createElement(PresentationArtifactViewer, {
        filePath: "/workspace/sample.pptx",
        workspacePath: "/workspace",
        mode: "fullscreen",
        onClose: () => {},
        onFullscreen: () => {},
        onExitFullscreen: () => {},
        onSendMessage: async () => {},
        turnContext: {
          statusLabel: "Latest turn",
          summary: "Created the sample deck.",
          artifactPath: "/workspace/sample.pptx",
          artifactName: "sample.pptx",
        },
      }),
    );

    expect(markup).toContain("spreadsheet-viewer-turn-frame collapsed");
    expect(markup).toContain("Latest turn");
    expect(markup).toContain("Created the sample deck.");
  });

  it("renders review controls before a PPTX preview is loaded", () => {
    const markup = render(
      React.createElement(PresentationArtifactViewer, {
        filePath: "/workspace/sample.pptx",
        workspacePath: "/workspace",
        mode: "sidebar",
        onClose: () => {},
        onFullscreen: () => {},
        onExitFullscreen: () => {},
      }),
    );

    expect(markup).toContain("PPTX");
    expect(markup).toMatch(/Copy|复制/);
    expect(markup).toMatch(/Folder|文件夹/);
    expect(markup).toMatch(/Download|下载/);
  });

  it("renders a dedicated loading preview while slide images are still rendering", () => {
    const markup = render(
      React.createElement(PresentationViewer, {
        fileName: "sample.pptx",
        preview: {
          slideCount: 1,
          renderStatus: "rendering",
          renderMessage: "Rendering slide previews...",
          slides: [{ index: 1, title: "Intro", text: "Opening slide" }],
        },
        onOpenExternal: () => {},
        onShowInFinder: () => {},
      }),
    );

    expect(markup).toMatch(/Rendering previews|正在渲染预览/);
    expect(markup).toMatch(/Preparing slide preview|正在生成幻灯片预览/);
    expect(markup).toContain("presentation-viewer-thumb-placeholder");
    expect(markup).not.toContain("Opening slide");
    expect(markup).toContain("Rendering slide previews...");
  });

  it("uses tokenized image URLs when rendered slide images are available", () => {
    const markup = render(
      React.createElement(PresentationViewer, {
        fileName: "sample.pptx",
        preview: {
          slideCount: 1,
          renderStatus: "rendered",
          slides: [
            {
              index: 1,
              title: "Intro",
              text: "Opening slide",
              imageUrl: "media://local/slide-token",
            },
          ],
        },
        onOpenExternal: () => {},
        onShowInFinder: () => {},
      }),
    );

    expect(markup).toContain("media://local/slide-token");
    expect(markup).toMatch(/1 rendered|已渲染 1 张/);
  });
});
