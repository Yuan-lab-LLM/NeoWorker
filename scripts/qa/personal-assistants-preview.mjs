// UI-only fixture: real app/components, isolated browser storage, no LLM or user database.
import { createServer } from "vite";
import path from "node:path";
const root = process.cwd();
const server = await createServer({
  configFile: path.join(root, "config/vite.config.ts"),
  server: { port: 4327, host: "127.0.0.1", strictPort: true },
  plugins: [
    {
      name: "personal-assistant-fixture",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url?.split("?")[0] !== "/__assistants-preview") return next();
          res.setHeader("Content-Type", "text/html");
          res.end(
            await server.transformIndexHtml(
              req.url,
              `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NeoWorker 我的助手 · 交互预览</title></head><body><div id="root"></div><script type="module" src="/@fs/${root}/scripts/qa/fixtures/personal-assistants-preview.tsx"></script></body></html>`,
            ),
          );
        });
      },
    },
  ],
});
await server.listen();
console.log(
  "Assistant UI preview: http://127.0.0.1:4327/__assistants-preview (fixtures only; no live model)",
);
