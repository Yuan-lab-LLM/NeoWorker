import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesPath = fileURLToPath(
  new URL("../main-content.css", import.meta.url),
);
const componentPath = fileURLToPath(
  new URL("../MainContent.tsx", import.meta.url),
);
const artworkPath = fileURLToPath(
  new URL("../../../public/neoworker-home-transparent.png", import.meta.url),
);

describe("Welcome layout", () => {
  it("centers the welcome composer within the remaining app height", () => {
    const source = readFileSync(stylesPath, "utf8");
    const welcomeView =
      source.match(/\.welcome-view\s*\{([^}]*)\}/s)?.[1] || "";

    expect(welcomeView).toMatch(/flex:\s*1 1 0;/);
    expect(welcomeView).toMatch(/min-height:\s*0;/);
    expect(welcomeView).toMatch(/align-items:\s*safe center;/);
    expect(welcomeView).toMatch(/justify-content:\s*center;/);
  });

  it("gives the composer more room while keeping the hero artwork and copy close", () => {
    const source = readFileSync(stylesPath, "utf8");

    expect(source).toContain("width: min(780px, 100%);");
    expect(source).toContain("grid-template-columns: minmax(300px, 340px)");
    expect(source).toContain("gap: clamp(12px, 1.2vw, 16px);");
    expect(source).toContain("inset-inline-start: clamp(38px, 4vw, 46px);");
    expect(source).toContain("max-width: 340px;");
    expect(source).toContain("justify-self: end;");
    expect(source).toMatch(
      /\.quick-start-desc\s*\{[^}]*display:\s*-webkit-box;[^}]*-webkit-line-clamp:\s*2;/s,
    );
    expect(source).not.toMatch(/\.quick-start-desc\s*\{[^}]*display:\s*none;/s);
    expect(source).toMatch(
      /> \.welcome-input-container[\s\S]*?\.welcome-input\s*\{[\s\S]*?min-height:\s*54px;/,
    );
  });

  it("keeps the NeoWorker artwork fixed while only the right copy can switch", () => {
    const source = readFileSync(stylesPath, "utf8");
    const component = readFileSync(componentPath, "utf8");
    const artwork = readFileSync(artworkPath);

    expect(component).toMatch(
      /const FOCUSED_WELCOME_ARTWORK = "\.\/neoworker-home-transparent\.png"/,
    );
    expect(component).not.toContain('translate("welcome.workspaceReady"');
    expect(component).not.toMatch(/FOCUSED_WELCOME_SLIDE_INTERVAL_MS/);
    expect(component).toMatch(/FOCUSED_WELCOME_HOVER_DELAY_MS\s*=\s*160/);
    expect(component).toMatch(/FOCUSED_WELCOME_FADE_OUT_MS\s*=\s*140/);
    expect(component).toMatch(/focusedWelcomeCopyIndex/);
    expect(component).toMatch(/onMouseEnter=\{beginFocusedWelcomeCopyHover\}/);
    expect(component).toMatch(/onMouseLeave=\{endFocusedWelcomeCopyHover\}/);
    expect(component).toMatch(/window\.setTimeout\(\(\) => \{/);
    expect(component).toMatch(/transitionFocusedWelcomeCopy/);
    expect(component).toMatch(/isFocusedWelcomeCopySwitching/);
    expect(component).not.toMatch(/focusedWelcomeImageIndex/);
    expect(component).not.toMatch(/transitionFocusedWelcomeImage/);
    expect(component).not.toMatch(/beginFocusedWelcomeImageHover/);
    expect(component).not.toMatch(/isFocusedWelcomeImageSwitching/);
    expect(component).toMatch(/focusedWelcomeTitle/);
    expect(component).toMatch(/focusedWelcomeDescription/);
    expect(component).not.toMatch(/focused-welcome-pager/);
    expect(component).not.toMatch(/focused-welcome-page-dot/);
    expect(component).toMatch(/focused-brand-static/);
    expect(component).not.toMatch(/focused-header-divider/);
    expect(component).toMatch(/focused-greeting-copy-inner/);
    expect(component).not.toMatch(/neoworker-mascot-sprite-v2\.png/);
    expect(component).not.toMatch(/focused-mascot-strip/);
    expect(source).not.toMatch(/@keyframes\s+focused-mascot-sprite/);
    expect(source).not.toMatch(/focused-mascot-shadow-action/);
    expect(source).not.toMatch(/mix-blend-mode:\s*multiply/);
    expect(source).not.toMatch(/\.focused-welcome-page-dot/);
    expect(source).toMatch(/@keyframes\s+focused-welcome-fade-in/);
    expect(source).not.toMatch(/\.focused-brand-lockup\.is-switching/);
    expect(source).toMatch(/\.focused-greeting-copy\.is-switching/);
    expect(source).toMatch(/opacity 140ms ease/);
    expect(source).toMatch(/\.focused-brand-static\s*\{[^}]*width:\s*100%/s);
    expect(source).toMatch(
      /\.focused-brand-static\s*\{[^}]*object-fit:\s*contain/s,
    );
    expect(source).toMatch(
      /\.focused-brand-lockup\s*\{[^}]*background:\s*transparent/s,
    );
    expect(source).toMatch(/\.focused-brand-lockup\s*\{[^}]*border:\s*0/s);
    expect(source).toMatch(
      /\.focused-brand-lockup\s*\{[^}]*border-radius:\s*0/s,
    );
    expect([...artwork.subarray(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(artwork[25]).toBe(6);
    expect(artwork.length).toBeGreaterThan(500_000);
  });

  it("collects and persists a personal profile before model setup", () => {
    const source = readFileSync(stylesPath, "utf8");
    const component = readFileSync(componentPath, "utf8");

    expect(component).toMatch(/function\s+InlineOnboardingCard/);
    expect(component).toMatch(/onboarding\.inline\.stepProfile/);
    expect(component).toMatch(/onboarding\.inline\.nameLabel/);
    expect(component).toMatch(/onboarding\.inline\.workContextLabel/);
    expect(component).toMatch(/savePersonalitySettings/);
    expect(component).toMatch(/addUserFact/);
    expect(component).toMatch(/updateUserFact/);
    expect(component).toMatch(/onProfileSaved=\{agentContext\.refresh\}/);
    expect(source).toMatch(/\.inline-onboarding-card--profile/);
    expect(source).toMatch(/\.inline-onboarding-form/);
  });

  it("uses an opaque surface for command and skill suggestions", () => {
    const source = readFileSync(stylesPath, "utf8");
    const dropdown =
      source.match(/\.slash-autocomplete-dropdown\s*\{([^}]*)\}/s)?.[1] || "";
    const sectionLabel =
      source.match(/\.slash-autocomplete-section-label\s*\{([^}]*)\}/s)?.[1] ||
      "";

    expect(dropdown).toMatch(/background:\s*var\(--color-bg-popover-opaque\);/);
    expect(dropdown).toMatch(/backdrop-filter:\s*none;/);
    expect(sectionLabel).toMatch(
      /background:\s*var\(--color-bg-popover-opaque\);/,
    );
  });

  it("replaces the example hint with a working card refresh action", () => {
    const source = readFileSync(stylesPath, "utf8");
    const component = readFileSync(componentPath, "utf8");

    expect(component).not.toMatch(/welcome\.hint/);
    expect(component).toMatch(/welcome\.changeCardGroup/);
    expect(component).toMatch(/onClick=\{refreshFocusedCards\}/);
    expect(component).toMatch(/<RefreshCw/);
    expect(component).not.toMatch(/FOCUSED_CARD_ROTATION_INTERVAL_MS/);
    expect(component).toMatch(
      /function\s+isOutcomeTemplatesEnabled\(\):\s*boolean\s*{[^}]*return false;/s,
    );
    expect(source).toMatch(/\.welcome-card-refresh\s*\{/);
  });

  it("gives focused quick-start cards a clear visual and action hierarchy", () => {
    const source = readFileSync(stylesPath, "utf8");
    const component = readFileSync(componentPath, "utf8");

    expect(component).toContain('className="quick-start-affordance"');
    expect(source).toMatch(
      /\.welcome-content\.welcome-content-focused[\s\S]*?\.quick-start-card\s*\{[\s\S]*?min-height:\s*94px;/,
    );
    expect(source).toContain(
      "grid-template-columns: 36px minmax(0, 1fr) 16px;",
    );
    expect(source).toContain("border-radius: 12px;");
    expect(source).toContain(".quick-start-affordance");
  });

  it("fills recommendation prompts into the composer without executing them", () => {
    const component = readFileSync(componentPath, "utf8");
    const quickAction =
      component.match(
        /const handleQuickAction = \(action: string\) => \{([\s\S]*?)\n  \};/,
      )?.[1] || "";
    const suggestionHandler =
      component.match(
        /const handleWelcomeTaskSuggestion = \(suggestion: WelcomeTaskSuggestion\) => \{([\s\S]*?)\n  \};/,
      )?.[1] || "";

    expect(quickAction).toMatch(/setInputValue\(action\)/);
    expect(quickAction).toMatch(/promptInputRef\.current\?\.focus\(\)/);
    expect(quickAction).not.toMatch(/onCreateTask/);
    expect(suggestionHandler).toMatch(/handleQuickAction\(prompt\)/);
    expect(suggestionHandler).not.toMatch(/onCreateTask/);
  });

  it("keeps the composer readable while it grows", () => {
    const source = readFileSync(stylesPath, "utf8");
    const composerPath = fileURLToPath(
      new URL("../../PromptComposerInput.tsx", import.meta.url),
    );
    const composer = readFileSync(composerPath, "utf8");

    expect(composer).toMatch(/Math\.min\(root\.scrollHeight, 220\)/);
    expect(source).toMatch(/\.input-textarea\s*\{[^}]*max-height:\s*220px;/s);
  });
});
