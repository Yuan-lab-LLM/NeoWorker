import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentPath = fileURLToPath(
  new URL("../GuardrailSettings.tsx", import.meta.url),
);
const stylesPath = fileURLToPath(
  new URL("../guardrail-settings.css", import.meta.url),
);

describe("Guardrail settings design", () => {
  it("gives the Token budget a clear primary hierarchy", () => {
    const component = readFileSync(componentPath, "utf8");

    expect(component).toContain(
      'className="guardrail-settings guardrail-budget-panel"',
    );
    expect(component).toContain(
      'className="settings-section guardrail-budget-primary"',
    );
    expect(component.match(/guardrail-limit-card/g)).toHaveLength(4);
  });

  it("offers an explicit unlimited mode instead of requiring an oversized number", () => {
    const component = readFileSync(componentPath, "utf8");

    expect(component).toContain('className="guardrail-budget-mode"');
    expect(component).toContain('"guardrail.tokenBudget.unlimited"');
    expect(component).toContain("tokenBudgetEnabled: false");
    expect(component).toContain("MAX_TOKENS_PER_TASK");
    expect(component).toContain('className="guardrail-budget-unlimited-note"');
    expect(component).toContain('"guardrail.iterationLimit.unlimitedActive"');
    expect(component).toContain('"guardrail.iterationLimit.unlimitedHint"');
    expect(component).toContain('"guardrail.fileSize.unlimitedActive"');
    expect(component).toContain('"guardrail.fileSize.unlimitedHint"');
  });

  it("uses one primary card, a two-column secondary grid, and a mobile fallback", () => {
    const styles = readFileSync(stylesPath, "utf8");

    expect(styles).toMatch(
      /\.guardrail-budget-panel\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s,
    );
    expect(styles).toMatch(
      /\.guardrail-budget-panel\s*>\s*\.guardrail-budget-primary\s*\{[^}]*border-color:\s*#d8e6f8;[^}]*linear-gradient/s,
    );
    expect(styles).toMatch(
      /@media \(max-width: 720px\)\s*\{[\s\S]*?\.guardrail-budget-panel\s*\{[^}]*grid-template-columns:\s*1fr;/,
    );
  });
});
