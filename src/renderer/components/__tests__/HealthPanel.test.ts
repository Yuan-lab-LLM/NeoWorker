import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HealthPanel } from "../HealthPanel";

describe("HealthPanel", () => {
  it("renders the health dashboard shell in compact settings mode", () => {
    const markup = renderToStaticMarkup(
      React.createElement(HealthPanel, {
        compact: true,
        onOpenSettings: () => {},
      }),
    );

    expect(markup).toContain("health-panel");
    expect(markup).toContain("Loading health dashboard");
  });
});
