import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("../CapabilityCenter.tsx", import.meta.url)),
  "utf8",
);
const styles = readFileSync(
  fileURLToPath(new URL("../capability-center.css", import.meta.url)),
  "utf8",
);
const appSource = readFileSync(
  fileURLToPath(new URL("../../App.tsx", import.meta.url)),
  "utf8",
);
const mcpSettingsSource = readFileSync(
  fileURLToPath(new URL("../MCPSettings.tsx", import.meta.url)),
  "utf8",
);

describe("Capability Center information architecture", () => {
  it("keeps tools in the capability center and moves experts into the team area", () => {
    expect(source).toContain(
      'type CapabilityTab = "experts" | "skills" | "bundles" | "connectors" | "mcp"',
    );
    expect(source).toContain(
      'const TOOL_CAPABILITY_TABS: CapabilityTab[] = ["skills", "bundles", "connectors", "mcp"]',
    );
    expect(source).toContain(
      'type CapabilityCenterMode = "tools" | "teamExperts"',
    );
    expect(source).toContain(
      'title={isTeamExpertLibrary ? "专家库" : "工具与技能"}',
    );
    expect(source).toContain("{TOOL_CAPABILITY_TABS.map((tab) => {");
    expect(source).not.toContain(
      "(Object.keys(tabCopy) as CapabilityTab[]).map",
    );
    expect(source).toContain('label: "技能"');
    expect(source).toContain('label: "能力组合"');
    expect(source).toContain('label: "连接器"');
    expect(source).toContain('label: "MCP"');
  });

  it("opens MCP management inside the capability center", () => {
    expect(source).toContain(
      'activeTab === "connectors" || activeTab === "mcp"',
    );
    expect(source).toContain("<MCPSettings />");
    expect(source).toContain('title: "查看 MCP 服务与可用工具"');
  });

  it("uses one shared page frame for tools and the nested expert library", () => {
    expect(source).toContain("const capabilityIntroCopy: Record<CapabilityTab");
    expect(source).toContain(
      "<CapabilityPageIntro tab={activeTab} metrics={introMetrics[activeTab]} />",
    );
    expect(source).not.toContain('className="connector-discovery-hero"');
    expect(source).not.toContain('className="capability-bundle-hero"');
    expect(source).not.toContain('className="skill-scene-search"');
    expect(source).not.toContain("/capability/connectors-hero-3d.webp");
    expect(styles).toMatch(
      /\.capability-page-intro\s*\{[^}]*min-height:\s*124px;[^}]*border-radius:\s*14px;/s,
    );
  });

  it("keeps core capability descriptions at the body-text size floor", () => {
    expect(styles).toContain(".capability-center-page p");
    expect(styles).toContain("font-size: max(14px, 1em)");
  });

  it("keeps every capability detail drawer below the app title bar", () => {
    expect(styles).toMatch(
      /\.skill-detail-layer\s*\{[^}]*inset:\s*var\(--title-bar-height\) 0 0;[^}]*z-index:\s*1200;/s,
    );
    expect(styles).toMatch(
      /\.capability-bundle-detail-layer\s*\{[^}]*inset:\s*var\(--title-bar-height\) 0 0;/s,
    );
  });

  it("provides a bilingual control for every shared skill detail drawer", () => {
    expect(source).toContain('className="skill-detail-language-switch"');
    expect(source).toContain('onLanguageChange("zh-CN")');
    expect(source).toContain('onLanguageChange("en")');
    expect(source).toContain("getLocalizedSkillRoutingText(");
    expect(styles).toContain(".skill-detail-language-switch button.is-active");
  });

  it("keeps the primary tabs in normal flow so section headings cannot be covered", () => {
    expect(styles).toMatch(
      /\.capability-center-tabs\s*\{[^}]*position:\s*relative;[^}]*top:\s*auto;/s,
    );
    expect(styles).not.toMatch(
      /\.capability-center-tabs\s*\{[^}]*position:\s*(?:sticky|absolute|fixed);/s,
    );
  });

  it("uses one focus ring for composite search fields", () => {
    expect(styles).toMatch(
      /\.capability-center-page \.skill-scene-search input:focus-visible,[\s\S]*?\.capability-center-page \.capability-center-search input:focus-visible\s*\{[^}]*outline:\s*none;/,
    );
    expect(source).not.toContain("<kbd>/</kbd>");
  });

  it("uses a stable two-column scene catalog with consistent, readable previews", () => {
    expect(source).toContain("const visibleSceneSkills = skills.slice(0, 3)");
    expect(source).not.toMatch(/image:\s*"\/(?:capability|ideas)\//);
    expect(source).toContain("onError={() => setFailed(true)}");
    expect(source).toContain(
      "className={`skill-scene-artwork-fallback is-${variant}`}",
    );
    expect(styles).toMatch(
      /\.skill-scene-bento\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);[^}]*grid-auto-rows:\s*minmax\(366px, auto\);/s,
    );
    expect(styles).toContain("font-size: 13.5px;");
    expect(styles).toContain("font-size: 13px;");
    expect(styles).not.toMatch(
      /\.skill-scene-card\.is-research\s*\{[^}]*grid-row:\s*span 2;/s,
    );
  });

  it("gives every skill one scene and changes catalog categories with that scene", () => {
    expect(source).toContain("classifySkillScene(");
    expect(source).toContain(") === scene.id");
    expect(source).toContain("dedupeSkillsByDisplayName(skills)");
    expect(source).toContain("selectedSkillScene?.catalogCategories");
    expect(source).toContain("activeCatalogCategories.map((category)");
  });

  it("opens capability bundles as editable drafts instead of submitting them", () => {
    expect(source).toContain("onUseBundle?: (selection:");
    expect(source).toContain("[请描述要解决的问题或希望达到的结果]");
    expect(source).toContain("[请添加背景、文件、链接、适用范围或时间范围]");
    expect(source).toContain("[请说明输出格式、重点、语言、篇幅和截止时间]");
    expect(source).toContain("填写任务要求");
    expect(source).not.toContain(
      "await onCreateExpertTask(`${text.name}：新任务`, prompt)",
    );
    expect(
      appSource.match(/onUseBundle=\{async \(selection\) =>/g),
    ).toHaveLength(2);
    expect(appSource).toContain(
      "await handleOpenComposerDraft(selection.prompt)",
    );
  });

  it("keeps capability bundles inside the shared introduction instead of adding another hero", () => {
    const bundleLibrarySource = source.slice(
      source.indexOf("function CapabilityBundleLibrary"),
      source.indexOf("function CapabilityBundleCard"),
    );

    expect(bundleLibrarySource).not.toContain(
      'className="capability-bundle-visual"',
    );
    expect(bundleLibrarySource).not.toContain(
      'className="capability-bundle-hero"',
    );
    expect(bundleLibrarySource).not.toContain(
      "/capability/experts-hero-3d.webp",
    );
    expect(styles).not.toContain(".capability-bundle-visual-center");
  });

  it("keeps capability bundle cards neutral and uses one semantic icon system", () => {
    expect(source).toContain(
      "function getCapabilityBundleIcon(bundle: CapabilityBundle)",
    );
    expect(source).toContain("const Icon = getCapabilityBundleIcon(bundle)");
    expect(source).not.toContain(
      'const tones = ["blue", "violet", "teal", "amber", "rose"]',
    );
    expect(styles).toContain("background: #ffffff");
    expect(styles).not.toContain(".capability-bundle-card.is-violet");
    expect(styles).not.toContain('content: "✦"');
  });

  it("never decorates capability cards with colored edge stripes", () => {
    expect(styles).toMatch(
      /\.skill-card::after,[\s\S]*?\.connector-card::after\s*\{[^}]*display:\s*none;/,
    );
    expect(styles).toMatch(
      /\.polished-skill-card::before\s*\{[^}]*display:\s*none;/,
    );
    expect(styles).toMatch(
      /\.skill-workspace-feature-stage \.polished-skill-card::before\s*\{[^}]*display:\s*none;/,
    );
    expect(styles).toMatch(/\.expert-card::before\s*\{[^}]*display:\s*none;/);
    expect(styles).toMatch(
      /\.expert-card\.is-selected\s*\{[^}]*border-color:[^}]*background:/s,
    );
  });

  it("uses restrained neutral MCP cards instead of the legacy gray-purple surface", () => {
    expect(styles).toContain(
      ".capability-manager-content.is-connectors .mcp-server-card",
    );
    expect(styles).toContain("border: 1px solid #e3e8ef");
    expect(styles).toContain("background: #ffffff");
    expect(styles).toContain(
      ".capability-manager-content.is-connectors .mcp-server-actions .button-danger",
    );
    expect(styles).toContain(
      ".capability-manager-content.is-connectors .registry-server-card",
    );
    expect(styles).toContain(
      ".capability-manager-content.is-connectors .registry-filters",
    );
    expect(styles).toContain("background: #f8fafc");
    expect(styles).toContain(
      ".capability-manager-content.is-connectors .mcp-tunnel-form-grid",
    );
    expect(styles).toContain(
      ".capability-manager-content.is-connectors .settings-input",
    );
    expect(mcpSettingsSource).toContain(
      'className="mcp-add-form mcp-tunnel-form"',
    );
    expect(mcpSettingsSource).toContain('className="mcp-tunnel-form-grid"');
    expect(mcpSettingsSource).toContain(
      'className="settings-section mcp-view-section mcp-config-section"',
    );
    expect(mcpSettingsSource).toContain('className="mcp-config-form-grid"');
    expect(styles).toContain(
      ".capability-manager-content.is-connectors .mcp-config-panel",
    );
    expect(styles).toContain(
      ".capability-manager-content.is-connectors .mcp-config-form-grid",
    );
  });

  it("keeps embedded custom-skill filters readable instead of squeezing them into narrow columns", () => {
    expect(styles).toMatch(
      /\.capability-manager-content \.skills-category-filter\s*\{[^}]*flex-wrap:\s*wrap;[^}]*overflow:\s*visible;/s,
    );
    expect(styles).toMatch(
      /\.capability-manager-content \.skills-category-filter-item\s*\{[^}]*min-width:\s*max-content;[^}]*flex:\s*0 0 auto;[^}]*white-space:\s*nowrap;[^}]*word-break:\s*keep-all;/s,
    );
    expect(styles).toMatch(
      /\.capability-manager-content \.skills-directory-actions\s*\{[^}]*grid-template-columns:\s*minmax\(280px, 1fr\) auto;/s,
    );
  });
});
