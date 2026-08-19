import { describe, expect, it } from "vitest";
import {
  getLocalizedMcpServerDescription,
  getMcpDescriptionKey,
} from "../localized-mcp";

describe("localized MCP descriptions", () => {
  it("resolves installed UUID configs by product name", () => {
    expect(
      getMcpDescriptionKey({
        id: "9ae16763-38bd-4026-b78e-bb72094b7d98",
        name: "Figma",
      }),
    ).toBe("figma");
  });

  it("shows Chinese descriptions for the MCP cards reported by users", () => {
    expect(
      getLocalizedMcpServerDescription(
        {
          id: "uuid-like-config-id",
          name: "Figma",
          description: "Figma connector for NeoWorker.",
        },
        "zh-CN",
      ),
    ).toContain("Figma 上下文");
    expect(
      getLocalizedMcpServerDescription(
        {
          id: "tavily",
          name: "Tavily",
          description: "Connect your AI agents to the web.",
        },
        "zh-CN",
      ),
    ).toContain("实时搜索");
  });

  it("uses a Chinese fallback for newly-added services", () => {
    expect(
      getLocalizedMcpServerDescription(
        {
          id: "custom-new-service",
          name: "New Service",
          description: "An English-only backend description.",
        },
        "zh-CN",
      ),
    ).toBe("New Service MCP 服务，可为 NeoWorker 提供外部工具与数据。");
  });

  it("preserves backend copy in English mode", () => {
    expect(
      getLocalizedMcpServerDescription(
        {
          id: "figma",
          name: "Figma",
          description: "Figma connector for NeoWorker.",
        },
        "en",
      ),
    ).toBe("Figma connector for NeoWorker.");
  });
});
