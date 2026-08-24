import { describe, expect, it } from "vitest";
import {
  extractHtmlSourceCoverageAnchors,
  getFollowUpIterationLimit,
  isHtmlBrowserVerificationInfrastructureFailure,
  validateStandaloneHtmlArtifact,
} from "../executor-completion-utils";

describe("validateStandaloneHtmlArtifact", () => {
  it("rejects NeoWorker's bootstrap HTML as a completed artifact", () => {
    const result = validateStandaloneHtmlArtifact(
      '<!doctype html><html><head><meta charset="utf-8"><title>Draft</title></head><body><p>Bootstrap artifact stub.</p></body></html>',
      "生成一个 HTML 网页",
    );

    expect(result.valid).toBe(false);
    expect(result.reasons).toContain("contains unresolved staging placeholders");
  });

  it("rejects a closed HTML shell that still contains staging markers", () => {
    const result = validateStandaloneHtmlArtifact(
      `<!doctype html><html><body>
        <section>首屏</section>
        <!-- ##SCRIPTS## -->
      </body></html>`,
      "制作带 JavaScript 动画和按钮的 HTML 网页",
    );

    expect(result.valid).toBe(false);
    expect(result.reasons).toContain("contains unresolved staging placeholders");
    expect(result.reasons).toContain(
      "requests interactive or animated behavior but has no executable script",
    );
  });

  it("rejects a script tag whose body is only a staging marker", () => {
    const result = validateStandaloneHtmlArtifact(
      `<!doctype html><html><body><canvas></canvas>
        <script>//@@JS1@@</script>
      </body></html>`,
      "使用 Three.js 制作 3D 模拟动画",
    );

    expect(result.valid).toBe(false);
    expect(result.metrics.substantiveScriptCount).toBe(0);
  });

  it("rejects the chunked-writing markers used by interrupted HTML generation", () => {
    for (const marker of [
      "/*__MORE__*/",
      "<!--__MORE__-->",
      "<!-- NEOWORKER_APPEND_POINT -->",
    ]) {
      const result = validateStandaloneHtmlArtifact(
        `<!doctype html><html><body><section>content</section><script>const ready = true;</script>${marker}</body></html>`,
        "生成带交互的 HTML 网页",
      );

      expect(result.valid, marker).toBe(false);
      expect(result.reasons, marker).toContain(
        "contains unresolved staging placeholders",
      );
    }
  });

  it("distinguishes browser infrastructure failures from rendered-content failures", () => {
    expect(
      isHtmlBrowserVerificationInfrastructureFailure(
        "Playwright could not launch the system Chrome executable",
      ),
    ).toBe(true);
    expect(
      isHtmlBrowserVerificationInfrastructureFailure(
        "PowerShell browser launch was blocked by permission policy",
      ),
    ).toBe(true);
    expect(
      isHtmlBrowserVerificationInfrastructureFailure(
        "The chart canvas is blank and click interaction throws TypeError",
      ),
    ).toBe(false);
  });

  it("enforces an explicitly requested minimum section count", () => {
    const result = validateStandaloneHtmlArtifact(
      `<!doctype html><html><body>
        <section>一</section><section>二</section>
      </body></html>`,
      "至少包含 20 个内容章节",
    );

    expect(result.valid).toBe(false);
    expect(result.reasons.join(" ")).toContain("requires at least 20");
  });

  it("accepts a complete interactive standalone page", () => {
    const result = validateStandaloneHtmlArtifact(
      `<!doctype html><html><body>
        <section><canvas id="scene"></canvas><button id="play">播放</button></section>
        <script>
          const button = document.querySelector('#play');
          button.addEventListener('click', () => requestAnimationFrame(() => {}));
        </script>
      </body></html>`,
      "生成包含 Canvas 动画和按钮交互的 HTML 页面",
    );

    expect(result.valid).toBe(true);
    expect(result.metrics.substantiveScriptCount).toBe(1);
  });

  it("requires every multi-source date inside a completed section", () => {
    const result = validateStandaloneHtmlArtifact(
      `<!doctype html><html><body>
        <nav>2026/06/13 · 2026/06/26 · 2026/07/05</nav>
        <section>2026/06/13 第一份完整内容</section>
      </body></html>`,
      "生成一个静态 HTML 合集",
      { requiredSourceAnchors: ["20260613", "20260626", "20260705"] },
    );

    expect(result.valid).toBe(false);
    expect(result.reasons.join(" ")).toContain("20260626");
    expect(result.reasons.join(" ")).toContain("20260705");
    expect(result.metrics.coveredSourceAnchorCount).toBe(1);
  });

  it("accepts complete section coverage for every source date", () => {
    const result = validateStandaloneHtmlArtifact(
      `<!doctype html><html><body>
        <section>2026/06/13 第一份</section>
        <section>2026/06/26 第二份</section>
        <section>2026/07/05 第三份</section>
      </body></html>`,
      "生成一个静态 HTML 合集",
      { requiredSourceAnchors: ["20260613", "20260626", "20260705"] },
    );

    expect(result.valid).toBe(true);
    expect(result.metrics.coveredSourceAnchorCount).toBe(3);
  });

  it("extracts coverage dates only from attachment descriptor lines", () => {
    expect(
      extractHtmlSourceCoverageAnchors(`Attached files (relative to workspace):
- 例会-20260613.docx (.neoworker/uploads/例会-20260613.docx)
- 例会-20260626.docx (.neoworker/uploads/例会-20260626.docx)
- 例会-20260705.docx (.neoworker/uploads/例会-20260705.docx)
Extracted content: 计划于 2026/09/01 运行。`),
    ).toEqual(["20260613", "20260626", "20260705"]);
  });

  it("reserves the full loop budget for artifact-producing follow-ups", () => {
    expect(
      getFollowUpIterationLimit({ requiresArtifactEvidence: true }, 8),
    ).toBe(8);
    expect(
      getFollowUpIterationLimit({ requiresArtifactEvidence: false }, 8),
    ).toBe(4);
  });
});
