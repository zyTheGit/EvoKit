#!/bin/bash
# ════════════════════════════════════════════
# EvoKit — One-click Installer
# Usage:
#   bash bin/install.sh
#   bash bin/install.sh --template /path/to/template
#   bash bin/install.sh --dry-run
#   bash bin/install.sh --branch develop
#   curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash -s -- --branch v0.1.0
# ════════════════════════════════════════════

set -e

# ──────────────────────────────────────────
# Defaults
# ──────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")/.." 2>/dev/null && pwd || echo "")"
TEMPLATE_DIR="${SCRIPT_DIR:+${SCRIPT_DIR}/template}"
DRY_RUN=false
CLAUDE_DIR="${HOME}/.claude"
TEMPLATE_EXPLICIT=false

# GitHub fallback (used when template not found locally, e.g. curl | bash mode)
REPO="zyTheGit/EvoKit"
BRANCH="main"

# ──────────────────────────────────────────
# Parse args
# ──────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --template) TEMPLATE_DIR="$2"; TEMPLATE_EXPLICIT=true; shift 2 ;;
    --branch)   BRANCH="$2"; shift 2 ;;
    --dry-run)  DRY_RUN=true; shift ;;
    --prefix)   PREFIX="$2"; shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

echo "╔═══════════════════════════════════════════╗"
echo "║   EvoKit — Self-Evolving System Install   ║"
echo "╚═══════════════════════════════════════════╝"
echo ""
echo "  Template: ${TEMPLATE_DIR:-"(downloading from GitHub)"}"
echo "  Target:   ${HOME}/.claude$($DRY_RUN && echo " (DRY RUN)" || true)"
echo ""

# ──────────────────────────────────────────
# Validate or download template
# ──────────────────────────────────────────
if [ -z "$TEMPLATE_DIR" ] || [ ! -f "$TEMPLATE_DIR/CLAUDE.md" ]; then
  if [ "$TEMPLATE_EXPLICIT" = true ]; then
    echo "❌ Template not found at: $TEMPLATE_DIR"
    echo "   Specify the correct path with --template"
    exit 1
  fi

  echo "📦 Downloading EvoKit from GitHub ($REPO:$BRANCH)..."
  TMP_DIR=$(mktemp -d)
  CLEANUP_TMP=true

  if command -v curl &>/dev/null; then
    curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$BRANCH" -o "$TMP_DIR/evokit.tar.gz"
  elif command -v wget &>/dev/null; then
    wget -q "https://codeload.github.com/$REPO/tar.gz/$BRANCH" -O "$TMP_DIR/evokit.tar.gz"
  else
    echo "❌ Need curl or wget to download from GitHub."
    exit 1
  fi

  tar xzf "$TMP_DIR/evokit.tar.gz" -C "$TMP_DIR"

  # Find extracted directory (GitHub tarballs create a dir like zyTheGit-EvoKit-<sha>)
  EXTRACTED_DIR=$(find "$TMP_DIR" -maxdepth 1 -type d ! -path "$TMP_DIR" | head -1)
  if [ -z "$EXTRACTED_DIR" ] || [ ! -d "$EXTRACTED_DIR/template" ]; then
    echo "❌ Failed to extract template from GitHub archive."
    rm -rf "$TMP_DIR"
    exit 1
  fi

  TEMPLATE_DIR="$EXTRACTED_DIR/template"
  echo "  ✓ Downloaded and extracted from GitHub"
  echo ""
fi

# ──────────────────────────────────────────
# 1. Create directories
# ──────────────────────────────────────────
echo "📁 Creating directories..."
for dir in rules agents commands memory hooks; do
  target="${CLAUDE_DIR}/$dir"
  if [ "$DRY_RUN" = true ]; then
    echo "   [DRY RUN] mkdir -p $target"
  else
    mkdir -p "$target"
    echo "  ✓ .claude/$dir/"
  fi
done

# ──────────────────────────────────────────
# 2. Copy template files
# ──────────────────────────────────────────
echo ""
echo "📄 Installing template files..."

# CLAUDE.md (only if not exists)
if [ ! -f "${HOME}/CLAUDE.md" ]; then
  if [ "$DRY_RUN" = true ]; then
    echo "   [DRY RUN] cp $TEMPLATE_DIR/CLAUDE.md $HOME/"
  else
    cp "$TEMPLATE_DIR/CLAUDE.md" "$HOME/"
    echo "  ✓ CLAUDE.md"
  fi
else
  echo "  - CLAUDE.md exists, keeping existing"
fi

# MEMORY.md
if [ "$DRY_RUN" = true ]; then
  echo "   [DRY RUN] cp $TEMPLATE_DIR/MEMORY.md $CLAUDE_DIR/"
else
  cp "$TEMPLATE_DIR/MEMORY.md" "$CLAUDE_DIR/" 2>/dev/null || true
  echo "  ✓ MEMORY.md"
fi

# settings.json (only if not exists)
if [ ! -f "${CLAUDE_DIR}/settings.json" ]; then
  if [ "$DRY_RUN" = true ]; then
    echo "   [DRY RUN] cp $TEMPLATE_DIR/settings.json $CLAUDE_DIR/ (with path replacement)"
  else
    cp "$TEMPLATE_DIR/settings.json" "$CLAUDE_DIR/"
    sed -i "s|__HOME__|${HOME}|g" "${CLAUDE_DIR}/settings.json"
    echo "  ✓ settings.json"
  fi
else
  echo "  - settings.json exists, keeping existing"
fi

# Hooks
for hook in session-start.sh stop.sh export-system.sh; do
  if [ "$DRY_RUN" = true ]; then
    echo "   [DRY RUN] cp $TEMPLATE_DIR/hooks/$hook $CLAUDE_DIR/hooks/"
  else
    if [ -f "$TEMPLATE_DIR/hooks/$hook" ]; then
      cp "$TEMPLATE_DIR/hooks/$hook" "$CLAUDE_DIR/hooks/"
      sed -i "s|__HOME__|${HOME}|g" "${CLAUDE_DIR}/hooks/${hook}" 2>/dev/null || true
      echo "  ✓ hooks/$hook"
    fi
  fi
done

# Rules, agents, commands
for dir in rules agents commands; do
  for file in "$TEMPLATE_DIR/$dir"/*.md; do
    if [ -f "$file" ]; then
      if [ "$DRY_RUN" = true ]; then
        echo "   [DRY RUN] cp $file $CLAUDE_DIR/$dir/"
      else
        cp "$file" "$CLAUDE_DIR/$dir/"
        echo "  ✓ $dir/$(basename "$file")"
      fi
    fi
  done
done

# Memory files (only if not existing — preserve existing learning data)
for file in README.md learned-rules.md evolution-log.md corrections.jsonl observations.jsonl violations.jsonl sessions.jsonl; do
  target="${CLAUDE_DIR}/memory/$file"
  if [ ! -f "$target" ]; then
    if [ "$DRY_RUN" = true ]; then
      echo "   [DRY RUN] cp $TEMPLATE_DIR/memory/$file $target"
    else
      if [ -f "$TEMPLATE_DIR/memory/$file" ]; then
        cp "$TEMPLATE_DIR/memory/$file" "$target"
        echo "  ✓ memory/$file"
      fi
    fi
  else
    echo "  - memory/$file exists, keeping existing"
  fi
done

# ──────────────────────────────────────────
# 3. Set permissions
# ──────────────────────────────────────────
echo ""
echo "🔒 Setting permissions..."
if [ "$DRY_RUN" = true ]; then
  echo "   [DRY RUN] chmod +x $CLAUDE_DIR/hooks/*.sh"
  echo "   [DRY RUN] chmod 600 $CLAUDE_DIR/memory/*.jsonl"
else
  chmod +x "$CLAUDE_DIR/hooks/"*.sh 2>/dev/null && echo "  ✓ hooks/*.sh → executable" || true
  chmod 600 "$CLAUDE_DIR/memory/"*.jsonl 2>/dev/null && echo "  ✓ memory/*.jsonl → 600" || true
fi

# ──────────────────────────────────────────
# Cleanup temp dir (if downloaded from GitHub)
# ──────────────────────────────────────────
if [ "${CLEANUP_TMP}" = true ]; then
  rm -rf "$TMP_DIR"
fi

# ──────────────────────────────────────────
# Done
# ──────────────────────────────────────────
echo ""
if [ "$DRY_RUN" = true ]; then
  echo "✅ Dry run complete — no files were modified"
else
  echo "✅ EvoKit installed successfully!"
fi
echo ""
echo "═══════════════════════════════════════════"
echo "  Next steps:"
echo "  1. Start Claude Code"
echo "  2. Run /boot to verify system health"
echo ""
echo "  💡 Also available via npm: npm install -g @zythegit/evokit"
echo ""
if [ "${CLEANUP_TMP}" = true ]; then
  echo "  Need help?"
  echo "  - Docs:  https://github.com/${REPO}/tree/${BRANCH}/docs"
  echo "  - Issues: https://github.com/${REPO}/issues"
else
  echo "  Need help?"
  echo "  - Docs:  ${SCRIPT_DIR}/docs/"
  echo "  - FAQ:   ${SCRIPT_DIR}/docs/FAQ.md"
fi
echo "═══════════════════════════════════════════"
