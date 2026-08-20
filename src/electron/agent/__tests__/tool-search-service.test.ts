import { describe, expect, it } from "vitest";
import { ToolSearchService } from "../runtime/ToolSearchService";

describe("ToolSearchService", () => {
  it("returns deferred tools that match query tokens", () => {
    const service = new ToolSearchService([
      {
        name: "mcp_linear_search_issues",
        description: "Search Linear issues",
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
      {
        name: "read_file",
        description: "Read local file",
        input_schema: { type: "object", properties: {} },
      },
    ] as Any[]);

    const matches = service.search("linear issues", 5);
    expect(matches[0]?.name).toBe("mcp_linear_search_issues");
  });
});
