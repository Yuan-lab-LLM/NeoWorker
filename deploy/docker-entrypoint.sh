#!/bin/sh
# Docker entrypoint for NeoWorker.
# Sets TZ from NEOWORKER_TZ when provided (IANA timezone, e.g. America/New_York).
if [ -n "$NEOWORKER_TZ" ]; then
  # Basic validation: invalid TZ can cause silent date bugs. Fall back to UTC if invalid.
  if (TZ="$NEOWORKER_TZ" date +%Z >/dev/null 2>&1); then
    export TZ="$NEOWORKER_TZ"
  else
    echo "[neoworker-entrypoint] Invalid NEOWORKER_TZ='$NEOWORKER_TZ', using UTC" >&2
    export TZ="UTC"
  fi
fi
exec "$@"
