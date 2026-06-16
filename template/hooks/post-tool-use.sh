#!/bin/bash
# PostToolUse hook — auto-format edited files and track learning patterns
# Called by settings.json:PostToolUse → Edit|Write
# Runs asynchronously (does not block Claude's response)

CLAUDE_DIR="${HOME}/.claude"
MEMORY_DIR="${CLAUDE_DIR}/memory"

# Read the tool input from stdin (JSON)
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")

# ═══════════════════════════════════════
# 1. Auto-format edited files
# ═══════════════════════════════════════
if [ -n "$FILE_PATH" ] && [ -f "$FILE_PATH" ]; then
    # Prettier (JS/TS/JSON/MD)
    if command -v npx &>/dev/null; then
        if npx --no-install prettier --version &>/dev/null; then
            case "$FILE_PATH" in
                *.js|*.jsx|*.ts|*.tsx|*.json|*.jsonc|*.md|*.yaml|*.yml|*.css|*.scss|*.html)
                    npx --no-install prettier --write "$FILE_PATH" --ignore-unknown 2>/dev/null || true
                    ;;
            esac
        fi
    fi

    # Python auto-format (if uv + ruff available)
    if command -v uv &>/dev/null; then
        case "$FILE_PATH" in
            *.py)
                uv run --isolated python3 -m ruff format "$FILE_PATH" --quiet 2>/dev/null || true
                uv run --isolated python3 -m ruff check --fix "$FILE_PATH" --quiet 2>/dev/null || true
                ;;
        esac
    fi

    # Go auto-format
    if command -v go &>/dev/null; then
        case "$FILE_PATH" in
            *.go)
                go fmt "$FILE_PATH" 2>/dev/null || true
                ;;
        esac
    fi
fi

# ═══════════════════════════════════════
# 2. Track editing pattern (for learning)
# ═══════════════════════════════════════
# Write a lightweight observation about what was edited
# (only for meaningful file types, not temp files)
if [ -n "$FILE_PATH" ] && [ -f "$FILE_PATH" ]; then
    case "$FILE_PATH" in
        *.ts|*.js|*.py|*.go|*.rs|*.java|*.tsx|*.jsx|*.css|*.html|*.sh|*.md|*.json|*.yaml|*.yml|*.toml)
            LINES=$(wc -l < "$FILE_PATH" 2>/dev/null || echo 0)
            EXT="${FILE_PATH##*.}"
            {
                echo "{\"timestamp\":\"$(date -Iseconds)\",\"event\":\"file_edit\",\"extension\":\"$EXT\",\"lines\":$LINES,\"path\":\"$FILE_PATH\"}"
            } >> "${MEMORY_DIR}/observations.jsonl" 2>/dev/null || true
            # Maintain 600 permissions
            chmod 600 "${MEMORY_DIR}/observations.jsonl" 2>/dev/null || true
            ;;
    esac
fi

exit 0
