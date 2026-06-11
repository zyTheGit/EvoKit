#!/bin/bash
# SessionStart hook — runs verification at the start of each session
CLAUDE_DIR="${HOME}/.claude"

echo "[EVOLUTION BOOT] ═══════════════════════"
echo "  Self-Evolving System: checking integrity..."

# Check directory structure
for dir in rules agents commands memory hooks; do
  if [ -d "${CLAUDE_DIR}/$dir" ]; then
    echo "  ✓ .claude/$dir/"
  else
    echo "  ✗ .claude/$dir/ — MISSING"
  fi
done

# Check CLAUDE.md line count
CLAUDE_LINES=$(wc -l < "${HOME}/CLAUDE.md" 2>/dev/null || echo 0)
if [ "$CLAUDE_LINES" -le 150 ]; then
  echo "  ✓ CLAUDE.md: ${CLAUDE_LINES} lines (limit 150)"
else
  echo "  ⚠ CLAUDE.md: ${CLAUDE_LINES} lines — EXCEEDS 150 LINE LIMIT"
fi

# Check learned-rules.md line count
if [ -f "${CLAUDE_DIR}/memory/learned-rules.md" ]; then
  RULES_LINES=$(wc -l < "${CLAUDE_DIR}/memory/learned-rules.md")
  if [ "$RULES_LINES" -le 50 ]; then
    echo "  ✓ learned-rules.md: ${RULES_LINES} lines (limit 50)"
  else
    echo "  ⚠ learned-rules.md: ${RULES_LINES} lines — RUN /evolve TO PRUNE"
  fi
fi

# Track session start timestamp (for stop.sh to calculate duration)
date +%s > "${CLAUDE_DIR}/memory/.session_start"

echo "═══════════════════════════════════════"
