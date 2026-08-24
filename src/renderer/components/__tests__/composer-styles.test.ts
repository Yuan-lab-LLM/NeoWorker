import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesPath = fileURLToPath(
  new URL("../../styles/index.css", import.meta.url),
);
const mainContentStylesPath = fileURLToPath(
  new URL("../MainContent/main-content.css", import.meta.url),
);

describe("Composer styles", () => {
  it("does not reserve input-row space for an empty workspace dropdown anchor", () => {
    const source = [
      readFileSync(stylesPath, "utf8"),
      readFileSync(mainContentStylesPath, "utf8"),
    ].join("\n");

    expect(source).toMatch(
      /\.input-row\s*>\s*\.workspace-dropdown-container:empty\s*\{[^}]*display:\s*none;/s,
    );
  });

  it("keeps the focused attachment button close to the prompt placeholder", () => {
    const source = readFileSync(stylesPath, "utf8");

    expect(source).toMatch(
      /\.density-focused\s+\.input-row\s*>\s*\.attachment-btn-left\s*\{[^}]*margin-right:\s*-2px;/s,
    );
  });

  it("keeps attached filenames at regular body weight", () => {
    const source = readFileSync(mainContentStylesPath, "utf8");

    expect(source).toMatch(
      /\.composer-attachment-chip\s+\.attachment-name\s*\{[^}]*font-weight:\s*400;/s,
    );
  });

  it("aligns rich links to the surrounding prompt text baseline", () => {
    const source = readFileSync(mainContentStylesPath, "utf8");

    expect(source).toMatch(
      /\.composer-link-chip\s*\{[^}]*align-items:\s*baseline;[^}]*font:\s*inherit;[^}]*line-height:\s*inherit;[^}]*vertical-align:\s*baseline;/s,
    );
    expect(source).toMatch(
      /\.composer-link-favicon\s*\{[^}]*align-self:\s*center;/s,
    );
  });

  it("keeps focused composer action buttons compact", () => {
    const source = readFileSync(stylesPath, "utf8");

    expect(source).toMatch(
      /\.density-focused\s+\.input-actions\s*\{[^}]*gap:\s*6px;/s,
    );
    expect(source).toMatch(
      /\.density-focused\s+\.input-status-text\s*\{[^}]*margin-top:\s*-1px;/s,
    );
  });

  it("keeps the mention picker readable and compact", () => {
    const source = readFileSync(mainContentStylesPath, "utf8");

    expect(source).toMatch(
      /\.mention-autocomplete-dropdown\s*\{[^}]*--mention-option-row-height:\s*50px;/s,
    );
    expect(source).toMatch(
      /\.mention-autocomplete-item\s*\{[^}]*align-items:\s*center;[^}]*padding:\s*4px 8px;[^}]*font-size:\s*15px;/s,
    );
    expect(source).toMatch(
      /\.mention-autocomplete-desc\s*\{[^}]*font-size:\s*13px;[^}]*line-height:\s*17px;/s,
    );
    expect(source).toMatch(
      /\.mention-autocomplete-section\s*\{[^}]*border:\s*1px solid var\(--color-border-subtle\);[^}]*border-radius:\s*10px;/s,
    );
    expect(source).toMatch(
      /\.mention-autocomplete-section\s*\+\s*\.mention-autocomplete-section\s*\{[^}]*margin-top:\s*8px;/s,
    );
    expect(source).toMatch(
      /\.mention-autocomplete-section-label\s*\{[^}]*justify-content:\s*space-between;[^}]*background:\s*var\(--color-bg-secondary\);[^}]*border-bottom:\s*1px solid var\(--color-border-subtle\);/s,
    );
  });

  it("renders the mention picker as exactly two populated groups", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../MainContent/MainContent.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).toContain('translate("mentions.agents", "Agents")');
    expect(source).toContain('translate("mentions.integrations", "Integrations")');
    expect(source).not.toContain('translate("mentions.files", "Files")');
    expect(source).toContain("mention-autocomplete-section-count");
  });

  it("uses agent portraits in the mention picker and preserves icon fallback", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../MainContent/MainContent.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).toContain("getAgentRoleVisual(role)");
    expect(source).toContain('roleVisual.kind === "portrait" ? roleVisual.src : undefined');
    expect(source).toContain('className="mention-autocomplete-icon mention-autocomplete-agent-avatar"');
    expect(source).toContain('option.icon || "👥"');
    expect(source).toContain("getLocalizedAgentRoleText(role, language)");
  });

  it("uses the home composer visual language for active sessions", () => {
    const source = readFileSync(stylesPath, "utf8");

    expect(source).toMatch(
      /\.session-composer\.input-container\s*\{[^}]*border-radius:\s*16px;[^}]*box-shadow:\s*none;/s,
    );
    expect(source).toMatch(
      /\.session-composer\.input-container\s*>\s*\.input-row\s*\{[^}]*"editor editor"[^}]*"attach actions";/s,
    );
    expect(source).toMatch(
      /\.density-focused\s+\.session-composer\.input-container\s*>\s*\.input-below-actions\s*\{[^}]*display:\s*none;/s,
    );
    expect(source).toMatch(
      /\.session-composer\s*\+\s*\.input-status-text\.session-input-status\s*\{[^}]*top:\s*0;[^}]*width:\s*min\(100%, 800px\);[^}]*min-height:\s*34px;[^}]*margin:\s*5px auto 0;[^}]*border:\s*0;[^}]*background:\s*transparent;/s,
    );
    expect(source).toMatch(
      /\.session-composer\.input-container\s+\.model-label-subtle\s+\.model-label-icon\s*\{[^}]*display:\s*block;/s,
    );
    expect(source).toMatch(
      /\.session-composer\.input-container\s+\.permission-access-btn\.full\s*\{[^}]*color:\s*var\(--color-warning\);[^}]*background:\s*color-mix\(in srgb, var\(--color-warning\) 7%, transparent\);/s,
    );
    expect(source).toMatch(
      /@container\s*\(max-width:\s*560px\)\s*\{[\s\S]*?\.session-composer\.input-container \.model-label-subtle \.model-label-text,[\s\S]*?display:\s*none;/s,
    );
  });

  it("renders the shared skills entry in the active-session utility row", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../MainContent/MainContent.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).toMatch(
      /className="input-status-text welcome-input-status session-input-status"[\s\S]*?className=\{`input-status-skills \$\{showSkillsMenu \? "active" : ""\}`\}/,
    );
  });

  it("keeps the utility rail below the composer as an unframed row", () => {
    const source = readFileSync(mainContentStylesPath, "utf8");

    expect(source).toMatch(
      /\.input-status-text\s*\{[^}]*top:\s*0;[^}]*z-index:\s*3;[^}]*min-height:\s*36px;[^}]*margin:\s*-1px auto 0;[^}]*padding:\s*5px 10px;/s,
    );
    expect(source).toMatch(
      /\.welcome-input-status\s*\{[^}]*margin:\s*5px 0 0;[^}]*padding:\s*0 8px;[^}]*border:\s*0;[^}]*background:\s*transparent;/s,
    );
    expect(source).toMatch(
      /\.input-status-workspace\s*\{[^}]*min-height:\s*26px;[^}]*font-size:\s*12px;/s,
    );
  });

  it("uses a compact labeled control for stopping an active task", () => {
    const source = readFileSync(mainContentStylesPath, "utf8");
    const stopControlStyles = source.match(
      /\/\* Running task control:[\s\S]*?\/\* Wrap-up \+ stop button container \*\//,
    )?.[0];

    expect(stopControlStyles).toBeDefined();
    expect(stopControlStyles).toContain("min-width: 64px");
    expect(stopControlStyles).toContain("border-radius: 9px");
    expect(stopControlStyles).toContain("var(--color-text-primary)");
    expect(stopControlStyles).toContain("var(--color-danger, #d14343)");
    expect(stopControlStyles).not.toMatch(/conic-gradient|stop-btn-orbit|stop-btn-breathe/);
  });

  it("keeps recent-folder typography aligned with the compact composer", () => {
    const source = readFileSync(mainContentStylesPath, "utf8");

    expect(source).toMatch(
      /\.workspace-item-name\s*\{[^}]*font-size:\s*12\.5px;/s,
    );
    expect(source).toMatch(
      /\.workspace-item-path\s*\{[^}]*font-size:\s*10\.5px;/s,
    );
    expect(source).toMatch(
      /\.workspace-dropdown-item\.new-folder\s*\{[^}]*min-height:\s*38px;[^}]*font-size:\s*12px;/s,
    );
  });

  it("keeps full access visually distinct after shared composer color rules", () => {
    const source = readFileSync(mainContentStylesPath, "utf8");

    expect(source).toMatch(
      /\.welcome-input-container\.cli-input-container\s+\.permission-access-btn\.full::before\s*\{[^}]*inset:\s*3px 0;[^}]*background:\s*color-mix\(in srgb, var\(--color-warning\) 7%, transparent\);/s,
    );
    expect(source).toMatch(
      /\.permission-access-btn\.full\[aria-expanded="true"\]::before\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--color-warning\) 11%, transparent\);/s,
    );
  });

  it("activates the send affordance from the editor DOM before React catches up", () => {
    const source = readFileSync(mainContentStylesPath, "utf8");

    expect(source).toContain(
      ':has(.prompt-composer-input[data-has-draft="true"])',
    );
    expect(source).toMatch(
      /data-has-draft="true"[\s\S]*?\.lets-go-btn\.composer-send-empty:not\(:disabled\)[\s\S]*?cursor:\s*pointer;[\s\S]*?background:\s*var\(--color-primary\);/,
    );
  });
});
