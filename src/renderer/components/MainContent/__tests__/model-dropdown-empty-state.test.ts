import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ModelDropdown } from "../ModelDropdown";

describe("ModelDropdown empty configuration", () => {
  it("shows an add-model action instead of a default Claude model", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ModelDropdown, {
        models: [],
        selectedModel: "",
        selectedProvider: "anthropic",
        providers: [
          { type: "anthropic", name: "Claude", configured: false },
        ],
        onModelChange: vi.fn(),
        onOpenSettings: vi.fn(),
      }),
    );

    expect(markup).toContain("添加模型");
    expect(markup).toContain("尚未配置模型");
    expect(markup).not.toContain("Claude");
    expect(markup).not.toContain("Opus");
    expect(markup).not.toContain("anthropic");
  });
});
