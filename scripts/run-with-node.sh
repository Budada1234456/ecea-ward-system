#!/usr/bin/env bash
set -euo pipefail

minimum_major=22
minimum_minor=5

node_is_compatible() {
  local candidate="$1"
  local version major minor patch
  version="$("$candidate" --version 2>/dev/null || true)"
  version="${version#v}"
  IFS=. read -r major minor patch <<<"$version"
  [[ "$major" =~ ^[0-9]+$ && "$minor" =~ ^[0-9]+$ && "$patch" =~ ^[0-9]+$ ]] || return 1
  (( major > minimum_major || (major == minimum_major && minor >= minimum_minor) ))
}

if command -v node >/dev/null 2>&1 && node_is_compatible "$(command -v node)"; then
  exec "$(command -v node)" "$@"
fi

if [[ -n "${AWARD_NODE_BIN:-}" ]] && [[ -x "$AWARD_NODE_BIN" ]] && node_is_compatible "$AWARD_NODE_BIN"; then
  exec "$AWARD_NODE_BIN" "$@"
fi

shopt -s nullglob
for candidate in "$HOME"/.vscode-server/cli/servers/Stable-*/server/node; do
  if [[ -x "$candidate" ]] && node_is_compatible "$candidate"; then
    exec "$candidate" "$@"
  fi
done

echo "错误：申报系统需要 Node.js 22.5 或更高版本。" >&2
echo "请安装新版 Node.js，或通过 AWARD_NODE_BIN 指定可执行文件。" >&2
exit 1
