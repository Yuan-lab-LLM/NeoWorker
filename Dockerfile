# syntax=docker/dockerfile:1

# NeoWorker headless/server image.
# Note: NeoWorker currently runs in the Electron main process (even in headless mode),
# so we install Electron runtime deps. A future "neoworkerd" (Node-only) daemon would simplify this.

FROM node:24-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# Electron (Chromium) runtime deps + native build deps for better-sqlite3 (electron-rebuild).
# We also include Xvfb to avoid "cannot open display" errors in headless/container environments.
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  python3 \
  make \
  g++ \
  xvfb \
  xauth \
  fonts-liberation \
  libgtk-3-0 \
  libnss3 \
  libxss1 \
  libasound2 \
  libgbm1 \
  libdrm2 \
  libxshmfence1 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdbus-1-3 \
  libnspr4 \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libxext6 \
  libxfixes3 \
  libxcb1 \
  libxrender1 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libcairo2 \
  libexpat1 \
  libglib2.0-0 \
  libsecret-1-0 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install JS deps first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the repo and build the Electron main process + bundled connectors.
# Renderer build is not required for headless operation, so we skip it to keep images faster.
COPY . .
RUN npm run build:electron && npm run build:connectors

# Default persistent data directory inside the container. Mount a volume here.
ENV NEOWORKER_USER_DATA_DIR=/data

# Inside containers we generally want to bind on all interfaces, but you should map the port
# on the host to 127.0.0.1 (or use a private network) to avoid exposing it publicly.
ENV NEOWORKER_CONTROL_PLANE_HOST=0.0.0.0
ENV NEOWORKER_CONTROL_PLANE_PORT=18789
ENV NEOWORKER_CONTROL_PLANE_BIND_CONTEXT=container

RUN mkdir -p /data /workspace && chown -R node:node /data /workspace

# Optional: NEOWORKER_TZ sets TZ for the process (IANA timezone, e.g. America/New_York).
COPY deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

USER node

EXPOSE 18789

HEALTHCHECK --interval=30s --timeout=3s --start-period=25s --retries=3 \
  CMD curl -fsS http://127.0.0.1:18789/health || exit 1

CMD ["sh", "-lc", "xvfb-run -a node bin/neoworkerd.js"]
