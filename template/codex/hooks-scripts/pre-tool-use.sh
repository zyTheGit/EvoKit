#!/bin/bash
# EvoKit — Codex CLI PreToolUse Hook
# Injects learned rules context in additionalContext for safe tool use.
# Installed by: evokit init --adapter codex

set -e

HOME_DIR="${HOME}"
LEARNED_RULES="${HOME_DIR}/.claude/memory/learned-rules.md"

if [ -f "$LEARNED_RULES" ] && [ -s "$LEARNED_RULES" ]; then
  RULES_CONTENT=$(cat "$LEARNED_RULES")
  cat <<EOF
{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"EvoKit learned rules for this session:\n${RULES_CONTENT}\n"}}
EOF
fi

exit 0
