import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectorService, type MCPClientLike } from "../ConnectorService";

describe("ConnectorService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.GITHUB_TOKEN;
    delete process.env.NOTION_TOKEN;
  });

  it("prefers the direct GitHub API path before MCP", async () => {
    process.env.GITHUB_TOKEN = "gh_token";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        encoding: "base64",
        content: Buffer.from("hello").toString("base64"),
      }),
    } as Response);
    const mcpClient: MCPClientLike = {
      isServerConnected: vi.fn().mockReturnValue(true),
      callTool: vi.fn(),
    };

    const service = new ConnectorService(mcpClient);
    const result = await service.githubFetchFile({ repo: "owner/repo", path: "README.md" });

    expect(result).toEqual({ success: true, data: "hello", source: "direct" });
    expect(mcpClient.callTool).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to GitHub MCP when the direct path is unavailable", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const mcpClient: MCPClientLike = {
      isServerConnected: vi.fn().mockReturnValue(true),
      callTool: vi.fn().mockResolvedValue("mcp-content"),
    };

    const service = new ConnectorService(mcpClient);
    const result = await service.githubFetchFile({ repo: "owner/repo", path: "README.md" });

    expect(result).toEqual({ success: true, data: "mcp-content", source: "mcp" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mcpClient.callTool).toHaveBeenCalledWith("github", "get_file_contents", {
      owner: "owner",
      repo: "repo",
      path: "README.md",
    });
  });

  it("prefers the direct Notion API path before MCP", async () => {
    process.env.NOTION_TOKEN = "notion_token";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    } as Response);
    const mcpClient: MCPClientLike = {
      isServerConnected: vi.fn().mockReturnValue(true),
      callTool: vi.fn(),
    };

    const service = new ConnectorService(mcpClient);
    const result = await service.notionQuery({ databaseId: "db_123" });

    expect(result).toEqual({ success: true, data: { results: [] }, source: "direct" });
    expect(mcpClient.callTool).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to Notion MCP when the direct path is unavailable", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const mcpClient: MCPClientLike = {
      isServerConnected: vi.fn().mockReturnValue(true),
      callTool: vi.fn().mockResolvedValue({ results: ["mcp"] }),
    };

    const service = new ConnectorService(mcpClient);
    const result = await service.notionQuery({ databaseId: "db_123" });

    expect(result).toEqual({ success: true, data: { results: ["mcp"] }, source: "mcp" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mcpClient.callTool).toHaveBeenCalledWith("notion", "query_database", {
      database_id: "db_123",
    });
  });
});
