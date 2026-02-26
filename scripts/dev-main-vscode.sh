#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[dev] starting webview watch"
npm --prefix webview-ui run build:watch &
PID_WEBVIEW=$!

echo "[dev] starting extension watch"
npm --prefix extension run watch &
PID_EXTENSION=$!

echo "[dev] starting installed-extension sync"
bash "$ROOT_DIR/scripts/sync-installed-local.sh" &
PID_SYNC=$!

cleanup() {
  kill "$PID_WEBVIEW" "$PID_EXTENSION" "$PID_SYNC" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait -n "$PID_WEBVIEW" "$PID_EXTENSION" "$PID_SYNC"
