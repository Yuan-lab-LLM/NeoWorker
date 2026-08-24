import { afterEach, describe, expect, it } from "vitest";
import { MCP_METHODS } from "../types";
import { MCPHostServer } from "../host/MCPHostServer";

describe("MCPHostServer resources", () => {
  afterEach(async () => {
    const server = MCPHostServer.getInstance();
    await server.stop();
  });

  it("lists and reads resources from the host provider", async () => {
    const server = MCPHostServer.getInstance();
    server.setToolProvider({
      getTools() {
        return [];
      },
      async executeTool() {
        return {};
      },
      getResources() {
        return [
          {
            uri: "neoworker://tasks",
            name: "Tasks",
            mimeType: "application/json",
          },
        ];
      },
      async readResource(uri: string) {
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify({ ok: true }),
            },
          ],
        };
      },
    });

    const initializeResponse = await (server as Any).processMessage({
      jsonrpc: "2.0",
      id: 1,
      method: MCP_METHODS.INITIALIZE,
      params: { clientInfo: { name: "test" } },
    });
    expect(initializeResponse?.result?.capabilities?.resources?.subscribe).toBe(false);

    await (server as Any).processMessage({
      jsonrpc: "2.0",
      method: MCP_METHODS.INITIALIZED,
    });

    const listResponse = await (server as Any).processMessage({
      jsonrpc: "2.0",
      id: 2,
      method: MCP_METHODS.RESOURCES_LIST,
    });
    expect(listResponse?.result?.resources).toEqual([
      {
        uri: "neoworker://tasks",
        name: "Tasks",
        mimeType: "application/json",
      },
    ]);

    const readResponse = await (server as Any).processMessage({
      jsonrpc: "2.0",
      id: 3,
      method: MCP_METHODS.RESOURCES_READ,
      params: { uri: "neoworker://tasks" },
    });
    expect(readResponse?.result?.contents?.[0]?.text).toContain('"ok":true');
  });

  it("requires a bearer token for HTTP MCP requests", async () => {
    const server = MCPHostServer.getInstance();
    server.setToolProvider({
      getTools() {
        return [];
      },
      async executeTool() {
        return {};
      },
    });

    const { authToken } = await server.startHttp(0);
    const port = server.getHttpPort();
    expect(port).toBeGreaterThan(0);

    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: MCP_METHODS.TOOLS_LIST,
    });

    const unauthenticated = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(unauthenticated.status).toBe(401);

    const authenticated = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${authToken}`,
      },
      body,
    });
    expect(authenticated.status).toBe(200);
    await expect(authenticated.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { tools: [] },
    });
  });
});
