#!/bin/bash
# ════════════════════════════════════════════
# EvoKit — One-click Installer
#
# This is a minimal launcher (~30 lines).  All installation logic
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
command -v node >/dev/null 2>&1 || {
  echo "❌ Node.js >=18 is required but not found."
  echo "   Install: https://nodejs.org/en/download/"
  exit 1
}

NODE_MAJOR=$(node -e "console.log(process.version.slice(1).split('.')[0])" 2>/dev/null || echo "0")
if [ "$NODE_MAJOR" -lt 18 ] 2>/dev/null; then
  echo "❌ Node.js >=18 required (found v$NODE_MAJOR)"
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
