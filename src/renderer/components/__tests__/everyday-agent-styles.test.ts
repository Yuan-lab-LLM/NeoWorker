import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesPath = fileURLToPath(
  new URL("../everyday-agent.css", import.meta.url),
);
const panelPath = fileURLToPath(
  new URL("../EverydayAgentPanel.tsx", import.meta.url),
);
const designSystemPath = fileURLToPath(
  new URL("../../styles/neoworker-design-system.css", import.meta.url),
);

describe("Everyday agent typography", () => {
  it("does not animate the entire page when entering the daily assistant", () => {
    const source = readFileSync(stylesPath, "utf8");
    const panelRule =
      source.match(/\.everyday-agent-panel\s*\{([^}]*)\}/s)?.[1] ?? "";

    expect(panelRule).not.toMatch(/\banimation(?:-name)?\s*:/);
  });

  it("uses the app sans-serif stack for the daily focus heading", () => {
    const source = readFileSync(stylesPath, "utf8");

    expect(source).toMatch(
      /\.ea-focus-column\s*>\s*header h2\s*\{[^}]*font-family:\s*var\(--font-google-sans\),\s*"PingFang SC",\s*"Microsoft YaHei",\s*sans-serif;[^}]*font-size:\s*clamp\(30px,\s*2\.7vw,\s*42px\);/s,
    );
    expect(source).not.toMatch(
      /\.ea-focus-column\s*>\s*header h2\s*\{[^}]*Georgia/s,
    );
  });

  it("uses a quiet neutral canvas behind the daily desk", () => {
    const source = readFileSync(stylesPath, "utf8");

    expect(source).toMatch(
      /\.theme-light \.everyday-agent-main\s*\{[^}]*background-color:\s*#f7f8fa;[^}]*background-image:\s*none;/s,
    );
    expect(source).toMatch(
      /\.theme-light \.everyday-agent-main \.ea-daily-desk\s*\{[^}]*border-radius:\s*14px;[^}]*background:\s*#ffffff;/s,
    );
    expect(source).toMatch(
      /\.theme-light \.everyday-agent-main \.ea-daily-rail\s*\{[^}]*background:\s*transparent;/s,
    );
  });

  it("uses an editorial work list and a quiet activity rail", () => {
    const styles = readFileSync(stylesPath, "utf8");
    const panel = readFileSync(panelPath, "utf8");

    expect(panel).not.toContain('className="ea-focus-eyebrow"');
    expect(panel).not.toContain('className="ea-focus-marker"');
    expect(panel).toContain("<ArrowRight size={15}");
    expect(panel).not.toContain("<ReceiptText size={17}");
    expect(styles).toMatch(
      /\.everyday-agent-main \.ea-focus-list\s*\{[^}]*display:\s*block;[^}]*border-top:/s,
    );
    expect(styles).toMatch(
      /\.everyday-agent-main \.ea-focus-row\s*\{[^}]*border:\s*0;[^}]*border-bottom:[^}]*border-radius:\s*0;[^}]*box-shadow:\s*none;/s,
    );
    expect(styles).toMatch(
      /\.everyday-agent-main \.ea-daily-rail\s*\{[^}]*border-left:[^}]*border-radius:\s*0;[^}]*box-shadow:\s*none;/s,
    );
  });

  it("keeps the primary focus action readable in the light visual theme", () => {
    const designSystem = readFileSync(designSystemPath, "utf8");

    expect(designSystem).toMatch(
      /\.theme-light\.visual-oblivion\s+\.everyday-agent-main\s+\.ea-focus-row:not\(:first-child\)\s+button\s*\{[^}]*color:\s*var\(--cw-brand\);/s,
    );
  });

  it("resolves artwork relative to the packaged renderer", () => {
    const panel = readFileSync(panelPath, "utf8");

    expect(panel).toContain("import.meta.env.BASE_URL");
    expect(panel).toMatch(
      /everydayArtworkUrl\(\s*"\/everyday\/daily-assistant-hero\.webp",?\s*\)/,
    );
    expect(panel).toMatch(
      /everydayArtworkUrl\(\s*"\/everyday\/approval-review\.webp",?\s*\)/,
    );
    expect(panel).not.toMatch(/\bsrc="\/everyday\//);
    expect(panel).not.toMatch(/:\s*"\/everyday\//);
  });
});
