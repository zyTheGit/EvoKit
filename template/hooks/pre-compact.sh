#!/bin/bash
# PreCompact hook — saves a learning state snapshot before context compaction
# Called by settings.json:PreCompact → manual|auto
# This prevents loss of important learning context during compaction

CLAUDE_DIR="${HOME}/.claude"
MEMORY_DIR="${CLAUDE_DIR}/memory"
SNAPSHOT_FILE="${MEMORY_DIR}/.compact_state"

# Read the event info from stdin (JSON)
INPUT=$(cat)
MATCHER=$(echo "$INPUT" | jq -r '.matcher // empty' 2>/dev/null || echo "unknown")

# ═══════════════════════════════════════
# 1. Save a snapshot of current learning state
# ═══════════════════════════════════════
{
    echo "{\"timestamp\":\"$(date -Iseconds)\",\"event\":\"pre_compact\",\"trigger\":\"$MATCHER\",\"corrections\":$(wc -l < "${MEMORY_DIR}/corrections.jsonl" 2>/dev/null || echo 0),\"observations\":$(wc -l < "${MEMORY_DIR}/observations.jsonl" 2>/dev/null || echo 0),\"sessions\":$(wc -l < "${MEMORY_DIR}/sessions.jsonl" 2>/dev/null || echo 0)}"
} > "$SNAPSHOT_FILE"

# ═══════════════════════════════════════
# 2. Check learned-rules.md integrity
# ═══════════════════════════════════════
if [ -f "${MEMORY_DIR}/learned-rules.md" ]; then
    RULES_LINES=$(wc -l < "${MEMORY_DIR}/learned-rules.md")
    if [ "$RULES_LINES" -gt 50 ]; then
        echo 1>&2 "⚠ PreCompact: learned-rules.md is $RULES_LINES lines (limit 50). Run /evolve to prune."
    fi
fi

# ═══════════════════════════════════════
# 3. Check for unrecorded corrections
# ═══════════════════════════════════════
# If corrections exist and haven't been processed recently, remind user
if [ -f "${MEMORY_DIR}/corrections.jsonl" ]; then
    CORR_COUNT=$(wc -l < "${MEMORY_DIR}/corrections.jsonl")
    if [ "$CORR_COUNT" -ge 2 ]; then
        echo 1>&2 "ℹ PreCompact: $CORR_COUNT pending corrections. Run /evolve to promote patterns to learned rules."
    fi
fi

exit 0
