#!/bin/bash
# EvoKit — Codex CLI SessionStart Hook
# Verifies system integrity and loads learning data context.
# Installed by: evokit init --adapter codex

set -e

HOME_DIR="${HOME}"
CLAUDE_MEMORY="${HOME_DIR}/.claude/memory"
CODEX_DIR="${HOME_DIR}/.codex"

# ── Integrity Checks ─────────────────────────
PASS=0
FAIL=0
WARN=0

check() {
  local name="$1"
  local result="$2"
  if [ "$result" = "pass" ]; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  elif [ "$result" = "warn" ]; then
    echo "  ⚠ $name"
    WARN=$((WARN + 1))
  else
    echo "  ✗ $name"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║   EvoKit — Self-Evolving System (Codex)  ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# Check Codex home
check ".codex/" "$([ -d "$CODEX_DIR" ] && echo "pass" || echo "fail")"
check ".codex/hooks.json" "$([ -f "$CODEX_DIR/hooks.json" ] && echo "pass" || echo "fail")"
check ".codex/AGENTS.md" "$([ -f "$CODEX_DIR/AGENTS.md" ] && echo "pass" || echo "fail")"

# Check shared memory
check ".claude/memory/" "$([ -d "$CLAUDE_MEMORY" ] && echo "pass" || echo "fail")"
check "corrections.jsonl" "$([ -f "$CLAUDE_MEMORY/corrections.jsonl" ] && echo "pass" || echo "warn" || echo "pass")"
check "learned-rules.md" "$([ -f "$CLAUDE_MEMORY/learned-rules.md" ] && echo "pass" || echo "warn")"

# learned-rules.md line limit check
if [ -f "$CLAUDE_MEMORY/learned-rules.md" ]; then
  LINES=$(wc -l < "$CLAUDE_MEMORY/learned-rules.md")
  if [ "$LINES" -le 50 ]; then
    check "learned-rules.md: ${LINES} lines (limit 50)" "pass"
  else
    check "learned-rules.md: ${LINES} lines (limit 50)" "fail"
  fi
fi

echo ""
echo "═══════════════════════════════════════════"
echo "  Integrity: ${PASS} passed, ${WARN} warnings, ${FAIL} failed"
if [ "$FAIL" -gt 0 ]; then
  echo "  Run \`evokit doctor\` for detailed diagnostics."
fi
echo "═══════════════════════════════════════════"
echo ""

exit 0
