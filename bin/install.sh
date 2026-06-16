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
# UI & file-operation helpers (DRY_RUN-aware)
# ════════════════════════════════════════════

_dry()  { echo "   [DRY RUN] $*"; }
_ok()   { echo "  ✓ $1"; }
_skip() { echo "  - $1"; }
_warn() { echo "  ⚠ $1"; }

# Execute a command (or echo in dry-run mode)
_run() {
  if [ "$DRY_RUN" = true ]; then _dry "$@"; return 0; fi
  "$@"
}

# Copy file, optionally substitute __HOME__ → $HOME
_cp() {
  local src="$1" dst="$2" subst="${3:-}"
  if [ "$DRY_RUN" = true ]; then
    _dry "cp $src $dst${subst:+ (with __HOME__ replacement)}"
    return
  fi
  if [ "$subst" = true ]; then sed "s|__HOME__|${HOME}|g" "$src" > "$dst"
  else cp "$src" "$dst"
  fi
}

# Copy only if destination doesn't exist (seed files)
_cp_seed() {
  local src="$1" dst="$2" subst="${3:-}"
  if [ -f "$dst" ]; then _skip "$(basename "$dst") exists, keeping"; return 0; fi
  _cp "$src" "$dst" "$subst" && _ok "$(basename "$dst")"
}

# Copy all files from a template subdirectory
_install_dir() {
  local src="$1" dst="$2" subst="${3:-}"
  [ -d "$src" ] || return 0
  for f in "$src"/*; do
    [ -f "$f" ] || continue
    _cp "$f" "${dst}/$(basename "$f")" "$subst" && _ok "$(basename "$f")"
  done
}

# Seed memory files (only if not existing)
_seed_memory() {
  local src="$1" dst="$2"
  [ -d "$src" ] || return 0
  for f in "$src"/*; do
    [ -f "$f" ] || continue
    _cp_seed "$f" "${dst}/$(basename "$f")"
  done
}

# ── JSON merge helpers (Node.js primary, Python fallback) ────────────
# Priority: node → nodejs → uv+python3 → python3 → python

# Try a single merge runner; appends errors to _MERGE_ERRORS
_run_merge() {
  local name="$1" script="$2" sf="$3" tf="$4"
  local first="${name%% *}"
  command -v "$first" &>/dev/null || return 1

  local stderr stdout ec err
  stderr=$(mktemp 2>/dev/null) || return 1
  # $name intentionally unquoted to support multi-word commands ("uv run --isolated python3")
  # shellcheck disable=SC2086
  stdout=$($name "$script" "$sf" "$tf" 2>"$stderr"); ec=$?
  err=$(head -5 "$stderr" 2>/dev/null | tr '\n' '; ' || true)
  rm -f "$stderr"
  if [ $ec -eq 0 ]; then echo "$stdout"; return 0; fi
  _MERGE_ERRORS+=("'${name}' exit=${ec} stderr=[${err}]")
  return 1
}

merge_settings_json() {
  local settings_file="$1" template_file="$2"
  local js_script="${TEMPLATE_DIR}/merge/merge-settings.js"
  local py_script="${TEMPLATE_DIR}/merge/merge-settings.py"

  local _MERGE_ERRORS=() result

  for runner in "node" "nodejs"; do
    if result=$(_run_merge "$runner" "$js_script" "$settings_file" "$template_file"); then
      echo "$result"; return 0
    fi
  done

  for runner in "uv run --isolated python3" "python3" "python"; do
    if result=$(_run_merge "$runner" "$py_script" "$settings_file" "$template_file"); then
      echo "$result"; return 0
    fi
  done

  local err_msg; err_msg=$(IFS='; '; echo "${_MERGE_ERRORS[*]}")
  echo "ERROR_MERGE_FAILED|${err_msg}"
}

ensure_claude_protocol() {
  local target_file="$1" template_file="$2"
  if [ ! -f "$target_file" ]; then echo "FRESH"; return 0; fi
  if grep -q -F "Self-Evolving System Protocol" "$target_file" 2>/dev/null; then
    echo "SKIPPED"; return 0
  fi
  { echo ""; echo "---"; echo ""; cat "$template_file"; } >> "$target_file"
  echo "APPENDED"
}

ensure_marker_appended() {
  local target_file="$1" template_file="$2" marker="$3"
  if [ ! -f "$target_file" ]; then echo "FRESH"; return 0; fi
  if grep -q -F "$marker" "$target_file" 2>/dev/null; then
    echo "SKIPPED"; return 0
  fi
  { echo ""; echo "---"; echo ""; cat "$template_file"; } >> "$target_file"
  echo "APPENDED"
}

# ── Adapter installation functions ─────────────────────────────────

install_claude() {
  local claude_dir="${HOME}/.claude"

  echo "╔═══════════════════════════════════════════╗"
  echo "║   Installing for Claude Code              ║"
  echo "╚═══════════════════════════════════════════╝"
  echo "  Target: ${claude_dir}${DRY_RUN:+ (DRY RUN)}"
  echo ""

  echo "📁 Creating directories..."
  for dir in rules agents commands memory hooks skills; do
    _run mkdir -p "${claude_dir}/${dir}" && _ok ".claude/${dir}/"
  done

  echo ""
  echo "📄 Installing template files..."

  # CLAUDE.md — merge protocol if exists, otherwise fresh copy
  local claude_result
  claude_result=$(ensure_claude_protocol "${HOME}/CLAUDE.md" "$TEMPLATE_DIR/CLAUDE.md")
  case "$claude_result" in
    FRESH)    _cp "$TEMPLATE_DIR/CLAUDE.md" "${HOME}/CLAUDE.md" && _ok "CLAUDE.md" ;;
    APPENDED) _ok "CLAUDE.md (protocol appended)" ;;
    SKIPPED)  _skip "CLAUDE.md unchanged (protocol already present)" ;;
  esac

  # MEMORY.md
  _cp "$TEMPLATE_DIR/MEMORY.md" "${claude_dir}/MEMORY.md" && _ok "MEMORY.md"

  # settings.json — merge hooks if already exists
  if [ ! -f "${claude_dir}/settings.json" ]; then
    _cp "$TEMPLATE_DIR/settings.json" "${claude_dir}/settings.json" true && _ok "settings.json"
  else
    # Pre-check: if any EvoKit hook event exists, skip merge entirely
    if grep -qE '"SessionStart"|"PreToolUse"|"PostToolUse"|"PreCompact"|"Stop"' \
      "${claude_dir}/settings.json" 2>/dev/null; then
      _skip "settings.json unchanged (hooks already present)"
    else
      local merge_result
      merge_result=$(merge_settings_json "${claude_dir}/settings.json" "$TEMPLATE_DIR/settings.json")
      case "$merge_result" in
        MERGED)  _ok "settings.json (hooks merged)" ;;
        SKIPPED) _skip "settings.json unchanged (hooks already present)" ;;
        ERROR_MERGE_FAILED*)
          _warn "settings.json unchanged — could not merge hooks"
          echo "    Reason: ${merge_result#ERROR_MERGE_FAILED|}"
          ;;
      esac
    fi
  fi

  # Hooks
  for hook in session-start.sh stop.sh export-system.sh pre-tool-use.sh post-tool-use.sh pre-compact.sh dotenv-append.sh; do
    [ -f "$TEMPLATE_DIR/hooks/$hook" ] || continue
    _cp "$TEMPLATE_DIR/hooks/$hook" "${claude_dir}/hooks/${hook}" true && _ok "hooks/${hook}"
  done

  # Rules, agents, commands, skills
  _install_dir "$TEMPLATE_DIR/rules"    "${claude_dir}/rules"
  _install_dir "$TEMPLATE_DIR/agents"   "${claude_dir}/agents"
  _install_dir "$TEMPLATE_DIR/commands" "${claude_dir}/commands"

  # Skills (each skill in its own subdirectory)
  if [ -d "$TEMPLATE_DIR/skills" ]; then
    for skill_entry in "$TEMPLATE_DIR/skills/"*; do
      if [ -d "$skill_entry" ] && [ -f "${skill_entry}/SKILL.md" ]; then
        local skill_name; skill_name=$(basename "$skill_entry")
        _run mkdir -p "${claude_dir}/skills/${skill_name}"
        _cp "${skill_entry}/SKILL.md" "${claude_dir}/skills/${skill_name}/SKILL.md" && _ok "skills/${skill_name}/SKILL.md"
      fi
    done
    [ -f "$TEMPLATE_DIR/skills/README.md" ] && \
      _cp "$TEMPLATE_DIR/skills/README.md" "${claude_dir}/skills/README.md" && _ok "skills/README.md"
  fi

  # Memory files (seed — never overwrite existing)
  _seed_memory "$TEMPLATE_DIR/memory" "${claude_dir}/memory"

  # Permissions
  echo ""
  echo "🔒 Setting permissions..."
  if _run chmod +x "${claude_dir}/hooks/"*.sh 2>/dev/null; then _ok "hooks/*.sh → executable"; fi
  if _run chmod 600 "${claude_dir}/memory/"*.jsonl 2>/dev/null; then _ok "memory/*.jsonl → 600"; fi

  # Ensure shared memory dir exists
  _run mkdir -p "${claude_dir}/memory"

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

  local oc_template="${TEMPLATE_DIR}/opencode"
  if [ ! -f "$oc_template/AGENTS.md" ]; then
    _warn "OpenCode template not found at: $oc_template"; echo "  Skipping OpenCode installation."; return
  fi

  echo "📁 Creating directories..."
  for dir in tools agents memory; do
    _run mkdir -p "${opencode_dir}/${dir}" && _ok ".opencode/${dir}/"
  done

  echo ""
  echo "📄 Installing template files..."

  # AGENTS.md — merge if exists
  local oc_marker="Self-Evolving System Protocol"
  if [ ! -f "${project_dir}/AGENTS.md" ]; then
    _cp "$oc_template/AGENTS.md" "${project_dir}/AGENTS.md" true && _ok "AGENTS.md (project root)"
  elif grep -q -F "$oc_marker" "${project_dir}/AGENTS.md" 2>/dev/null; then
    _skip "AGENTS.md unchanged (protocol already present)"
  else
    if [ "$DRY_RUN" != true ]; then
      local tmp; tmp=$(mktemp)
      sed "s|__HOME__|${HOME}|g" "$oc_template/AGENTS.md" > "$tmp"
      { echo ""; echo "---"; echo ""; cat "$tmp"; } >> "${project_dir}/AGENTS.md"
      rm -f "$tmp"
      _ok "AGENTS.md (protocol appended)"
    else
      _dry "Would append protocol to existing AGENTS.md"
    fi
  fi

  # opencode.json — merge if exists
  if [ ! -f "${project_dir}/opencode.json" ]; then
    _cp "$oc_template/opencode.json" "${project_dir}/opencode.json" && _ok "opencode.json (project root)"
  else
    local oc_json_result
    oc_json_result=$(merge_settings_json "${project_dir}/opencode.json" "$oc_template/opencode.json")
    case "$oc_json_result" in
      MERGED)  _ok "opencode.json (config merged)" ;;
      SKIPPED) _skip "opencode.json unchanged (config already present)" ;;
      ERROR_MERGE_FAILED*)
        _warn "opencode.json unchanged — could not merge config"
        echo "    ${oc_json_result#ERROR_MERGE_FAILED|}"
        ;;
    esac
  fi

  # Tools (with __HOME__), agents, memory
  _install_dir "$oc_template/tools"  "${opencode_dir}/tools"  true
  _install_dir "$oc_template/agents" "${opencode_dir}/agents"
  _seed_memory "$oc_template/memory" "${opencode_dir}/memory"

  echo ""
  echo "🔒 Setting permissions..."
  if _run chmod 644 "${opencode_dir}/tools/"*.ts 2>/dev/null; then _ok "tools/*.ts → readable"; fi

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

  local cx_template="${TEMPLATE_DIR}/codex"
  if [ ! -f "$cx_template/AGENTS.md" ]; then
    _warn "Codex template not found at: $cx_template"; echo "  Skipping Codex installation."; return
  fi

  echo "📁 Creating directories..."
  for dir in rules hooks-scripts memory; do
    _run mkdir -p "${codex_dir}/${dir}" && _ok ".codex/${dir}/"
  done

  echo ""
  echo "📄 Installing Codex template files..."

  # AGENTS.md — merge if exists
  local cx_marker="EvoKit — Self-Evolving System Protocol"
  if [ ! -f "${codex_dir}/AGENTS.md" ]; then
    _cp "$cx_template/AGENTS.md" "${codex_dir}/AGENTS.md" true && _ok "AGENTS.md"
  elif grep -q -F "$cx_marker" "${codex_dir}/AGENTS.md" 2>/dev/null; then
    _skip "AGENTS.md unchanged (protocol already present)"
  else
    if [ "$DRY_RUN" != true ]; then
      local tmp; tmp=$(mktemp)
      sed "s|__HOME__|${HOME}|g" "$cx_template/AGENTS.md" > "$tmp"
      { echo ""; echo "---"; echo ""; cat "$tmp"; } >> "${codex_dir}/AGENTS.md"
      rm -f "$tmp"
      _ok "AGENTS.md (protocol appended)"
    else
      _dry "Would append protocol to existing AGENTS.md"
    fi
  fi

  # hooks.json (with __HOME__ replacement)
  _cp "$cx_template/hooks.json" "${codex_dir}/hooks.json" true && _ok "hooks.json"

  # config.toml — merge if exists
  local cx_toml_result
  cx_toml_result=$(ensure_marker_appended "${codex_dir}/config.toml" "$cx_template/config.toml" "EvoKit — Codex CLI Configuration")
  case "$cx_toml_result" in
    FRESH)    _cp "$cx_template/config.toml" "${codex_dir}/config.toml" && _ok "config.toml" ;;
    APPENDED) _ok "config.toml (EvoKit config appended)" ;;
    SKIPPED)  _skip "config.toml unchanged (EvoKit config already present)" ;;
  esac

  # Rules, hooks-scripts (with __HOME__), memory
  _install_dir "$cx_template/rules"        "${codex_dir}/rules"
  _install_dir "$cx_template/hooks-scripts" "${codex_dir}/hooks-scripts" true
  _seed_memory "$cx_template/memory"       "${codex_dir}/memory"

  # Permissions
  echo ""
  echo "🔒 Setting permissions..."
  if _run chmod +x "${codex_dir}/hooks-scripts/"*.sh 2>/dev/null; then _ok "hooks-scripts/*.sh → executable"; fi

  # Ensure shared Claude memory dir exists for cross-adapter data
  _run mkdir -p "${HOME}/.claude/memory"

  echo ""
  echo "✅ Codex CLI installation complete!"
  echo ""
}

# ── Interactive adapter selection ──────────────────────────────────

_interactive_adapters() {
  local choice tty_available=false

  # Check if /dev/tty is usable (real terminal attached) — use subshell
  # so we don't mess with the calling shell's fd 0.
  (exec < /dev/tty) 2>/dev/null && tty_available=true

  # Non-interactive: neither stdin nor /dev/tty is usable
  if ! [ -t 0 ] && ! $tty_available; then
    echo "  ℹ Non-interactive mode detected, defaulting to Claude Code"
    echo "  ℹ Use --adapter claude,codex,opencode to select specific adapters"
    ADAPTERS="claude"
    return
  fi

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

  # Read input from /dev/tty when stdin is piped, else directly from stdin.
  # Never exec < /dev/tty globally — that corrupts the shell's script-reading fd.
  if [ -t 0 ]; then
    read -r choice
  else
    read -r choice < /dev/tty
  fi

  # Clean input: strip \r (common in curl|bash /dev/tty), commas
  choice="${choice//$'\r'/}"
  choice="${choice//,/ }"
  read -r choice <<< "$choice"

  if [ -z "$choice" ]; then
    echo "  ℹ Defaulting to Claude Code"
    ADAPTERS="claude"
    return
  fi

  # Map choices to adapter names inline
  local result=""
  for c in $choice; do
    case "$c" in
      1) result="${result}${result:+,}claude" ;;
      2) result="${result}${result:+,}codex" ;;
      3) result="${result}${result:+,}opencode" ;;
      4) ADAPTERS="claude,codex,opencode"; return ;;
      5) ADAPTERS="codex,opencode"; return ;;
      *) _warn "Invalid choice: $c (skipped)" ;;
    esac
  done
  ADAPTERS="${result:-claude}"
  [ -z "$result" ] && echo "  ℹ Defaulting to Claude Code"
}

# ════════════════════════════════════════════
# Main
# ════════════════════════════════════════════

# Defaults
SCRIPT_DIR="$(cd "$(dirname "$0")/.." 2>/dev/null && pwd || echo "")"
TEMPLATE_DIR="${SCRIPT_DIR:+${SCRIPT_DIR}/template}"
DRY_RUN=""
TEMPLATE_EXPLICIT=false
ADAPTERS=""
REPO="zyTheGit/EvoKit"
BRANCH="main"

# Parse args
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

if [ -z "$ADAPTERS" ]; then _interactive_adapters; fi
echo "  Selected: ${ADAPTERS//,/, }"
echo ""

# Validate or download template
if [ -z "$TEMPLATE_DIR" ] || [ ! -f "$TEMPLATE_DIR/CLAUDE.md" ]; then
  if [ "$TEMPLATE_EXPLICIT" = true ]; then
    echo "❌ Template not found at: $TEMPLATE_DIR"
    exit 1
  fi

  echo "📦 Downloading EvoKit from GitHub ($REPO:$BRANCH)..."
  TMP_DIR=$(mktemp -d)
  CLEANUP_TMP=true
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

# Install per adapter
IFS=',' read -ra ADAPTER_LIST <<< "$ADAPTERS"
for adapter in "${ADAPTER_LIST[@]}"; do
  case "$adapter" in
    claude)   install_claude ;;
    codex)    install_codex ;;
    opencode) install_opencode ;;
    *)        _warn "Unknown adapter: $adapter (supported: claude, codex, opencode)" ;;
  esac
done

# Cleanup temp dir
if [ "${CLEANUP_TMP}" = true ]; then rm -rf "$TMP_DIR"; fi

# Done
echo ""
if [ "$DRY_RUN" = true ]; then echo "✅ Dry run complete — no files were modified"
else echo "✅ EvoKit installed successfully!"
fi
echo ""
echo "═══════════════════════════════════════════"

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
