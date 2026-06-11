#!/bin/bash
# Stop hook — records session summary at end of each assistant response
CLAUDE_DIR="${HOME}/.claude"
MEMORY_DIR="${CLAUDE_DIR}/memory"
SESSION_START="${MEMORY_DIR}/.session_start"

# Only record if .session_start exists (set by SessionStart hook)
if [ ! -f "$SESSION_START" ]; then
    exit 0
fi

START_TS=$(cat "$SESSION_START" 2>/dev/null)
NOW_TS=$(date +%s)
DURATION=$(( NOW_TS - START_TS ))

# Remove marker so we don't re-record
rm -f "$SESSION_START"

# Only record if at least 5 seconds elapsed
if [ "$DURATION" -lt 5 ]; then
    exit 0
fi

# Write session record to sessions.jsonl
PY_RUN="python3"
if command -v uv &>/dev/null; then
    PY_RUN="uv run --isolated python3"
fi
export SESSION_DURATION
$PY_RUN << 'PYEOF' 2>/dev/null || true
import json, os, time
mem = os.path.join(os.environ.get('HOME', ''), '.claude', 'memory')
fp = os.path.join(mem, 'sessions.jsonl')
entry = {
    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
    "duration_seconds": int(os.environ.get('SESSION_DURATION', 0)),
    "corrections": 0,
    "observations": 0,
    "score": "N/A"
}
with open(fp, 'a') as f:
    f.write(json.dumps(entry, ensure_ascii=False) + '\n')
PYEOF
