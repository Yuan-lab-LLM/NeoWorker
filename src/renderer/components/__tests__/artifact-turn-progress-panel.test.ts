import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ArtifactTurnProgressPanel } from "../ArtifactTurnProgressPanel";

describe("ArtifactTurnProgressPanel", () => {
  it("opens live modification progress in the artifact viewer", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ArtifactTurnProgressPanel, {
        turnContext: {
          status: "working",
          statusLabel: "正在修改 · 12s",
          summary: "正在读取演示文稿并定位第一项",
          artifactPath: "/workspace/sample.pptx",
          artifactName: "sample.pptx",
          events: [
            {
              id: "step-1",
              kind: "step",
              text: "正在读取演示文稿",
              tone: "active",
            },
          ],
        },
      }),
    );

    expect(markup).toContain(
      "spreadsheet-viewer-turn-frame expanded status-working",
    );
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain("正在读取演示文稿并定位第一项");
    expect(markup).toContain("正在读取演示文稿");
  });
});
