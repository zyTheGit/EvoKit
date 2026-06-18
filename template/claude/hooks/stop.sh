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

export CLAUDE_DIR MEMORY_DIR SESSION_DURATION=$DURATION

$PY_RUN << 'PYEOF' 2>/dev/null || true
import json, os, time

mem = os.environ.get('MEMORY_DIR', os.path.join(os.environ.get('HOME', ''), '.claude', 'memory'))
duration = int(os.environ.get('SESSION_DURATION', 0))

# Count current corrections and observations
corrections_count = 0
observations_count = 0
try:
    corr_path = os.path.join(mem, 'corrections.jsonl')
    if os.path.isfile(corr_path):
        with open(corr_path) as f:
            corrections_count = sum(1 for _ in f)
except Exception:
    pass
try:
    obs_path = os.path.join(mem, 'observations.jsonl')
    if os.path.isfile(obs_path):
        with open(obs_path) as f:
            observations_count = sum(1 for _ in f)
except Exception:
    pass

# Get model info from environment (set by Claude Code runtime)
model = os.environ.get('CLAUDE_MODEL', os.environ.get('ANTHROPIC_MODEL', 'unknown'))

entry = {
    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
    "duration_seconds": duration,
    "corrections": corrections_count,
    "observations": observations_count,
    "model": model,
    "assistant": "claude",
    "score": "N/A"
}

fp = os.path.join(mem, 'sessions.jsonl')
with open(fp, 'a') as f:
    f.write(json.dumps(entry, ensure_ascii=False) + '\n')

# Maintain 600 permission on JSONL files
try:
    os.chmod(fp, 0o600)
except Exception:
    pass
PYEOF

# ── Evolve reminder: check if corrections.jsonl has 10+ entries ──
CORRECTIONS_FILE="${MEMORY_DIR}/corrections.jsonl"
if [ -f "$CORRECTIONS_FILE" ]; then
    COUNT=$(grep -c '.' "$CORRECTIONS_FILE" 2>/dev/null || echo 0)
    if [ "$COUNT" -ge 10 ]; then
        echo ""
        echo "╔══════════════════════════════════════════════════╗"
        echo "║  📝  Evolution 提醒                              ║"
        echo "║  corrections.jsonl 已有 ${COUNT} 条纠正记录       ║"
        echo "║  建议运行 /evolve 来检查是否需要提拔为永久规则      ║"
        echo "╚══════════════════════════════════════════════════╝"
        echo ""
    fi
fi
