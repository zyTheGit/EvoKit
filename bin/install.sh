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

# ── JSON merge helpers (Python) ─────────────────────────────────────
# Used for merging EvoKit hooks into existing settings.json
list_python_commands() {
  # Returns available Python runners in priority order (one per line)
  if command -v uv &>/dev/null; then
    echo "uv run --isolated python3"
  fi
  if command -v python3 &>/dev/null; then
    echo "python3"
  fi
  if command -v python &>/dev/null; then
    echo "python"
  fi
}

merge_settings_json() {
  local settings_file="$1"
  local template_file="$2"

  # Collect all available Python commands
  local py_commands=()
  while IFS= read -r cmd; do
    py_commands+=("$cmd")
  done < <(list_python_commands)

  if [ ${#py_commands[@]} -eq 0 ]; then
    echo "ERROR_NO_PYTHON"
    return 0
  fi

  # Use a temp Python script instead of inline -c to avoid quoting issues
  local py_script
  py_script=$(mktemp)
  cat > "$py_script" << 'PYEOF'
import json, os, sys

def merge_config(settings_path, template_path):
    """Merge template hooks into settings.json. Returns (changed, error_msg)."""
    try:
        home = os.environ.get('HOME', '')

        # Read existing settings
        try:
            with open(settings_path, 'r') as f:
                settings = json.load(f)
        except FileNotFoundError:
            return False, f"File not found: {settings_path}"
        except json.JSONDecodeError as e:
            return False, f"Invalid JSON in {settings_path}: {e}"

        # Read and prepare template
        try:
            with open(template_path, 'r') as f:
                raw = f.read()
        except FileNotFoundError:
            return False, f"Template not found: {template_path}"

        template_raw = raw.replace('__HOME__', home)
        try:
            template = json.loads(template_raw)
        except json.JSONDecodeError as e:
            return False, f"Invalid JSON in template after __HOME__ replacement: {e}"

        changed = False

        # Merge hooks — add only missing hook events
        template_hooks = template.get('hooks', {})
        if template_hooks:
            existing_hooks = settings.get('hooks')
            if not isinstance(existing_hooks, dict):
                existing_hooks = {}
                changed = True
            merged_hooks = dict(existing_hooks)
            for event, hooks_list in template_hooks.items():
                if event not in existing_hooks:
                    merged_hooks[event] = hooks_list
                    changed = True
            if changed:
                settings['hooks'] = merged_hooks

        # Enforce autoMemoryEnabled
        template_auto = template.get('autoMemoryEnabled', True)
        if settings.get('autoMemoryEnabled') != template_auto:
            settings['autoMemoryEnabled'] = template_auto
            changed = True

        # Enforce env settings (CLAUDE_CODE_DISABLE_AUTO_MEMORY)
        template_env = template.get('env', {})
        current_env = settings.get('env', {})
        if not isinstance(current_env, dict):
            current_env = {}
            changed = True
        merged_env = dict(current_env)
        for k, v in template_env.items():
            if current_env.get(k) != v:
                merged_env[k] = v
                changed = True
        settings['env'] = merged_env

        if not changed:
            # Clean up stale .bak.merge if any — ignore failure
            try:
                if os.path.exists(settings_path + '.bak.merge'):
                    os.remove(settings_path + '.bak.merge')
            except OSError:
                pass
            return False, None  # SKIPPED

        # --- Write changes safely ---
        # 1. Write to temp file first
        tmp_path = settings_path + '.merge.tmp'
        try:
            with open(tmp_path, 'w') as f:
                json.dump(settings, f, indent=2)
                f.write('\n')
        except OSError as e:
            return False, f"Cannot write temp file {tmp_path}: {e}"

        # 2. Validate the temp file is valid JSON
        try:
            with open(tmp_path, 'r') as f:
                json.load(f)
        except json.JSONDecodeError as e:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            return False, f"Write validation failed for {tmp_path}: {e}"

        # 3. Backup existing file
        backup_path = settings_path + '.bak.evokit'
        try:
            if os.path.exists(backup_path):
                os.remove(backup_path)
            os.rename(settings_path, backup_path)
        except OSError as e:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            return False, f"Cannot backup {settings_path}: {e}"

        # 4. Atomic rename
        try:
            os.rename(tmp_path, settings_path)
        except OSError as e:
            # Restore from backup
            if os.path.exists(backup_path):
                os.rename(backup_path, settings_path)
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            return False, f"Cannot write {settings_path}: {e}"

        # Clean up stale .bak.merge — ignore failure
        try:
            if os.path.exists(settings_path + '.bak.merge'):
                os.remove(settings_path + '.bak.merge')
        except OSError:
            pass

        return True, None  # MERGED

    except Exception as e:
        return False, f"Unexpected error: {e}"


if __name__ == '__main__':
    settings_path = sys.argv[1]
    template_path = sys.argv[2]
    changed, err = merge_config(settings_path, template_path)
    if err:
        print('ERROR', flush=True)
        sys.stderr.write(f'MERGE_ERROR: {err}\n')
        sys.exit(1)
    elif changed:
        print('MERGED', flush=True)
        sys.exit(0)
    else:
        print('SKIPPED', flush=True)
        sys.exit(0)
PYEOF

  # Try each available Python command in order until one succeeds
  local merge_stdout=""
  local merge_exit=0
  local errors=()

  for py_cmd in "${py_commands[@]}"; do
    local merge_stderr
    merge_stderr=$(mktemp)
    # $py_cmd intentionally unquoted to support multi-word commands like "uv run --isolated python3"
    merge_stdout=$($py_cmd "$py_script" "$settings_file" "$template_file" 2>"$merge_stderr")
    merge_exit=$?

    if [ $merge_exit -eq 0 ]; then
      rm -f "$merge_stderr"
      break  # Success!
    fi

    # Capture error details for this attempt
    local raw_stderr
    raw_stderr=$(cat "$merge_stderr" 2>/dev/null | head -5 | tr '\n' '; ' || true)
    rm -f "$merge_stderr"
    errors+=("'${py_cmd}' exit=${merge_exit} stderr=[${raw_stderr}]")
    merge_stdout=""  # Reset on failure
  done

  rm -f "$py_script"

  if [ $merge_exit -ne 0 ]; then
    # All attempts failed — report all errors
    local err_msg
    err_msg=$(IFS='; '; echo "${errors[*]}")
    echo "ERROR_PYTHON_FAILED|All Python runners failed: ${err_msg}"
  else
    echo "$merge_stdout"
  fi
}

# ── CLAUDE.md protocol check ───────────────────────────────────────
# Appends the Self-Evolving System Protocol if not already present
ensure_claude_protocol() {
  local target_file="$1"
  local template_file="$2"

  # If file doesn't exist at all, signal fresh install
  if [ ! -f "$target_file" ]; then
    echo "FRESH"
    return 0
  fi

  # Check if protocol is already present
  if grep -q -F "Self-Evolving System Protocol" "$target_file" 2>/dev/null; then
    echo "SKIPPED"
    return 0
  fi

  # Append protocol to existing file
  {
    echo ""
    echo "---"
    echo ""
    cat "$template_file"
  } >> "$target_file"

  echo "APPENDED"
}

# ── Generic marker-based append helper ──────────────────────────────
# For markdown/config files: template appended if marker string not found
ensure_marker_appended() {
  local target_file="$1"
  local template_file="$2"
  local marker="$3"

  if [ ! -f "$target_file" ]; then
    echo "FRESH"
    return 0
  fi

  if grep -q -F "$marker" "$target_file" 2>/dev/null; then
    echo "SKIPPED"
    return 0
  fi

  {
    echo ""
    echo "---"
    echo ""
    cat "$template_file"
  } >> "$target_file"

  echo "APPENDED"
}

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

  # CLAUDE.md — merge protocol if already exists, otherwise fresh copy
  local claude_result
  claude_result=$(ensure_claude_protocol "${HOME}/CLAUDE.md" "$TEMPLATE_DIR/CLAUDE.md")
  case "$claude_result" in
    FRESH)
      if [ "$DRY_RUN" = true ]; then
        echo "   [DRY RUN] cp $TEMPLATE_DIR/CLAUDE.md $HOME/"
      else
        cp "$TEMPLATE_DIR/CLAUDE.md" "$HOME/"
        echo "  ✓ CLAUDE.md"
      fi
      ;;
    APPENDED)
      echo "  ✓ CLAUDE.md (protocol appended)"
      ;;
    SKIPPED)
      echo "  - CLAUDE.md unchanged (protocol already present)"
      ;;
  esac

  # MEMORY.md
  if [ "$DRY_RUN" = true ]; then
    echo "   [DRY RUN] cp $TEMPLATE_DIR/MEMORY.md $claude_dir/"
  else
    cp "$TEMPLATE_DIR/MEMORY.md" "$claude_dir/" 2>/dev/null || true
    echo "  ✓ MEMORY.md"
  fi

  # settings.json — merge hooks if already exists, otherwise fresh copy
  if [ ! -f "${claude_dir}/settings.json" ]; then
    if [ "$DRY_RUN" = true ]; then
      echo "   [DRY RUN] cp $TEMPLATE_DIR/settings.json $claude_dir/ (with path replacement)"
    else
      cp "$TEMPLATE_DIR/settings.json" "${claude_dir}/settings.json"
      sed -i "s|__HOME__|${HOME}|g" "${claude_dir}/settings.json"
      echo "  ✓ settings.json"
    fi
  else
    if [ "$DRY_RUN" = true ]; then
      echo "   [DRY RUN] Would merge hooks into existing settings.json"
    else
      local merge_result
      merge_result=$(merge_settings_json "${claude_dir}/settings.json" "$TEMPLATE_DIR/settings.json")
      case "$merge_result" in
        MERGED)
          echo "  ✓ settings.json (hooks merged)"
          ;;
        SKIPPED)
          echo "  - settings.json unchanged (hooks already present)"
          ;;
        ERROR_NO_PYTHON)
          echo "  ⚠ settings.json unchanged — no Python available for JSON merge"
          echo "    Install python3 or uv, then re-run to merge hooks"
          ;;
        ERROR_PYTHON_FAILED*)
          local err_detail="${merge_result#ERROR_PYTHON_FAILED|}"
          echo "  ⚠ settings.json unchanged — could not merge hooks"
          echo "    Reason: ${err_detail}"
          echo "  ℹ Run with bash -x for full traceback"
          ;;
      esac
    fi
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
  if [ "$DRY_RUN" != true ]; then
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

  # 2. AGENTS.md (project root — merge if exists, otherwise fresh copy)
  echo ""
  echo "📄 Installing template files..."
  local oc_agents_marker="Self-Evolving System Protocol"
  if [ ! -f "${project_dir}/AGENTS.md" ]; then
    if [ "$DRY_RUN" = true ]; then
      echo "   [DRY RUN] cp $OPENCODE_TEMPLATE/AGENTS.md ${project_dir}/ (with path replacement)"
    else
      sed "s|__HOME__|${HOME}|g" "$OPENCODE_TEMPLATE/AGENTS.md" > "${project_dir}/AGENTS.md"
      echo "  ✓ AGENTS.md (project root)"
    fi
  elif grep -q -F "$oc_agents_marker" "${project_dir}/AGENTS.md" 2>/dev/null; then
    echo "  - AGENTS.md unchanged (protocol already present)"
  else
    if [ "$DRY_RUN" = true ]; then
      echo "   [DRY RUN] Would append protocol to existing AGENTS.md"
    else
      local oc_agents_tmp
      oc_agents_tmp=$(mktemp)
      sed "s|__HOME__|${HOME}|g" "$OPENCODE_TEMPLATE/AGENTS.md" > "$oc_agents_tmp"
      {
        echo ""
        echo "---"
        echo ""
        cat "$oc_agents_tmp"
      } >> "${project_dir}/AGENTS.md"
      rm -f "$oc_agents_tmp"
      echo "  ✓ AGENTS.md (protocol appended)"
    fi
  fi

  # 3. opencode.json (project root — merge if exists, otherwise fresh copy)
  if [ ! -f "${project_dir}/opencode.json" ]; then
    if [ "$DRY_RUN" = true ]; then
      echo "   [DRY RUN] cp $OPENCODE_TEMPLATE/opencode.json ${project_dir}/"
    else
      cp "$OPENCODE_TEMPLATE/opencode.json" "${project_dir}/"
      echo "  ✓ opencode.json (project root)"
    fi
  else
    if [ "$DRY_RUN" = true ]; then
      echo "   [DRY RUN] Would merge EvoKit config into existing opencode.json"
    else
      local oc_json_result
      oc_json_result=$(merge_settings_json "${project_dir}/opencode.json" "$OPENCODE_TEMPLATE/opencode.json")
      case "$oc_json_result" in
        MERGED)
          echo "  ✓ opencode.json (config merged)"
          ;;
        SKIPPED)
          echo "  - opencode.json unchanged (config already present)"
          ;;
        ERROR_NO_PYTHON)
          echo "  ⚠ opencode.json unchanged — no Python available for JSON merge"
          echo "    Install python3 or uv, then re-run to merge"
          ;;
        ERROR_PYTHON_FAILED*)
          local err_detail="${oc_json_result#ERROR_PYTHON_FAILED|}"
          echo "  ⚠ opencode.json unchanged — could not merge config"
          echo "    ${err_detail}"
          echo "  ℹ Existing file backed up as opencode.json.bak.evokit"
          ;;
      esac
    fi
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
  if [ "$DRY_RUN" != true ]; then
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

  # AGENTS.md (merge if exists, otherwise fresh copy)
  local cx_agents_marker="EvoKit — Self-Evolving System Protocol"
  if [ ! -f "${codex_dir}/AGENTS.md" ]; then
    if [ "$DRY_RUN" = true ]; then
      echo "   [DRY RUN] cp $CODEX_TEMPLATE/AGENTS.md ${codex_dir}/ (with path replacement)"
    else
      sed "s|__HOME__|${HOME}|g" "$CODEX_TEMPLATE/AGENTS.md" > "${codex_dir}/AGENTS.md"
      echo "  ✓ AGENTS.md"
    fi
  elif grep -q -F "$cx_agents_marker" "${codex_dir}/AGENTS.md" 2>/dev/null; then
    echo "  - AGENTS.md unchanged (protocol already present)"
  else
    if [ "$DRY_RUN" = true ]; then
      echo "   [DRY RUN] Would append protocol to existing AGENTS.md"
    else
      local cx_agents_tmp
      cx_agents_tmp=$(mktemp)
      sed "s|__HOME__|${HOME}|g" "$CODEX_TEMPLATE/AGENTS.md" > "$cx_agents_tmp"
      {
        echo ""
        echo "---"
        echo ""
        cat "$cx_agents_tmp"
      } >> "${codex_dir}/AGENTS.md"
      rm -f "$cx_agents_tmp"
      echo "  ✓ AGENTS.md (protocol appended)"
    fi
  fi

  # hooks.json (always copy — upgrade path, with __HOME__ replacement)
  if [ "$DRY_RUN" = true ]; then
    echo "   [DRY RUN] cp $CODEX_TEMPLATE/hooks.json ${codex_dir}/ (with path replacement)"
  else
    sed "s|__HOME__|${HOME}|g" "$CODEX_TEMPLATE/hooks.json" > "${codex_dir}/hooks.json"
    echo "  ✓ hooks.json"
  fi

  # config.toml (merge if exists, otherwise fresh copy)
  local cx_toml_result
  cx_toml_result=$(ensure_marker_appended "${codex_dir}/config.toml" "$CODEX_TEMPLATE/config.toml" "EvoKit — Codex CLI Configuration")
  case "$cx_toml_result" in
    FRESH)
      if [ "$DRY_RUN" = true ]; then
        echo "   [DRY RUN] cp $CODEX_TEMPLATE/config.toml ${codex_dir}/"
      else
        cp "$CODEX_TEMPLATE/config.toml" "${codex_dir}/"
        echo "  ✓ config.toml"
      fi
      ;;
    APPENDED)
      echo "  ✓ config.toml (EvoKit config appended)"
      ;;
    SKIPPED)
      echo "  - config.toml unchanged (EvoKit config already present)"
      ;;
  esac

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
  if [ "$DRY_RUN" != true ]; then
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
DRY_RUN=""
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

