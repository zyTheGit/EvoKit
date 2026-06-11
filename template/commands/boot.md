---
description: Boot verification — validate system integrity and learned rules
---

# /boot — System Verification

Run this at session start (or any time) to verify the self-evolving system is healthy.

## What It Does

1. **Check directory structure** — ensure `.claude/rules/`, `.claude/agents/`, `.claude/commands/`, `.claude/memory/` exist
2. **Validate learned rules** — read `.claude/memory/learned-rules.md` and check each rule's `verify` line
3. **Check file limits** — ensure `CLAUDE.md` ≤ 150 lines, `learned-rules.md` ≤ 50 lines
4. **Report violations** — any rule violations are written to `violations.jsonl`
5. **Output status** — summary of findings

## Output

```
[EVOLUTION BOOT] ═══════════════════════
  ✓ Directory structure: OK
  ✓ CLAUDE.md: N lines (limit 150)
  ✓ learned-rules.md: N lines (limit 50)
  ✓ Rules verified: N passed, N failed
  ⚠ Violations found: N (see violations.jsonl)
  ✓ Memory files: all present
═══════════════════════════════════════
```
