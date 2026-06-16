#!/bin/bash
# ════════════════════════════════════════════
# EvoKit — One-click Installer
# Usage:
#   bash bin/install.sh
#   bash bin/install.sh --adapter claude,codex
#   bash bin/install.sh --template /path/to/template
#   bash bin/install.sh --dry-run
#   bash bin/install.sh --branch develop
#   curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash -s -- --branch v0.1.0
# ════════════════════════════════════════════

set -e

# ════════════════════════════════════════════
# Install functions (defined before use)
# ════════════════════════════════════════════

install_claude() {
  local claude_dir="${HOME}/.claude"

  echo "╔═══════════════════════════════════════════╗"
  echo "║   Installing for Claude Code              ║"
  echo "╚═══════════════════════════════════════════╝"
  echo "  Target: ${claude_dir}${DRY_RUN:+ (DRY RUN)}"
  echo ""

  # 1. Create directories
  echo "📁 Creating directories..."
  for dir in rules agents commands memory hooks; do
    local target="${claude_dir}/$dir"
    if [ "$DRY_RUN" = true ]; then
      echo "   [DRY RUN] mkdir -p $target"
    else
      mkdir -p "$target"
      echo "  ✓ .claude/$dir/"
    fi
  done

  # 2. Copy template files
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
    echo "   [DRY RUN] cp $TEMPLATE_DIR/MEMORY.md $claude_dir/"
  else
    cp "$TEMPLATE_DIR/MEMORY.md" "$claude_dir/" 2>/dev/null || true
    echo "  ✓ MEMORY.md"
  fi

  # settings.json (only if not exists)
  if [ ! -f "${claude_dir}/settings.json" ]; then
    if [ "$DRY_RUN" = true ]; then
      echo "   [DRY RUN] cp $TEMPLATE_DIR/settings.json $claude_dir/ (with path replacement)"
    else
      cp "$TEMPLATE_DIR/settings.json" "$claude_dir/"
      sed -i "s|__HOME__|${HOME}|g" "${claude_dir}/settings.json"
      echo "  ✓ settings.json"
    fi
  else
    echo "  - settings.json exists, keeping existing"
  fi

  # Hooks
  for hook in session-start.sh stop.sh export-system.sh; do
    if [ "$DRY_RUN" = true ]; then
      echo "   [DRY RUN] cp $TEMPLATE_DIR/hooks/$hook $claude_dir/hooks/"
    else
      if [ -f "$TEMPLATE_DIR/hooks/$hook" ]; then
        cp "$TEMPLATE_DIR/hooks/$hook" "$claude_dir/hooks/"
        sed -i "s|__HOME__|${HOME}|g" "${claude_dir}/hooks/${hook}" 2>/dev/null || true
        echo "  ✓ hooks/$hook"
      fi
    fi
  done

  # Rules, agents, commands
  for dir in rules agents commands; do
    for file in "$TEMPLATE_DIR/$dir"/*.md; do
      if [ -f "$file" ]; then
        if [ "$DRY_RUN" = true ]; then
          echo "   [DRY RUN] cp $file $claude_dir/$dir/"
        else
          cp "$file" "$claude_dir/$dir/"
          echo "  ✓ $dir/$(basename "$file")"
        fi
      fi
    done
  done

  # Memory files (only if not existing — preserve existing learning data)
  for file in README.md learned-rules.md evolution-log.md corrections.jsonl observations.jsonl violations.jsonl sessions.jsonl; do
    local target="${claude_dir}/memory/$file"
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

  # 3. Set permissions
  echo ""
  echo "🔒 Setting permissions..."
  if [ "$DRY_RUN" = true ]; then
    echo "   [DRY RUN] chmod +x $claude_dir/hooks/*.sh"
    echo "   [DRY RUN] chmod 600 $claude_dir/memory/*.jsonl"
  else
    if chmod +x "$claude_dir/hooks/"*.sh 2>/dev/null; then echo "  ✓ hooks/*.sh → executable"; fi
    if chmod 600 "$claude_dir/memory/"*.jsonl 2>/dev/null; then echo "  ✓ memory/*.jsonl → 600"; fi
  fi

  # Ensure shared memory dir exists
  if [ "$DRY_RUN" = false ]; then
    mkdir -p "${claude_dir}/memory"
  fi

  echo ""
  echo "✅ Claude Code installation complete!"
  echo ""
}

install_codex() {
  local codex_dir="${CODEX_HOME:-${HOME}/.codex}"

  echo "╔═══════════════════════════════════════════╗"
  echo "║   Installing for Codex CLI                 ║"
  echo "╚═══════════════════════════════════════════╝"
  echo "  Target: ${codex_dir}${DRY_RUN:+ (DRY RUN)}"
  echo ""

  local CODEX_TEMPLATE="${TEMPLATE_DIR}/codex"

  if [ ! -f "$CODEX_TEMPLATE/AGENTS.md" ]; then
    echo "⚠ Codex template not found at: $CODEX_TEMPLATE"
    echo "  Skipping Codex installation."
    return
  fi

  # 1. Create directories
  echo "📁 Creating directories..."
  for dir in rules hooks-scripts memory; do
    local target="${codex_dir}/$dir"
    if [ "$DRY_RUN" = true ]; then
      echo "   [DRY RUN] mkdir -p $target"
    else
      mkdir -p "$target"
      echo "  ✓ .codex/$dir/"
    fi
  done

  # 2. Copy template files
  echo ""
  echo "📄 Installing Codex template files..."

  # AGENTS.md (only if not exists)
  if [ ! -f "${codex_dir}/AGENTS.md" ]; then
    if [ "$DRY_RUN" = true ]; then
      echo "   [DRY RUN] cp $CODEX_TEMPLATE/AGENTS.md ${codex_dir}/ (with path replacement)"
    else
      sed "s|__HOME__|${HOME}|g" "$CODEX_TEMPLATE/AGENTS.md" > "${codex_dir}/AGENTS.md"
      echo "  ✓ AGENTS.md"
    fi
  else
    echo "  - AGENTS.md exists, keeping existing"
  fi

  # hooks.json (always copy — upgrade path, with __HOME__ replacement)
  if [ "$DRY_RUN" = true ]; then
    echo "   [DRY RUN] cp $CODEX_TEMPLATE/hooks.json ${codex_dir}/ (with path replacement)"
  else
    sed "s|__HOME__|${HOME}|g" "$CODEX_TEMPLATE/hooks.json" > "${codex_dir}/hooks.json"
    echo "  ✓ hooks.json"
  fi

  # config.toml (only if not exists)
  if [ ! -f "${codex_dir}/config.toml" ]; then
    if [ "$DRY_RUN" = true ]; then
      echo "   [DRY RUN] cp $CODEX_TEMPLATE/config.toml ${codex_dir}/"
    else
      cp "$CODEX_TEMPLATE/config.toml" "${codex_dir}/"
      echo "  ✓ config.toml"
    fi
  else
    echo "  - config.toml exists, keeping existing"
  fi

  # Rules (always copy — upgrade path)
  if [ -d "$CODEX_TEMPLATE/rules" ]; then
    for rule_file in "$CODEX_TEMPLATE/rules"/*.rules; do
      if [ -f "$rule_file" ]; then
        if [ "$DRY_RUN" = true ]; then
          echo "   [DRY RUN] cp $rule_file ${codex_dir}/rules/"
        else
          cp "$rule_file" "${codex_dir}/rules/"
          echo "  ✓ rules/$(basename "$rule_file")"
        fi
      fi
    done
  fi

  # Hook scripts (always copy, with __HOME__ replacement)
  if [ -d "$CODEX_TEMPLATE/hooks-scripts" ]; then
    for script in "$CODEX_TEMPLATE/hooks-scripts"/*.sh; do
      if [ -f "$script" ]; then
        if [ "$DRY_RUN" = true ]; then
          echo "   [DRY RUN] cp $script ${codex_dir}/hooks-scripts/ (with path replacement)"
        else
          sed "s|__HOME__|${HOME}|g" "$script" > "${codex_dir}/hooks-scripts/$(basename "$script")"
          echo "  ✓ hooks-scripts/$(basename "$script")"
        fi
      fi
    done
  fi

  # Memory seed files (only if not exists)
  if [ -d "$CODEX_TEMPLATE/memory" ]; then
    for mem_file in "$CODEX_TEMPLATE/memory"/*.md; do
      if [ -f "$mem_file" ]; then
        local mem_target="${codex_dir}/memory/$(basename "$mem_file")"
        if [ ! -f "$mem_target" ]; then
          if [ "$DRY_RUN" = true ]; then
            echo "   [DRY RUN] cp $mem_file $mem_target"
          else
            cp "$mem_file" "$mem_target"
            echo "  ✓ memory/$(basename "$mem_file")"
          fi
        else
          echo "  - memory/$(basename "$mem_file") exists, keeping existing"
        fi
      fi
    done
  fi

  # 3. Set permissions
  echo ""
  echo "🔒 Setting permissions..."
  if [ "$DRY_RUN" = true ]; then
    echo "   [DRY RUN] chmod +x ${codex_dir}/hooks-scripts/*.sh"
  else
    if chmod +x "${codex_dir}/hooks-scripts/"*.sh 2>/dev/null; then echo "  ✓ hooks-scripts/*.sh → executable"; fi
  fi

  # Ensure shared Claude memory dir exists for cross-adapter data
  if [ "$DRY_RUN" = false ]; then
    mkdir -p "${HOME}/.claude/memory"
  fi

  echo ""
  echo "✅ Codex CLI installation complete!"
  echo ""
}

# ──────────────────────────────────────────
# Defaults
# ──────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")/.." 2>/dev/null && pwd || echo "")"
TEMPLATE_DIR="${SCRIPT_DIR:+${SCRIPT_DIR}/template}"
DRY_RUN=false
CLAUDE_DIR="${HOME}/.claude"
TEMPLATE_EXPLICIT=false
ADAPTERS=""

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
    --adapter)  ADAPTERS="$2"; shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

echo "╔═══════════════════════════════════════════╗"
echo "║   EvoKit — Self-Evolving System Install   ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# ──────────────────────────────────────────
# Adapter selection
# ──────────────────────────────────────────
if [ -z "$ADAPTERS" ]; then
  # Check if we're in an interactive terminal
  if [ -t 0 ]; then
    echo "Select AI assistants to configure:"
    echo ""
    echo "  [1] Claude Code  (recommended)  — ~/.claude/"
    echo "  [2] Codex CLI    (v0.3.0)       — ~/.codex/"
    echo "  [3] All of the above"
    echo "  [4] Codex CLI only"
    echo ""
    read -p "  Choice (e.g. 1 2 for multiple): " -r choice_input
    echo ""

    ADAPTERS=""
    for c in $choice_input; do
      case "$c" in
        1|2|3|4) ;;
        *) echo "  ⚠ Invalid choice: $c (skipped)";;
      esac
    done

    # Parse choices into adapter list
    if echo "$choice_input" | grep -q "3"; then
      ADAPTERS="claude,codex"
    elif echo "$choice_input" | grep -q "4"; then
      ADAPTERS="codex"
    else
      if echo "$choice_input" | grep -q "1"; then
        ADAPTERS="${ADAPTERS}claude"
      fi
      if echo "$choice_input" | grep -q "2"; then
        ADAPTERS="${ADAPTERS},codex"
      fi
    fi
    ADAPTERS="${ADAPTERS#,}"

    if [ -z "$ADAPTERS" ]; then
      echo "  ℹ No selection made, defaulting to Claude Code"
      ADAPTERS="claude"
    fi
  else
    # Non-interactive (curl | bash) — default to Claude only
    ADAPTERS="claude"
  fi
fi

echo "  Selected: $(echo "$ADAPTERS" | sed 's/,/, /g')"
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
# Install per adapter
# ──────────────────────────────────────────
IFS=',' read -ra ADAPTER_LIST <<< "$ADAPTERS"
for adapter in "${ADAPTER_LIST[@]}"; do
  case "$adapter" in
    claude) install_claude ;;
    codex)  install_codex ;;
    *)      echo "⚠ Unknown adapter: $adapter (supported: claude, codex)" ;;
  esac
done

# ──────────────────────────────────────────
# Cleanup temp dir
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

# Show per-adapter next steps
for adapter in "${ADAPTER_LIST[@]}"; do
  case "$adapter" in
    claude)
      echo "  📖 Claude Code:"
      echo "    1. Start Claude Code"
      echo "    2. Run /boot to verify"
      echo ""
      ;;
    codex)
      echo "  📖 Codex CLI:"
      echo "    1. Start Codex (hooks run automatically)"
      echo "    2. Run: evokit doctor --adapter codex"
      echo ""
      ;;
  esac
done

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

