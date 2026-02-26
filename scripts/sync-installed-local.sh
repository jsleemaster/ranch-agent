#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/extension"
TARGET_DIR="${RANCH_AGENT_INSTALL_DIR:-$HOME/.vscode/extensions/local.ranch-agent-extension-0.1.0}"
INTERVAL="${RANCH_AGENT_SYNC_INTERVAL:-1}"

if [[ ! -d "$SRC_DIR" ]]; then
  echo "[sync] source dir not found: $SRC_DIR"
  exit 1
fi

mkdir -p "$TARGET_DIR"

RSYNC_OPTS=(
  -a
  --delete
  --exclude ".git/"
  --exclude "node_modules/"
  --exclude ".vscode-test/"
  --exclude "*.log"
  --exclude ".DS_Store"
)

sync_once() {
  rsync "${RSYNC_OPTS[@]}" "$SRC_DIR/" "$TARGET_DIR/"
}

print_change_preview() {
  rsync -ain --delete "${RSYNC_OPTS[@]}" "$SRC_DIR/" "$TARGET_DIR/" || true
}

echo "[sync] source: $SRC_DIR"
echo "[sync] target: $TARGET_DIR"
echo "[sync] interval: ${INTERVAL}s"
echo "[sync] press Ctrl+C to stop"

sync_once
echo "[sync] initial sync complete"

while true; do
  preview="$(print_change_preview)"
  if [[ -n "$preview" ]]; then
    sync_once
    changed="$(printf '%s\n' "$preview" | wc -l | tr -d ' ')"
    echo "[sync] $(date '+%H:%M:%S') applied ($changed changes)"
  fi
  sleep "$INTERVAL"
done
