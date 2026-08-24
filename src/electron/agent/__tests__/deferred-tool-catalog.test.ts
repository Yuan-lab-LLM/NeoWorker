import { describe, expect, it } from "vitest";
import { DeferredToolCatalog } from "../runtime/DeferredToolCatalog";

describe("DeferredToolCatalog", () => {
  it("separates visible and deferred tools using runtime metadata", () => {
    const catalog = new DeferredToolCatalog([
      {
        name: "read_file",
        description: "Read file",
        input_schema: { type: "object", properties: {} },
        runtime: {
          readOnly: true,
          concurrencyClass: "read_parallel",
          interruptBehavior: "cancel",
          approvalKind: "none",
          sideEffectLevel: "none",
          deferLoad: false,
          alwaysExpose: true,
          resultKind: "read",
          supportsContextMutation: false,
          capabilityTags: ["core"],
          exposure: "always",
        },
      },
      {
        name: "mcp_linear_search_issues",
        description: "Search issues",
        input_schema: { type: "object", properties: {} },
        runtime: {
          readOnly: true,
          concurrencyClass: "read_parallel",
          interruptBehavior: "cancel",
          approvalKind: "external_service",
          sideEffectLevel: "none",
          deferLoad: true,
          alwaysExpose: false,
          resultKind: "search",
          supportsContextMutation: false,
          capabilityTags: ["integration", "mcp"],
          exposure: "conditional",
        },
      },
    ] as Any[]);

    expect(catalog.getVisibleTools().map((tool) => tool.name)).toEqual(["read_file"]);
    expect(catalog.getDeferredTools().map((tool) => tool.name)).toEqual([
      "mcp_linear_search_issues",
    ]);
  });
});
