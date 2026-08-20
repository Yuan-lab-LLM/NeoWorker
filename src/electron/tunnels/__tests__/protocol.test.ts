import { describe, expect, it } from "vitest";
import { enforceTunnelPolicy, getMcpToolName, parseTunnelRelayMessage } from "../protocol";
import { DEFAULT_SECURE_MCP_TUNNEL_POLICY } from "../types";

describe("secure MCP tunnel protocol", () => {
  it("extracts tool names from MCP tool calls", () => {
    expect(
      getMcpToolName({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "read_file", arguments: {} },
      }),
    ).toBe("read_file");
  });

  it("blocks disallowed tools", () => {
    const result = enforceTunnelPolicy(
      { ...DEFAULT_SECURE_MCP_TUNNEL_POLICY, allowedTools: ["read_file"] },
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "delete_file", arguments: {} },
      },
      128,
    );
    expect(result).toMatchObject({ approved: false, toolName: "delete_file" });
  });

  it("blocks write-like tools in read-only mode", () => {
    const result = enforceTunnelPolicy(
      { ...DEFAULT_SECURE_MCP_TUNNEL_POLICY, readOnly: true },
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "write_file", arguments: {} },
      },
      128,
    );
    expect(result).toMatchObject({ approved: false });
  });

  it("rejects malformed relay messages", () => {
    expect(() => parseTunnelRelayMessage(JSON.stringify({ type: "mcp_request" }))).toThrow(
      /tunnelId/,
    );
  });
});
