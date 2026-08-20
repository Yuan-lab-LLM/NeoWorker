#!/usr/bin/env bash
set -euo pipefail

if ! command -v python3 >/dev/null 2>&1; then
  echo "[kami] python3: missing"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[kami] node: missing"
  exit 1
fi

python3 - <<'PY'
from importlib.util import find_spec

checks = [
    ("weasyprint", "HTML to PDF rendering"),
    ("pypdf", "PDF inspection"),
]

print("[kami] python3: ok")
for module, label in checks:
    status = "ok" if find_spec(module) is not None else "missing"
    print(f"[kami] python module {module}: {status} ({label})")
PY

node "$(cd "$(dirname "$0")" && pwd)/check_node_runtime.mjs" || true

for tool in pdffonts; do
  if command -v "$tool" >/dev/null 2>&1; then
    echo "[kami] command $tool: ok"
  else
    echo "[kami] command $tool: missing"
  fi
done
