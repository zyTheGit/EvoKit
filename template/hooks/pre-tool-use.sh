#!/bin/bash
# PreToolUse hook — blocks dangerous commands and injects learned rules as context
# Called by settings.json:PreToolUse → Bash
# Exit code 0 = allow, exit code 2 = block

CLAUDE_DIR="${HOME}/.claude"
MEMORY_DIR="${CLAUDE_DIR}/memory"

# Read the tool input from stdin (JSON)
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")

# ═══════════════════════════════════════
# 1. Block dangerous commands (belt + suspenders for settings.json deny)
# ═══════════════════════════════════════
if [ -n "$CMD" ]; then
    # Pattern-based blocking — exit code 2 blocks the operation
    BLOCKED=false

    # Pattern: rm -rf on critical paths
    RM_RF_PATTERN="(^|[;&|])\\s*rm\\s+-rf\\s+(\\/|~\\/\\.|\\\$HOME\\/\\.)"
    if echo "$CMD" | grep -qE "$RM_RF_PATTERN"; then
        echo "BLOCKED: rm -rf on protected path is not allowed" >&2
        BLOCKED=true
    fi

    # Pattern: git push --force
    if echo "$CMD" | grep -qE 'git\s+push\s+.*(--force|-f)\b'; then
        echo "BLOCKED: git push --force is not allowed (use --force-with-lease instead)" >&2
        BLOCKED=true
    fi

    # Pattern: git reset --hard (destructive)
    if echo "$CMD" | grep -qE 'git\s+reset\s+--hard\b'; then
        echo "BLOCKED: git reset --hard is not allowed (use git reset --soft or --mixed)" >&2
        BLOCKED=true
    fi

    # Pattern: chmod -R dangerous
    if echo "$CMD" | grep -qE 'chmod\s+-R\s+777\b'; then
        echo "BLOCKED: chmod -R 777 is a security risk" >&2
        BLOCKED=true
    fi

    if [ "$BLOCKED" = true ]; then
        exit 2
    fi
fi

# ═══════════════════════════════════════
# 2. Inject learned rules as context
# ═══════════════════════════════════════
# Outputs a JSON structure with learned rules as additional context
# that Claude can reference during tool use decisions
if [ -f "${MEMORY_DIR}/learned-rules.md" ]; then
    RULES_CONTENT=$(head -30 "${MEMORY_DIR}/learned-rules.md" 2>/dev/null || echo "")
    if [ -n "$RULES_CONTENT" ] && echo "$RULES_CONTENT" | grep -qE '^\s*-\s+\*\*'; then
        # There are active rules — make them available as tool-specific context
        RULES_JSON=$(echo "$RULES_CONTENT" | grep -E '^\s*-\s+\*\*' | head -10 | \
            sed 's/^[[:space:]]*-[[:space:]]*\*\*\(.*\)\*\*[[:space:]]*/\1/' | \
            jq -R -s 'split("\n") | map(select(length > 0)) | {learned_rules: .}' 2>/dev/null || echo "")
        if [ -n "$RULES_JSON" ]; then
            echo "$RULES_JSON"
        fi
    fi
fi

exit 0
