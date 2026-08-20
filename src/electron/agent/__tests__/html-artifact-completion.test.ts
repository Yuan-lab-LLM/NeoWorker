import { describe, expect, it } from "vitest";
import { validateStandaloneHtmlArtifact } from "../executor-completion-utils";

describe("validateStandaloneHtmlArtifact", () => {
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
});
