import { describe, expect, it } from "vitest";

import { resolveDisclosureExpanded } from "../disclosure-state";

describe("resolveDisclosureExpanded", () => {
  it("keeps forced disclosures expanded", () => {
    expect(
      resolveDisclosureExpanded({
        forceExpanded: true,
        defaultExpanded: false,
        toggled: true,
      }),
    ).toBe(true);
  });

  it("opens default-expanded disclosures until toggled closed", () => {
    expect(
      resolveDisclosureExpanded({
        defaultExpanded: true,
        toggled: false,
      }),
    ).toBe(true);

    expect(
      resolveDisclosureExpanded({
        defaultExpanded: true,
        toggled: true,
      }),
    ).toBe(false);
  });

  it("keeps collapsed disclosures closed until toggled open", () => {
    expect(
      resolveDisclosureExpanded({
        defaultExpanded: false,
        toggled: false,
      }),
    ).toBe(false);

    expect(
      resolveDisclosureExpanded({
        defaultExpanded: false,
        toggled: true,
      }),
    ).toBe(true);
  });
});
