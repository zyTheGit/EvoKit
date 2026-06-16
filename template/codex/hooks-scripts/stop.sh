#!/bin/bash
# EvoKit — Codex CLI Stop Hook
# Records session data to shared memory on session end.
# Installed by: evokit init --adapter codex

set -e

HOME_DIR="${HOME}"
SESSIONS_FILE="${HOME_DIR}/.claude/memory/sessions.jsonl"
SESSION_ID="${CODEX_SESSION_ID:-unknown}"
MODEL="${CODEX_MODEL:-unknown}"
START_TIME="${CODEX_SESSION_START:-$(date +%s)}"
NOW=$(date +%s)
DURATION=$((NOW - START_TIME))

# Ensure memory directory exists
mkdir -p "$(dirname "$SESSIONS_FILE")"

# Append session record (JSONL)
echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"session_id\":\"${SESSION_ID}\",\"assistant\":\"codex\",\"model\":\"${MODEL}\",\"duration_seconds\":${DURATION},\"score\":\"\"}" >> "$SESSIONS_FILE"

# Secure the file
chmod 600 "$SESSIONS_FILE" 2>/dev/null || true

exit 0
