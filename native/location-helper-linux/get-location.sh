#!/usr/bin/env bash
set -euo pipefail

ACCURACY="precise"
TIMEOUT_MS=15000
RESPONSE_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --accuracy)      ACCURACY="$2";      shift 2 ;;
    --timeout-ms)    TIMEOUT_MS="$2";    shift 2 ;;
    --response-file) RESPONSE_FILE="$2"; shift 2 ;;
    *) shift ;;
  esac
done

[[ "$TIMEOUT_MS" -lt 1000 ]]  && TIMEOUT_MS=1000
[[ "$TIMEOUT_MS" -gt 60000 ]] && TIMEOUT_MS=60000

emit_result() {
  if [[ -n "$RESPONSE_FILE" ]]; then
    printf '%s' "$1" > "$RESPONSE_FILE"
  else
    printf '%s\n' "$1"
  fi
}

emit_error() {
  local code="$1" message="$2"
  emit_result "{\"ok\":false,\"error\":{\"code\":\"${code}\",\"message\":\"${message}\"}}"
  exit 1
}

cleanup() {
  if [[ -n "${CLIENT_PATH:-}" ]]; then
    gdbus call --system \
      --dest org.freedesktop.GeoClue2 \
      --object-path "$CLIENT_PATH" \
      --method org.freedesktop.GeoClue2.Client.Stop 2>/dev/null || true
  fi
}
trap cleanup EXIT

if ! command -v gdbus &>/dev/null; then
  emit_error "LOCATION_NOT_CONFIGURED" "gdbus is not available. Install glib2 utilities for location support."
fi

CREATE_OUT=$(gdbus call --system \
  --dest org.freedesktop.GeoClue2 \
  --object-path /org/freedesktop/GeoClue2/Manager \
  --method org.freedesktop.GeoClue2.Manager.CreateClient 2>&1) || {
  emit_error "LOCATION_UNAVAILABLE" "Failed to create GeoClue2 client. Is geoclue2 running?"
}

CLIENT_PATH=$(echo "$CREATE_OUT" | sed -n "s/.*'\(\/[^']*\)'.*/\1/p")
if [[ -z "$CLIENT_PATH" ]]; then
  emit_error "LOCATION_UNAVAILABLE" "GeoClue2 returned empty client path."
fi

gdbus call --system \
  --dest org.freedesktop.GeoClue2 \
  --object-path "$CLIENT_PATH" \
  --method org.freedesktop.DBus.Properties.Set \
  org.freedesktop.GeoClue2.Client DesktopId "<'neoworker'>" 2>/dev/null || true

if [[ "$ACCURACY" == "coarse" ]]; then
  ACCURACY_LEVEL=4
else
  ACCURACY_LEVEL=8
fi

gdbus call --system \
  --dest org.freedesktop.GeoClue2 \
  --object-path "$CLIENT_PATH" \
  --method org.freedesktop.DBus.Properties.Set \
  org.freedesktop.GeoClue2.Client RequestedAccuracyLevel "<uint32 $ACCURACY_LEVEL>" 2>/dev/null || true

gdbus call --system \
  --dest org.freedesktop.GeoClue2 \
  --object-path "$CLIENT_PATH" \
  --method org.freedesktop.GeoClue2.Client.Start 2>/dev/null || {
  emit_error "LOCATION_DENIED" "GeoClue2 denied location access. Check agent configuration in /etc/geoclue/geoclue.conf."
}

TIMEOUT_SECS=$(( (TIMEOUT_MS + 999) / 1000 ))
DEADLINE=$(( $(date +%s) + TIMEOUT_SECS ))
LOCATION_PATH=""

while [[ $(date +%s) -lt $DEADLINE ]]; do
  LOC_OUT=$(gdbus call --system \
    --dest org.freedesktop.GeoClue2 \
    --object-path "$CLIENT_PATH" \
    --method org.freedesktop.DBus.Properties.Get \
    org.freedesktop.GeoClue2.Client Location 2>/dev/null || true)

  LOCATION_PATH=$(echo "$LOC_OUT" | sed -n "s/.*'\(\/[^']*\)'.*/\1/p")
  if [[ -n "$LOCATION_PATH" && "$LOCATION_PATH" != "/" ]]; then
    break
  fi
  LOCATION_PATH=""
  sleep 0.5
done

if [[ -z "$LOCATION_PATH" ]]; then
  emit_error "LOCATION_TIMEOUT" "Timed out while getting current location from GeoClue2."
fi

read_double_property() {
  local prop_out
  prop_out=$(gdbus call --system \
    --dest org.freedesktop.GeoClue2 \
    --object-path "$LOCATION_PATH" \
    --method org.freedesktop.DBus.Properties.Get \
    org.freedesktop.GeoClue2.Location "$1" 2>/dev/null || true)
  echo "$prop_out" | grep -oE '[-]?[0-9]+\.?[0-9]*' | head -1
}

LATITUDE=$(read_double_property Latitude)
LONGITUDE=$(read_double_property Longitude)
ACCURACY_M=$(read_double_property Accuracy)

if [[ -z "$LATITUDE" || -z "$LONGITUDE" ]]; then
  emit_error "LOCATION_UNAVAILABLE" "GeoClue2 returned incomplete location data."
fi

ACCURACY_M="${ACCURACY_M:-0}"

TIMESTAMP_OUT=$(gdbus call --system \
  --dest org.freedesktop.GeoClue2 \
  --object-path "$LOCATION_PATH" \
  --method org.freedesktop.DBus.Properties.Get \
  org.freedesktop.GeoClue2.Location Timestamp 2>/dev/null || true)

TIMESTAMP_SECS=$(echo "$TIMESTAMP_OUT" | grep -oE '[0-9]+' | head -1)
if [[ -n "$TIMESTAMP_SECS" && "$TIMESTAMP_SECS" != "0" ]]; then
  TIMESTAMP_MS=$(( TIMESTAMP_SECS * 1000 ))
else
  TIMESTAMP_MS=$(date +%s%3N)
fi

emit_result "{\"ok\":true,\"location\":{\"latitude\":${LATITUDE},\"longitude\":${LONGITUDE},\"accuracyMeters\":${ACCURACY_M},\"timestamp\":${TIMESTAMP_MS},\"source\":\"linux_geoclue\"}}"
exit 0
