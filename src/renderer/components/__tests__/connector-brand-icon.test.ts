import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectorBrandIcon } from "../ConnectorBrandIcon";

describe("ConnectorBrandIcon", () => {
  it("renders a bundled brand icon without depending on the network", () => {
    const markup = renderToStaticMarkup(
      createElement(ConnectorBrandIcon, {
        connectorKey: "notion",
        name: "Notion",
        className: "cm-card-icon",
      }),
    );

    expect(markup).toContain("<svg");
    expect(markup).not.toContain("google.com/s2/favicons");
    expect(markup).toContain("cm-brand-icon--local");
  });

  it("keeps a visible local fallback while an uncommon remote brand image is pending", () => {
    const markup = renderToStaticMarkup(
      createElement(ConnectorBrandIcon, {
        connectorKey: "tavily",
        name: "Tavily",
      }),
    );

    expect(markup).toContain("<svg");
    expect(markup).toContain("google.com/s2/favicons");
    expect(markup).toContain("cm-brand-icon--fallback");
  });
});
