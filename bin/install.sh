#!/bin/bash
# ════════════════════════════════════════════
# EvoKit — One-click Installer
#
# This is a minimal launcher (~50 lines).  All installation logic
# lives in the TypeScript CLI (`evokit install`).
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash -s -- --adapter claude,codex
#   bash bin/install.sh --dry-run
# ════════════════════════════════════════════

set -e

echo "╔═══════════════════════════════════════════╗"
echo "║   EvoKit — Self-Evolving System Install   ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# ── Environment check ────────────────────────────────────────
NODE_VERSION=$(node --version 2>/dev/null || echo "not found")

check_node() {
  local required_major=20 required_minor=12
  local major=$(node -e "console.log(process.version.slice(1).split('.')[0])" 2>/dev/null || echo "0")
  local minor=$(node -e "console.log(process.version.slice(1).split('.')[1])" 2>/dev/null || echo "0")

  if [ "$major" -lt $required_major ] 2>/dev/null; then
    return 1
  fi
  if [ "$major" -eq $required_major ] && [ "$minor" -lt $required_minor ] 2>/dev/null; then
    return 1
  fi
  return 0
}

if ! command -v node >/dev/null 2>&1 || ! check_node; then
  echo ""
  echo "╔═══════════════════════════════════════════╗"
  echo "║     ❌  Node.js 版本过低 / Too Old        ║"
  echo "╚═══════════════════════════════════════════╝"
  echo ""
  echo "   当前版本 / Current: $NODE_VERSION"
  echo "   需要版本 / Required: Node.js >= 20.12.0"
  echo ""
  echo "   ── 升级方法 / Upgrade ──"
  if command -v fnm >/dev/null 2>&1; then
    echo "   推荐 (fnm):  fnm install 22  &&  fnm use 22"
    echo "   或:          fnm install 20  &&  fnm use 20"
    echo ""
    echo "   然后设为默认 / Set as default:"
    echo "                 fnm default 22"
  fi
  echo "   下载安装:    https://nodejs.org/en/download/"
  echo ""
  exit 1
fi

# ── Launch CLI ───────────────────────────────────────────────
echo "🚀 Launching EvoKit installer..."
echo ""

# Try local binary first (dev), fall back to npx
SCRIPT_DIR="$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)"
if [ -f "$SCRIPT_DIR/dist/cli.js" ]; then
  exec node "$SCRIPT_DIR/dist/cli.js" install "$@"
elif [ -f "$SCRIPT_DIR/bin/evokit.cjs" ]; then
  exec node "$SCRIPT_DIR/bin/evokit.cjs" install "$@"
else
  exec npx --yes "@zythegit/evokit@latest" install "$@"
fi
