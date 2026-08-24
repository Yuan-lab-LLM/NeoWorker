# Node-Only Daemon

Goal: run NeoWorker on Linux servers (VPS/headless) as a Node.js daemon with no desktop window and no Xvfb.

This is an alternative to the Linux “headless Electron” mode. It’s designed for:

- packaged Linux server releases
- VPS/systemd installs
- headless Docker installs
- a CLI/web-dashboard driven workflow (no desktop UI required)

Important naming detail: “Node-only” describes the process entrypoint (`node bin/neoworkerd-node.js`) and the absence of a desktop UI/Xvfb. The packaged server tarball can still include the `electron` npm package as a compatibility dependency while shared runtime helpers are being decoupled; users do not launch Electron from this package.

## What It Runs

The Node daemon (`neoworkerd-node`) wires up:

- SQLite database + secure settings storage
- provider factories (LLM/search) + env import (optional)
- agent daemon + task execution
- WebSocket Control Plane + minimal HTTP UI (`/` + `/health`)
- optional channel gateway (Telegram/Discord/Slack/etc)
- optional MCP + cron (best-effort)

## Recommended Install (Packaged Server Release)

For production VPS installs, use the GitHub release tarball documented in [Linux VPS](vps-linux.md):

```bash
version=<version>
curl -LO "https://github.com/NeoWorker/NeoWorker/releases/download/v${version}/neoworker-server-linux-x64-v${version}.tar.gz"
curl -LO "https://github.com/NeoWorker/NeoWorker/releases/download/v${version}/neoworker-server-linux-x64-v${version}.tar.gz.sha256"
sha256sum --check "neoworker-server-linux-x64-v${version}.tar.gz.sha256"
sudo mkdir -p /opt/neoworker
sudo tar -xzf "neoworker-server-linux-x64-v${version}.tar.gz" -C /opt/neoworker --strip-components=1
```

The package includes built daemon assets, runtime dependencies, resources, connectors, and systemd templates.

## Source Install

```bash
npm ci
npm run build:daemon
npm run build:connectors

# Start the daemon (Control Plane on 127.0.0.1:18789 by default)
node bin/neoworkerd-node.js --print-control-plane-token
```

Notes:

- `bin/neoworkerd-node.js` will rebuild `better-sqlite3` for the current Node ABI if needed.
- By default the Control Plane binds to loopback (`127.0.0.1`) for safety. Use SSH tunnel/Tailscale for remote access.
- Managed/headless startup blocks public Control Plane binds (`0.0.0.0`/`::`) unless Tailscale is enabled, `NEOWORKER_CONTROL_PLANE_BIND_CONTEXT=container` is set for a privately published container, or `NEOWORKER_CONTROL_PLANE_ALLOW_INSECURE_PUBLIC_BIND=1` is set as an explicit break-glass override.
- Reverse-proxied dashboards should set `NEOWORKER_CONTROL_PLANE_ALLOWED_ORIGINS` to the public HTTPS origin. Only set `NEOWORKER_CONTROL_PLANE_TRUST_PROXY=1` behind a proxy you control.

## Remote Use (No Desktop Required)

1. SSH tunnel from your laptop:

```bash
ssh -N -L 18789:127.0.0.1:18789 user@your-vps
```

2. Open the minimal dashboard:

```text
http://127.0.0.1:18789/
```

3. Or use the CLI:

```bash
export NEOWORKER_CONTROL_PLANE_URL=ws://127.0.0.1:18789
export NEOWORKER_CONTROL_PLANE_TOKEN=... # printed on first token generation or via --print-control-plane-token

node bin/neoworkerctl.js call config.get
node bin/neoworkerctl.js call llm.configure '{"providerType":"openai","apiKey":"sk-...","model":"gpt-4o-mini"}'
node bin/neoworkerctl.js call llm.configure '{"providerType":"openrouter","apiKey":"sk-or-...","model":"openrouter/pareto-code","settings":{"paretoMinCodingScore":0.8}}'
node bin/neoworkerctl.js call workspace.create '{"name":"main","path":"/srv/neoworker/workspace"}'
node bin/neoworkerctl.js call task.create '{"workspaceId":"...","title":"Test","prompt":"Say hi"}'
node bin/neoworkerctl.js watch --event task.event
```

## Headless Limitations (Expected)

Some tools are desktop-only (clipboard, screenshot capture, opening files in Finder/Explorer, etc). In the Node daemon these will return a clear error instead of trying to use Electron APIs.
