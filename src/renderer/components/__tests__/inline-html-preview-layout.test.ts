import { describe, expect, it } from "vitest";

import { isBootstrapHtmlPlaceholder } from "../InlineHtmlPreview";

describe("inline HTML preview layout", () => {
  it("recognizes the provisional bootstrap document", () => {
    expect(
      isBootstrapHtmlPlaceholder(
        '<!doctype html><html><head><title>Draft</title></head><body><p>Bootstrap artifact stub.</p></body></html>',
      ),
    ).toBe(true);
  });

  it("does not collapse a completed document that mentions bootstrap text", () => {
    expect(
      isBootstrapHtmlPlaceholder(
        `<html><body><main><h1>Report</h1><p>Bootstrap artifact stub.</p>${"<section>Content</section>".repeat(80)}</main></body></html>`,
      ),
    ).toBe(false);
  });
});
