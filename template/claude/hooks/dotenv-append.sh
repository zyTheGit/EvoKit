#!/bin/bash
# DotenvAppend hook — runs after --dotenv loads .env, before env vars are applied
# Called by settings.json:DotenvAppend → *
# Output KEY=VALUE lines to stdout; they are merged into the environment,
# taking precedence over values loaded by --dotenv.
#
# Use this to re-apply env vars that hooks set but --dotenv later overwrote,
# or to dynamically compute env vars that --dotenv cannot express.

# Read the hook event info from stdin (JSON) — includes current env snapshot
INPUT=$(cat)

# ═══════════════════════════════════════
# 1. Detect tool availability and export as env vars
#    These won't be overwritten by --dotenv
# ═══════════════════════════════════════

# Ensure uv is in PATH if installed
if command -v uv &>/dev/null; then
  echo "EVOKIT_UV_AVAILABLE=1"
else
  echo "EVOKIT_UV_AVAILABLE=0"
fi

# Ensure fnm is noted (if used)
if command -v fnm &>/dev/null || [ -d "${HOME}/.local/share/fnm" ]; then
  echo "EVOKIT_FNM_AVAILABLE=1"
else
  echo "EVOKIT_FNM_AVAILABLE=0"
fi

# ═══════════════════════════════════════
# 2. Re-apply critical env vars that hooks may have set
#    but --dotenv overwrote.  Uncomment and customize:
# ═══════════════════════════════════════
# echo "MY_CRITICAL_VAR=value"

# ═══════════════════════════════════════
# 3. Detect project-specific Python env
# ═══════════════════════════════════════
# If uv is active, note the Python version for tooling
if command -v uv &>/dev/null && uv run --isolated python3 --version &>/dev/null; then
  PY_VER=$(uv run --isolated python3 --version 2>/dev/null | awk '{print $2}')
  echo "EVOKIT_PYTHON_VERSION=${PY_VER}"
fi

exit 0
