import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WebArtifactViewer } from "../WebArtifactViewer";

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe("WebArtifactViewer", () => {
  it("shows the web filename only in the header", () => {
    const markup = render(
      React.createElement(WebArtifactViewer, {
        filePath: "/workspace/index.html",
        workspacePath: "/workspace",
        mode: "sidebar",
        onClose: () => {},
        onFullscreen: () => {},
        onExitFullscreen: () => {},
      }),
    );

    expect(markup.match(/index\.html/g)?.length).toBe(1);
    expect(markup).toContain("web-artifact-viewer-header-fullscreen");
  });

  it("keeps the latest update visible when fullscreen turn context is collapsed", () => {
    const markup = render(
      React.createElement(WebArtifactViewer, {
        filePath: "/workspace/index.html",
        workspacePath: "/workspace",
        mode: "fullscreen",
        onClose: () => {},
        onFullscreen: () => {},
        onExitFullscreen: () => {},
        onSendMessage: async () => {},
        turnContext: {
          statusLabel: "Latest turn",
          summary: "Created the page.",
          artifactPath: "/workspace/index.html",
          artifactName: "index.html",
        },
      }),
    );

    expect(markup).toContain("spreadsheet-viewer-turn-frame collapsed");
    expect(markup).toContain("Latest turn");
    expect(markup).toContain("Created the page.");
  });

  it("renders review controls before an HTML preview is loaded", () => {
    const markup = render(
      React.createElement(WebArtifactViewer, {
        filePath: "/workspace/index.html",
        workspacePath: "/workspace",
        mode: "sidebar",
        onClose: () => {},
        onFullscreen: () => {},
        onExitFullscreen: () => {},
      }),
    );

    expect(markup).toContain("HTML");
    expect(markup.match(/web-artifact-viewer-tool-btn/g)?.length).toBe(3);
    expect(markup).toMatch(/Folder|文件夹/);
    expect(markup).toMatch(/Download|下载/);
    expect(markup).toContain("document-zoom-controls");
    expect(markup).toContain("100%");
  });

  it("uses a more readable default zoom in fullscreen mode", () => {
    const markup = render(
      React.createElement(WebArtifactViewer, {
        filePath: "/workspace/index.html",
        workspacePath: "/workspace",
        mode: "fullscreen",
        onClose: () => {},
        onFullscreen: () => {},
        onExitFullscreen: () => {},
      }),
    );

    expect(markup).toContain("115%");
  });
});
