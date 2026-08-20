# Linux VPS (Headless) Guide

NeoWorker can run on Linux as a long-running daemon through three supported install paths:

1. **Packaged server release (recommended for production VPS)**: a Linux x64 tarball from GitHub Releases with built daemon assets, runtime dependencies, systemd templates, bundled resources, and connectors.
2. **Node-only daemon from source/npm**: run `neoworkerd-node` under Node.js, with no desktop window and no Xvfb.
3. **Headless Electron daemon from source**: closer to desktop parity, but requires Electron runtime deps + Xvfb.

All server modes can be driven remotely using:

- `--headless` (no Electron windows)
- The **WebSocket Control Plane** for remote task creation/monitoring (Web UI + CLI)
- Optional channel gateways (Telegram/Discord/Slack/etc) if you’ve configured them in the DB

These modes are designed for VPS/systemd/docker deployments.

Current packaging concept:

- The release tarball target is Linux x64 on glibc-based distributions.
- It starts `bin/neoworkerd-node.js`; it does not launch the desktop UI and does not require Xvfb.
- It includes the full `resources/` tree, built MCP connector runtimes, and runtime `node_modules`.
- It may include Electron as a compatibility dependency while shared daemon code still imports Electron-safe helpers; users should not run the desktop app from this package.
- Interaction happens through the Control Plane Web UI, `neoworkerctl`, or configured messaging channels.

If you want an overview (what the interface is, which runtime to pick, what works on Linux), start with:

- `docs/self-hosting.md`

## Start Here (First-Time VPS Install)

If you just want to get NeoWorker running and open the web UI, use this path first.

What you need:

- SSH access to your VPS (`user@your-vps`)
- One LLM API key (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`)
- Two terminals (one for server, one for SSH tunnel)

1. On your VPS (server terminal):

```bash
ssh user@your-vps
```

2. Check Node.js + npm:

```bash
node -v
npm -v
```

`neoworker` requires Node `>=24.0.0`.

If either command is missing, or you see `v22`/`v23`, install Node.js 24:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
```

3. Install and start NeoWorker (Node-only daemon, no sudo/global npm required):

```bash
mkdir -p ~/neoworker-run
cd ~/neoworker-run
npm init -y >/dev/null
npm install neoworker@latest --no-audit --no-fund

export NEOWORKER_IMPORT_ENV_SETTINGS=1
export OPENAI_API_KEY=your_key_here   # or: export ANTHROPIC_API_KEY=your_key_here
npx neoworkerd-node --print-control-plane-token
```

Keep this terminal open. It runs the server and prints the token you need for login.

4. On your local machine (second terminal), open SSH tunnel:

```bash
ssh -N -L 18789:127.0.0.1:18789 user@your-vps
```

If local port `18789` is busy:

```bash
ssh -N -L 28789:127.0.0.1:18789 user@your-vps
```

5. Open the dashboard in your browser:

- `http://127.0.0.1:18789/` (or `http://127.0.0.1:28789/` if you used 28789)
- Paste the Control Plane token printed in step 3

This quick start is great for first run/testing. For always-on production, continue with **Option A (Packaged Server Release)**, **Option B (Docker)**, or **Option C (Systemd from Source)** below.

### Common First-Run Errors

- `npm WARN EBADENGINE`:
  Node version is too old. Install Node 24 and retry step 3.
- `npm ERR! EACCES` on `npm install -g ...`:
  This guide intentionally uses local install (`npm install` + `npx neoworkerd-node`) so you do not need global npm permissions.
- `sh: 1: tsc: not found` after `npx neoworkerd-node`:
  You are likely on an older broken npm publish that missed daemon build artifacts. Upgrade and retry:
  `npm install neoworker@latest --no-audit --no-fund`

## Option A: Packaged Server Release (Recommended)

Use this path when you want a GitHub release artifact that does not require cloning the repo or building TypeScript on the server.

1. Install OS deps (Debian/Ubuntu):

```bash
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  ca-certificates curl tar \
  python3 make g++
```

2. Install Node.js 24 if it is not already installed:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
```

3. Download the Linux server tarball and checksum from the GitHub release:

```bash
version=0.5.43
curl -LO "https://github.com/NeoWorker/NeoWorker/releases/download/v${version}/neoworker-server-linux-x64-v${version}.tar.gz"
curl -LO "https://github.com/NeoWorker/NeoWorker/releases/download/v${version}/neoworker-server-linux-x64-v${version}.tar.gz.sha256"
sha256sum --check "neoworker-server-linux-x64-v${version}.tar.gz.sha256"
```

Replace `0.5.43` with the version you are installing.

4. Install under `/opt/neoworker`:

```bash
sudo mkdir -p /opt/neoworker
sudo tar -xzf "neoworker-server-linux-x64-v${version}.tar.gz" -C /opt/neoworker --strip-components=1
```

5. Create a dedicated user + data dir:

```bash
sudo useradd -r -m -s /usr/sbin/nologin neoworker || true
sudo mkdir -p /var/lib/neoworker /srv/neoworker/workspace
sudo chown -R neoworker:neoworker /var/lib/neoworker /srv/neoworker/workspace /opt/neoworker
```

6. Install the systemd unit + env file templates:

```bash
sudo cp /opt/neoworker/deploy/systemd/neoworker.env.example /etc/neoworker.env
sudo $EDITOR /etc/neoworker.env

sudo cp /opt/neoworker/deploy/systemd/neoworker-node.service /etc/systemd/system/neoworker-node.service
sudo systemctl daemon-reload
sudo systemctl enable --now neoworker-node

sudo journalctl -u neoworker-node -f
```

The packaged release uses `bin/neoworkerd-node.js` by default. It does not launch the desktop UI or require Xvfb. Keep Node.js 24 installed; the package is built and smoke-tested on Linux x64 and includes runtime dependencies, but `neoworkerd-node` can still attempt a native dependency rebuild if the local Node ABI is incompatible.

## Option B: Docker (Headless Electron)

This repo includes a headless Docker image that runs NeoWorker as a daemon.

### How You Use It (After It’s Running)

1. Create an SSH tunnel from your laptop:

```bash
ssh -N -L 18789:127.0.0.1:18789 user@your-vps
```

If your local machine already uses port `18789`, use a different local port (example: `28789`):

```bash
ssh -N -L 28789:127.0.0.1:18789 user@your-vps
```

2. Open the minimal Control Plane Web UI locally:

```text
http://127.0.0.1:18789/
```

3. Or use `neoworkerctl`:

```bash
export NEOWORKER_CONTROL_PLANE_URL=ws://127.0.0.1:18789
export NEOWORKER_CONTROL_PLANE_TOKEN=... # from logs (first token generation) or via --print-control-plane-token
node bin/neoworkerctl.js call config.get
```

1. Build and start:

```bash
docker compose -f deploy/docker/compose.yml up --build -d
```

If you prefer the **Node daemon** container with no desktop window or Xvfb, use the compose profile:

```bash
docker compose -f deploy/docker/compose.yml --profile node up --build -d neoworker-node
```

Defaults in `deploy/docker/compose.yml`:

- Persistent data volume mounted at `/data`
- A persistent workspace volume mounted at `/workspace` (bootstrapped automatically). You can swap this for a host bind mount if you want NeoWorker to operate on files on the VPS.
- Control Plane published on host loopback: `127.0.0.1:18789` (safe default)
- The container binds the Control Plane to `0.0.0.0` only inside the container and sets `NEOWORKER_CONTROL_PLANE_BIND_CONTEXT=container`; keep host port publishing loopback/private.
- Compose enables `init: true`, drops Linux capabilities, and sets `no-new-privileges`.

2. View the Control Plane token (printed on first startup when it’s generated):

```bash
docker compose -f deploy/docker/compose.yml logs -f neoworker
```

If you need to print it again later, restart with:

- `NEOWORKER_PRINT_CONTROL_PLANE_TOKEN=1` (env) or
- `--print-control-plane-token` (flag)

## Option C: Systemd from Source (Node-Only Daemon)

This is the source-build path when you don’t want Docker or a prebuilt release artifact.

1. Install OS deps (Debian/Ubuntu):

```bash
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  ca-certificates curl git \
  python3 make g++
```

2. Install Node.js 24 and build NeoWorker:

```bash
git clone https://github.com/NeoWorker/NeoWorker.git /opt/neoworker
cd /opt/neoworker
npm run setup:server
npm run build:daemon
npm run build:connectors
```

On first start, `bin/neoworkerd-node.js` may rebuild `better-sqlite3` for your Node version (native addon ABI).

3. Create a dedicated user + data dir:

```bash
sudo useradd -r -m -s /usr/sbin/nologin neoworker || true
sudo mkdir -p /var/lib/neoworker
sudo chown -R neoworker:neoworker /var/lib/neoworker
```

If you cloned/built as `root`, ensure the service user can read (and rebuild native deps if needed):

```bash
sudo chown -R neoworker:neoworker /opt/neoworker
```

4. Install the systemd unit + env file templates:

- Unit: `deploy/systemd/neoworker-node.service`
- Env example: `deploy/systemd/neoworker.env.example`

```bash
sudo cp /opt/neoworker/deploy/systemd/neoworker.env.example /etc/neoworker.env
sudo $EDITOR /etc/neoworker.env

sudo cp /opt/neoworker/deploy/systemd/neoworker-node.service /etc/systemd/system/neoworker-node.service
sudo systemctl daemon-reload
sudo systemctl enable --now neoworker-node

sudo journalctl -u neoworker-node -f
```

## Optional: Browser Automation (Browser V2 Fallback)

NeoWorker desktop uses the visible Browser V2 Workbench by default. Headless Linux/VPS installs do not have that renderer-owned workbench, so browser tools use the Playwright-local fallback when browser automation is explicitly needed. On minimal Linux VPS images (and especially slim Docker images), Chromium may fail to launch until OS dependencies are installed.

If you want fallback browser tools on Debian/Ubuntu, install Playwright’s Chromium + dependencies:

```bash
cd /opt/neoworker
sudo npx playwright install --with-deps chromium
```

If you don’t need browser automation, you can ignore this and rely on `web_fetch` + API-based search providers.

For public HTTP(S) sites, Browser Use Cloud can be used instead of local Chromium by setting `BROWSER_USE_API_KEY` and explicitly passing `browser_provider: "browser-use-cloud"` to `browser_navigate`. This creates a remote Browser Use session and attaches through CDP. It is not used automatically, and it is blocked for localhost, private networks, `file:` URLs, and intranet-style hostnames; use local Playwright or a desktop Browser Workbench for those targets.

If you’re running under Docker and want Playwright inside the container, you’ll want a container image that includes
the required libraries. (We can add an optional “Playwright-ready” Docker profile/image next.)

## Option D: Systemd from Source (Headless Electron)

This is a good fit when you don’t want Docker.

1. Install OS deps (Debian/Ubuntu):

```bash
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  ca-certificates curl git \
  python3 make g++ \
  xvfb xauth \
  fonts-liberation \
  libgtk-3-0 libnss3 libxss1 libasound2 \
  libgbm1 libdrm2 libxshmfence1 \
  libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdbus-1-3 libnspr4 \
  libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 \
  libxext6 libxfixes3 libxcb1 libxrender1 \
  libpango-1.0-0 libpangocairo-1.0-0 libcairo2 \
  libexpat1 libglib2.0-0 libsecret-1-0
```

2. Install Node.js 24 and build NeoWorker:

```bash
git clone https://github.com/NeoWorker/NeoWorker.git /opt/neoworker
cd /opt/neoworker
npm run setup:server
npm run build:electron
npm run build:connectors
```

3. Create a dedicated user + data dir:

```bash
sudo useradd -r -m -s /usr/sbin/nologin neoworker || true
sudo mkdir -p /var/lib/neoworker
sudo chown -R neoworker:neoworker /var/lib/neoworker
```

4. Install the systemd unit + env file templates:

- Unit: `deploy/systemd/neoworker.service`
- Env example: `deploy/systemd/neoworker.env.example`

Example install commands:

```bash
sudo cp /opt/neoworker/deploy/systemd/neoworker.env.example /etc/neoworker.env
sudo $EDITOR /etc/neoworker.env

sudo cp /opt/neoworker/deploy/systemd/neoworker.service /etc/systemd/system/neoworker.service
sudo systemctl daemon-reload
sudo systemctl enable --now neoworker

sudo journalctl -u neoworker -f
```

## Recommended: Persistent Data Directory

On VPS you usually want the DB/settings under a known path (for backups and container volumes).

```bash
export NEOWORKER_USER_DATA_DIR=/var/lib/neoworker
node bin/neoworkerd-node.js
```

Or via CLI flag:

```bash
node bin/neoworkerd-node.js --user-data-dir /var/lib/neoworker
```

## Bootstrapping a Workspace (Important)

Headless instances can’t “Select Folder” via UI, so you must either:

1. Bootstrap a default workspace at startup:

```bash
export NEOWORKER_BOOTSTRAP_WORKSPACE_PATH=/srv/neoworker/workspace
export NEOWORKER_BOOTSTRAP_WORKSPACE_NAME=main
```

2. Or create one remotely over the Control Plane using `workspace.create`.

### neoworkerctl (Simple Control Plane CLI)

Use the bundled helper to call Control Plane methods:

```bash
export NEOWORKER_CONTROL_PLANE_URL=ws://127.0.0.1:18789
export NEOWORKER_CONTROL_PLANE_TOKEN=... # from startup logs

node bin/neoworkerctl.js call workspace.list
node bin/neoworkerctl.js call workspace.create '{"name":"main","path":"/srv/neoworker/workspace"}'
node bin/neoworkerctl.js call config.get
node bin/neoworkerctl.js watch --event task.event
node bin/neoworkerctl.js tail '<taskId>' --limit 200
```

## Configure Channels (Headless)

If you want to interact with the agent via Telegram/Discord/Slack/etc on a VPS, you can configure and manage channels over the Control Plane (no desktop UI required).

Examples:

```bash
node bin/neoworkerctl.js call channel.list

# Create a Telegram channel (disabled by default; test then enable)
node bin/neoworkerctl.js call channel.create '{"type":"telegram","name":"telegram","config":{"botToken":"..."},"securityConfig":{"mode":"pairing"}}'
node bin/neoworkerctl.js call channel.test '{"channelId":"..."}'
node bin/neoworkerctl.js call channel.enable '{"channelId":"..."}'
```

## Configure LLM/Search Credentials (Headless)

You have two headless-friendly options:

1. **Control Plane setup (recommended once running)**  
   Use the Web UI **LLM Setup** panel or call `llm.configure` via `neoworkerctl`.
2. **Env import on boot**  
   Keep credentials in environment variables and import them at startup.

### Option 1: Configure via Control Plane

Examples:

```bash
# OpenAI
node bin/neoworkerctl.js call llm.configure '{"providerType":"openai","apiKey":"sk-...","model":"gpt-4o-mini"}'

# OpenRouter Pareto Code Router (score is a decimal 0..1, not a percentage)
node bin/neoworkerctl.js call llm.configure '{"providerType":"openrouter","apiKey":"sk-or-...","model":"openrouter/pareto-code","settings":{"paretoMinCodingScore":0.8}}'

# Ollama (remote/local URL)
node bin/neoworkerctl.js call llm.configure '{"providerType":"ollama","settings":{"baseUrl":"http://127.0.0.1:11434"},"model":"gpt-oss:20b"}'

# Azure OpenAI
node bin/neoworkerctl.js call llm.configure '{"providerType":"azure","apiKey":"...","settings":{"endpoint":"https://...","deployment":"gpt-4.1-mini"}}'
```

Then verify:

```bash
node bin/neoworkerctl.js call config.get
```

### API-first account lifecycle (agent signup support)

Use the managed account API to track signup status, store credentials, and let agents orchestrate account setup flows without relying on manual UI state.

```bash
# Create or update an account record (secrets stored encrypted)
node bin/neoworkerctl.js call account.upsert '{
  "provider":"openrouter",
  "label":"OpenRouter production",
  "status":"pending_signup",
  "signupUrl":"https://openrouter.ai/signup",
  "notes":"Need billing enabled before production traffic"
}'

# Add secrets once available (or rotate later)
node bin/neoworkerctl.js call account.upsert '{
  "id":"<accountId>",
  "status":"active",
  "secrets":{"api_key":"sk-or-..."},
  "lastVerifiedAt":1739923200000
}'

# List records (redacted by default)
node bin/neoworkerctl.js call account.list

# Fetch a single account
node bin/neoworkerctl.js call account.get '{"accountId":"<accountId>"}'

# Remove account metadata/credentials
node bin/neoworkerctl.js call account.remove '{"accountId":"<accountId>"}'
```

Managed account statuses are `draft`, `pending_signup`, `pending_verification`, `active`, `blocked`, `disabled`, and `error`. `account.list` accepts optional `provider` and `status` filters. `account.upsert` requires `provider` for new records, merges incoming secrets into existing secrets by default, and replaces the full secret set only when `clearSecrets:true` is passed.

Operational limits are enforced before records are stored: up to 500 accounts, 64 secrets per account, 4,096 characters per secret value, 64 KiB metadata JSON per account, 8,000 characters of notes, 2,048 characters per URL, and 500 characters for `lastError`.

Secrets are redacted from normal `account.list` and `account.get` responses. Without secret access, responses expose `secretKeys` and `secretCount` only. Remote Control Plane clients receive raw `secrets` only when they request `includeSecrets:true` and authenticate as an admin client; `account.upsert` and `account.remove` also require the `admin` scope.

### Option 2: Configure via env import

NeoWorker supports an explicit, opt-in import path:

- `NEOWORKER_IMPORT_ENV_SETTINGS=1` (or `--import-env-settings`)
- Optional: `NEOWORKER_IMPORT_ENV_SETTINGS_MODE=merge|overwrite`
- Optional: `NEOWORKER_LLM_PROVIDER=openai|anthropic|gemini|...`

Example (OpenAI):

```bash
export NEOWORKER_IMPORT_ENV_SETTINGS=1
export NEOWORKER_LLM_PROVIDER=openai
export OPENAI_API_KEY=...
```

Example (search):

```bash
export NEOWORKER_IMPORT_ENV_SETTINGS=1
export TAVILY_API_KEY=...
```

If you rotate keys later, restart with:

```bash
export NEOWORKER_IMPORT_ENV_SETTINGS_MODE=overwrite
```

## Control Plane Overrides

You can override bind host/port at startup:

```bash
export NEOWORKER_CONTROL_PLANE_HOST=127.0.0.1
export NEOWORKER_CONTROL_PLANE_PORT=18789
node bin/neoworkerd-node.js
```

Keep `host=127.0.0.1` unless you *fully* understand the security implications of binding to `0.0.0.0`.

Headless and managed deployments fail closed on unsafe Control Plane exposure. If `NEOWORKER_MANAGED_DEPLOYMENT=1` or the daemon is running headless, `0.0.0.0`/`::` binds are blocked unless one of these is true:

- Tailscale Serve/Funnel is enabled.
- The runtime is a privately published container with `NEOWORKER_CONTROL_PLANE_BIND_CONTEXT=container`.
- You intentionally set `NEOWORKER_CONTROL_PLANE_ALLOW_INSECURE_PUBLIC_BIND=1` as a break-glass override.

Reverse-proxy deployments should keep the daemon on loopback where possible. If a trusted proxy must pass browser traffic to the Control Plane, set `NEOWORKER_CONTROL_PLANE_ALLOWED_ORIGINS=https://your-host.example` and only set `NEOWORKER_CONTROL_PLANE_TRUST_PROXY=1` when the proxy controls forwarded headers.

## Remote Access (SSH Tunnel)

From your local machine:

```bash
ssh -N -L 18789:127.0.0.1:18789 user@your-vps
```

Then connect your client to `ws://127.0.0.1:18789` using the printed token.

If local port `18789` is busy, either:

- Use another fixed local port (`28789`, `38789`, etc.):

```bash
ssh -N -L 28789:127.0.0.1:18789 user@your-vps
```

Use `http://127.0.0.1:28789/` and `ws://127.0.0.1:28789`.

- Or auto-pick a free local port:

```bash
LOCAL_PORT=18789
while lsof -nP -iTCP:${LOCAL_PORT} -sTCP:LISTEN >/dev/null 2>&1; do
  LOCAL_PORT=$((LOCAL_PORT + 1))
done
echo "Using local port: ${LOCAL_PORT}"
echo "Open: http://127.0.0.1:${LOCAL_PORT}/"
ssh -N -L ${LOCAL_PORT}:127.0.0.1:18789 user@your-vps
```

## Web Dashboard (Browser UI)

When the Control Plane server is running, it also serves a minimal web UI at:

- `http://127.0.0.1:18789/` (over SSH tunnel)

Open it in your browser, paste the Control Plane token, and you can:

- Configure LLM provider credentials (LLM Setup)
- List/create workspaces
- Create tasks and send messages
- View task events (recent history + live stream)
- Approve/deny approvals

Also see: `docs/remote-access.md` (SSH + Tailscale Serve/Funnel).

For private MCP tool access, use Secure MCP Tunnels instead of exposing connector or MCP host ports directly. The tunnel client holds an outbound WebSocket to a NeoWorker-operated relay, while callers authenticate with a separate caller token and relay-side policy. See `docs/secure-mcp-tunnels.md`.

## Approvals Over Control Plane

In headless mode, approval prompts (shell commands, deletions, etc.) can be handled remotely over the Control Plane:

- NeoWorker broadcasts `approval_requested` events including an `approvalId`
- Respond via `approval.respond` with `{ approvalId, approved }`

This enables running a VPS instance without requiring a local UI or messaging channels for approvals.

## Uninstall / Remove (VPS)

Choose one option based on whether you want to keep data.

### Option 1: Stop and uninstall app services only (keep DB/data)

```bash
# If running via docker-compose in this repo
cd /path/to/neoworker-vps
docker compose -f deploy/docker/compose.yml down

# If running via systemd
sudo systemctl stop neoworker neoworker-node
sudo systemctl disable neoworker neoworker-node
sudo rm -f /etc/systemd/system/neoworker.service
sudo rm -f /etc/systemd/system/neoworker-node.service
sudo systemctl daemon-reload
```

Keep data directories/volumes intact to preserve state:

- Docker: named volume `neoworker_data` (and workspace volume `neoworker_workspace` unless bound to host)
- systemd example: `/var/lib/neoworker`
- Custom env path: value passed in `NEOWORKER_USER_DATA_DIR` or `--user-data-dir`

### Option 2: Full uninstall + data deletion (irreversible)

> ⚠️ **WARNING:** This deletes the full persistent database and all local state. **This will delete everything forever; there is no undo and no recovery if you have no backup.**

```bash
# Docker (removes anonymous/named volumes used for DB, workspace state, and tasks)
cd /path/to/neoworker-vps
docker compose -f deploy/docker/compose.yml down -v

# systemd (remove user-data store)
sudo rm -rf /var/lib/neoworker
```

If you configured a custom user-data directory, also remove it:

```bash
rm -rf "$NEOWORKER_USER_DATA_DIR"
```
