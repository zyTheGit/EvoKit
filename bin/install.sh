#!/bin/bash
# ════════════════════════════════════════════
# EvoKit — One-click Installer
# Usage:
#   bash bin/install.sh
#   bash bin/install.sh --adapter claude,codex,opencode
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
  for dir in rules agents commands memory hooks skills; do
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
  for hook in session-start.sh stop.sh export-system.sh pre-tool-use.sh post-tool-use.sh pre-compact.sh; do
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

  # Skills (always copy, upgrade path)
  if [ -d "$TEMPLATE_DIR/skills" ]; then
    for skill_entry in "$TEMPLATE_DIR/skills/"*; do
      if [ -d "$skill_entry" ] && [ -f "${skill_entry}/SKILL.md" ]; then
        skill_name=$(basename "$skill_entry")
        if [ "$DRY_RUN" = true ]; then
          echo "   [DRY RUN] cp -r $skill_entry $claude_dir/skills/$skill_name/"
        else
          mkdir -p "$claude_dir/skills/$skill_name"
          cp "${skill_entry}/SKILL.md" "$claude_dir/skills/$skill_name/"
          echo "  ✓ skills/$skill_name/SKILL.md"
        fi
      fi
    done
    # Copy skills README
    if [ -f "$TEMPLATE_DIR/skills/README.md" ]; then
      if [ "$DRY_RUN" = true ]; then
        echo "   [DRY RUN] cp $TEMPLATE_DIR/skills/README.md $claude_dir/skills/"
      else
        cp "$TEMPLATE_DIR/skills/README.md" "$claude_dir/skills/"
        echo "  ✓ skills/README.md"
      fi
    fi
  fi

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

install_opencode() {
  local project_dir="${PWD}"
  local opencode_dir="${project_dir}/.opencode"

  echo "╔═══════════════════════════════════════════╗"
  echo "║   Installing for OpenCode CLI             ║"
  echo "╚═══════════════════════════════════════════╝"
  echo "  Target: ${opencode_dir}${DRY_RUN:+ (DRY RUN)}"
  echo "  AGENTS.md + opencode.json → project root"
  echo ""

  local OPENCODE_TEMPLATE="${TEMPLATE_DIR}/opencode"

  if [ ! -f "$OPENCODE_TEMPLATE/AGENTS.md" ]; then
    echo "⚠ OpenCode template not found at: $OPENCODE_TEMPLATE"
    echo "  Skipping OpenCode installation."
    return
  fi

  # 1. Create directories
  echo "📁 Creating directories..."
  for dir in tools agents memory; do
    local target="${opencode_dir}/$dir"
    if [ "$DRY_RUN" = true ]; then
      echo "   [DRY RUN] mkdir -p $target"
    else
      mkdir -p "$target"
      echo "  ✓ .opencode/$dir/"
    fi
  done

  # 2. AGENTS.md (project root, only if not exists)
  echo ""
  echo "📄 Installing template files..."
  if [ ! -f "${project_dir}/AGENTS.md" ]; then
    if [ "$DRY_RUN" = true ]; then
      echo "   [DRY RUN] cp $OPENCODE_TEMPLATE/AGENTS.md ${project_dir}/ (with path replacement)"
    else
      sed "s|__HOME__|${HOME}|g" "$OPENCODE_TEMPLATE/AGENTS.md" > "${project_dir}/AGENTS.md"
      echo "  ✓ AGENTS.md (project root)"
    fi
  else
    echo "  - AGENTS.md exists, keeping existing"
  fi

  # 3. opencode.json (project root, only if not exists)
  if [ ! -f "${project_dir}/opencode.json" ]; then
    if [ "$DRY_RUN" = true ]; then
      echo "   [DRY RUN] cp $OPENCODE_TEMPLATE/opencode.json ${project_dir}/"
    else
      cp "$OPENCODE_TEMPLATE/opencode.json" "${project_dir}/"
      echo "  ✓ opencode.json (project root)"
    fi
  else
    echo "  - opencode.json exists, keeping existing"
  fi

  # 4. Tools (always copy — upgrade path, with __HOME__)
  if [ -d "$OPENCODE_TEMPLATE/tools" ]; then
    for tool_file in "$OPENCODE_TEMPLATE/tools"/*.ts; do
      if [ -f "$tool_file" ]; then
        if [ "$DRY_RUN" = true ]; then
          echo "   [DRY RUN] cp $tool_file ${opencode_dir}/tools/ (with path replacement)"
        else
          sed "s|__HOME__|${HOME}|g" "$tool_file" > "${opencode_dir}/tools/$(basename "$tool_file")"
          echo "  ✓ tools/$(basename "$tool_file")"
        fi
      fi
    done
  fi

  # 5. Agents (always copy — upgrade path)
  if [ -d "$OPENCODE_TEMPLATE/agents" ]; then
    for agent_file in "$OPENCODE_TEMPLATE/agents"/*.md; do
      if [ -f "$agent_file" ]; then
        if [ "$DRY_RUN" = true ]; then
          echo "   [DRY RUN] cp $agent_file ${opencode_dir}/agents/"
        else
          cp "$agent_file" "${opencode_dir}/agents/"
          echo "  ✓ agents/$(basename "$agent_file")"
        fi
      fi
    done
  fi

  # 6. Memory seed files (only if not exists)
  if [ -d "$OPENCODE_TEMPLATE/memory" ]; then
    for mem_file in "$OPENCODE_TEMPLATE/memory"/*.md; do
      if [ -f "$mem_file" ]; then
        local mem_target
        mem_target="${opencode_dir}/memory/$(basename "$mem_file")"
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

  # 7. Set permissions
  echo ""
  echo "🔒 Setting permissions..."
  if [ "$DRY_RUN" = false ]; then
    chmod 644 "${opencode_dir}/tools/"*.ts 2>/dev/null || true
    echo "  ✓ tools/*.ts → readable"
  fi

  echo ""
  echo "✅ OpenCode CLI installation complete!"
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
        local mem_target
        mem_target="${codex_dir}/memory/$(basename "$mem_file")"
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
  # Save original stdin, try to redirect from /dev/tty for interactive prompt
  # This works under curl | bash where stdin is a pipe, not a terminal
  exec 3<&0
  if exec < /dev/tty 2>/dev/null; then
    echo ""
    echo "  ┌─────────────────────────────────────────────┐"
    echo "  │  Select AI assistants to configure:          │"
    echo "  ├─────────────────────────────────────────────┤"
    echo "  │                                             │"
    echo "  │  [1] Claude Code (recommended)  ~/.claude/  │"
    echo "  │  [2] Codex CLI (v0.3.0)         ~/.codex/   │"
    echo "  │  [3] OpenCode CLI (v0.4.0)      .opencode/  │"
    echo "  │                                             │"
    echo "  │  [4] All of the above                       │"
    echo "  │  [5] Codex CLI + OpenCode                   │"
    echo "  │                                             │"
    echo "  │  Enter numbers separated by spaces.          │"
    echo "  │  Press ENTER for default: [1] Claude Code    │"
    echo "  └─────────────────────────────────────────────┘"
    echo ""
    echo -n "  → "
    read -r choice_input
    echo ""
    # Restore original stdin
    exec 0<&3 3<&-

    # Clean input: strip \r (common in curl|bash /dev/tty mode), commas, and extra whitespace
    # \r gets captured by read -r from /dev/tty in some terminal modes
    choice_input="${choice_input//$'\r'/}"
    choice_input="${choice_input//,/ }"
    # Trim leading/trailing whitespace
    read -r choice_input <<< "$choice_input"

    # Default if empty
    if [ -z "$choice_input" ]; then
      choice_input="1"
      echo "  ℹ Defaulting to Claude Code"
      echo ""
    fi

    # Validate choices — collect only valid numbers 1-5
    ADAPTERS=""
    for c in $choice_input; do
      case "$c" in
        1|2|3|4|5)
          ADAPTERS="${ADAPTERS}${ADAPTERS:+,}${c}"
          ;;
        *)
          echo "  ⚠ Invalid choice: $c (skipped)"
          ;;
      esac
    done

    # Convert validated numbers to adapter names using ONLY the validated ADAPTERS variable
    if echo "$ADAPTERS" | grep -q "4"; then
      ADAPTERS="claude,codex,opencode"
    elif echo "$ADAPTERS" | grep -q "5"; then
      ADAPTERS="codex,opencode"
    else
      _tmp=""
      if echo "$ADAPTERS" | grep -q "1"; then _tmp="${_tmp}claude"; fi
      if echo "$ADAPTERS" | grep -q "2"; then _tmp="${_tmp}${_tmp:+,}codex"; fi
      if echo "$ADAPTERS" | grep -q "3"; then _tmp="${_tmp}${_tmp:+,}opencode"; fi
      ADAPTERS="$_tmp"
    fi

    if [ -z "$ADAPTERS" ]; then
      echo "  ℹ No valid selection made, defaulting to Claude Code"
      ADAPTERS="claude"
    fi
  else
    exec 0<&3 3<&-
    # No terminal available (CI, cron, etc.) — default to Claude only
    echo "  ℹ Non-interactive mode detected, defaulting to Claude Code"
    echo "  ℹ Use --adapter claude,codex,opencode to select specific adapters"
    ADAPTERS="claude"
  fi
fi

echo "  Selected: ${ADAPTERS//,/, }"
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
    claude)   install_claude ;;
    codex)    install_codex ;;
    opencode) install_opencode ;;
    *)        echo "⚠ Unknown adapter: $adapter (supported: claude, codex, opencode)" ;;
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
    opencode)
      echo "  📖 OpenCode CLI:"
      echo "    1. cd to project and start OpenCode"
      echo "    2. Run evokit-boot tool to verify"
      echo "    3. Call evokit-session before finishing each session"
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

