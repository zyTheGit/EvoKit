#!/bin/bash
# SessionStart hook — runs verification at the start of each session
CLAUDE_DIR="${HOME}/.claude"

echo "[EVOLUTION BOOT] ═══════════════════════"
echo "  Self-Evolving System: checking integrity..."

# ── 1. Directory structure ──
ALL_OK=true
for dir in rules agents commands memory hooks skills; do
  if [ -d "${CLAUDE_DIR}/$dir" ]; then
    echo "  ✓ .claude/$dir/"
  else
    if [ "$dir" = "skills" ]; then
      echo "  - .claude/$dir/ (optional, not found)"
    else
      echo "  ✗ .claude/$dir/ — MISSING"
      ALL_OK=false
    fi
  fi
done

# ── 2. File presence ──
for file in settings.json MEMORY.md; do
  if [ -f "${CLAUDE_DIR}/$file" ]; then
    echo "  ✓ .claude/$file"
  else
    echo "  ⚠ .claude/$file — MISSING"
    ALL_OK=false
  fi
done

# ── 3. CLAUDE.md line count ──
CLAUDE_LINES=$(wc -l < "${HOME}/CLAUDE.md" 2>/dev/null || echo 0)
if [ "$CLAUDE_LINES" -le 150 ]; then
  echo "  ✓ CLAUDE.md: ${CLAUDE_LINES} lines (limit 150)"
else
  echo "  🔴 CLAUDE.md: ${CLAUDE_LINES} lines — EXCEEDS 150 LINE LIMIT (HARD VIOLATION)"
fi

# ── 4. learned-rules.md line count & verify lines ──
if [ -f "${CLAUDE_DIR}/memory/learned-rules.md" ]; then
  RULES_LINES=$(wc -l < "${CLAUDE_DIR}/memory/learned-rules.md")
  if [ "$RULES_LINES" -le 50 ]; then
    echo "  ✓ learned-rules.md: ${RULES_LINES} lines (limit 50)"
  else
    echo "  ⚠ learned-rules.md: ${RULES_LINES} lines — RUN /evolve TO PRUNE"
  fi
  # Check that each rule has a verify line
  VERIFY_COUNT=$(grep -c '<!-- verify:' "${CLAUDE_DIR}/memory/learned-rules.md" 2>/dev/null || echo 0)
  RULE_COUNT=$(grep -c '^- \*\*' "${CLAUDE_DIR}/memory/learned-rules.md" 2>/dev/null || echo 0)
  if [ "$RULE_COUNT" -gt 0 ] && [ "$VERIFY_COUNT" -eq 0 ]; then
    echo "  ⚠ learned-rules.md: ${RULE_COUNT} rule(s) found but NO verify lines — each rule needs a <!-- verify: ... --> comment"
  elif [ "$RULE_COUNT" -gt "$VERIFY_COUNT" ]; then
    echo "  ⚠ learned-rules.md: ${RULE_COUNT} rules but only ${VERIFY_COUNT} verify lines"
  else
    echo "  ✓ Rules verified: ${RULE_COUNT} rules, ${VERIFY_COUNT} verify lines"
  fi
fi

# ── 5. Agent definitions ──
AGENT_COUNT=0
for agent_file in "${CLAUDE_DIR}/agents/"*.md; do
  if [ -f "$agent_file" ]; then
    AGENT_COUNT=$((AGENT_COUNT + 1))
  fi
done
echo "  ✓ Agents: ${AGENT_COUNT} defined"

# ── 6. Hook executability ──
HOOK_ERRORS=0
for hook_file in "${CLAUDE_DIR}/hooks/"*.sh; do
  if [ -f "$hook_file" ] && [ ! -x "$hook_file" ]; then
    echo "  ⚠ ${hook_file} — not executable"
    HOOK_ERRORS=$((HOOK_ERRORS + 1))
  fi
done
if [ "$HOOK_ERRORS" -eq 0 ]; then
  echo "  ✓ Hook permissions: OK"
fi

# ── 7. Skills directory (optional) ──
SKILL_COUNT=0
if [ -d "${CLAUDE_DIR}/skills" ]; then
  for skill_entry in "${CLAUDE_DIR}/skills/"*/SKILL.md; do
    if [ -f "$skill_entry" ]; then
      SKILL_COUNT=$((SKILL_COUNT + 1))
    fi
  done
  if [ "$SKILL_COUNT" -gt 0 ]; then
    echo "  ✓ Skills: ${SKILL_COUNT} defined"
  fi
fi

# ── 8. Auto-memory status ──
if [ -d "${HOME}/.claude/projects" ]; then
  PROJECT_COUNT=$(find "${HOME}/.claude/projects" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l)
  if [ "$PROJECT_COUNT" -gt 0 ]; then
    echo "  ✓ Auto-memory projects: ${PROJECT_COUNT}"
  fi
fi

# ── Summary ──
if [ "$ALL_OK" = true ]; then
  echo "═══════════════════════════════════════"
else
  echo "⚠ Some checks failed — review issues above."
  echo "═══════════════════════════════════════"
fi

# Track session start timestamp (for stop.sh to calculate duration)
date +%s > "${CLAUDE_DIR}/memory/.session_start"
