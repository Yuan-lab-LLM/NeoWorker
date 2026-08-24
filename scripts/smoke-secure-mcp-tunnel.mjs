import http from "node:http";
import WebSocket from "ws";
import { startTunnelRelayServer } from "../dist/electron/electron/tunnels/relay.js";

const adminToken = "smoke-admin";
const relay = await startTunnelRelayServer({ port: 0, adminToken });
const relayUrl = `http://127.0.0.1:${relay.port}`;

const mcpServer = http.createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/mcp") {
    res.writeHead(404).end();
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const request = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        tools: [
          {
            name: "demo_read",
            description: "Demo read tool",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      },
    }),
  );
});

await new Promise((resolve) => mcpServer.listen(0, "127.0.0.1", resolve));
const mcpPort = mcpServer.address().port;

try {
  const created = await fetch(`${relayUrl}/v1/tunnels`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ name: "smoke" }),
  }).then((res) => res.json());

  const ws = new WebSocket(
    `ws://127.0.0.1:${relay.port}/v1/tunnels/connect?tunnel_id=${encodeURIComponent(created.id)}`,
    { headers: { authorization: `Bearer ${created.clientToken}` } },
  );

  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });

  ws.on("message", async (data) => {
    const message = JSON.parse(data.toString());
    if (message.type !== "mcp_request") return;
    const response = await fetch(`http://127.0.0.1:${mcpPort}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message.payload),
    }).then((res) => res.json());
    ws.send(
      JSON.stringify({
        type: "mcp_response",
        tunnelId: created.id,
        requestId: message.requestId,
        payload: response,
      }),
    );
  });

  const response = await fetch(`${relayUrl}/v1/tunnels/${encodeURIComponent(created.id)}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${created.callerToken}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  }).then((res) => res.json());

  if (!response.result?.tools?.some((tool) => tool.name === "demo_read")) {
    throw new Error(`Unexpected tunnel response: ${JSON.stringify(response)}`);
  }

  ws.close();
  console.log("Secure MCP tunnel smoke passed");
} finally {
  await relay.close();
  await new Promise((resolve) => mcpServer.close(resolve));
}
