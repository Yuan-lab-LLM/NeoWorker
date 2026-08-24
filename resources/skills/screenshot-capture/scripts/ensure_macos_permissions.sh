#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[screenshot-capture] macOS preflight skipped on non-macOS host."
  exit 0
fi

export SWIFT_MODULE_CACHE_PATH="${TMPDIR:-/tmp}/codex-swift-module-cache"
mkdir -p "$SWIFT_MODULE_CACHE_PATH"

echo "[screenshot-capture] Screen Recording permission is required for desktop or window screenshots."
echo "[screenshot-capture] Triggering a tiny capture now so macOS can show the permission prompt in one place."

tmp_file="$(mktemp "${TMPDIR:-/tmp}/codex-screen-recording-preflight.XXXXXX.png")"
cleanup() {
  rm -f "$tmp_file"
}
trap cleanup EXIT

if /usr/sbin/screencapture -x -R0,0,1,1 "$tmp_file" >/dev/null 2>&1; then
  echo "[screenshot-capture] Preflight capture completed."
else
  echo "[screenshot-capture] Preflight capture could not complete. Grant Screen Recording permission to the terminal or Codex host app, then rerun."
fi
