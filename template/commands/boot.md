---
description: Boot verification — validate system integrity and learned rules
---

# /boot — System Verification

Run this at session start (or any time) to verify the self-evolving system is healthy.

## What It Does

1. **Check directory structure** — ensure `.claude/rules/`, `.claude/agents/`, `.claude/commands/`, `.claude/memory/`, `.claude/hooks/` exist (`.claude/skills/` is optional)
2. **Validate learned rules** — read `learned-rules.md` and check each rule's `verify` line
3. **Check file limits** — ensure `CLAUDE.md` ≤ 150 lines, `learned-rules.md` ≤ 50 lines
4. **Verify hooks** — all hook scripts are executable
5. **Check skills & auto-memory** — report skill count and auto-memory project count
6. **Report violations** — any rule violations are written to `violations.jsonl`
7. **Output status** — summary of findings

## Self-Check Before Running

- Is this the first `/boot` of this session? (If yes, it auto-runs via SessionStart hook.)
- Did I recently edit any `.claude/memory/` files or `CLAUDE.md`? (If yes, run `/boot` to verify integrity.)

## Example Output

```
[EVOLUTION BOOT] ═══════════════════════
  ✓ .claude/rules/
  ✓ .claude/agents/
  ✓ .claude/commands/
  ✓ .claude/memory/
  ✓ .claude/hooks/
  - .claude/skills/ (optional, not found)
  ✓ .claude/settings.json
  ✓ CLAUDE.md: 135 lines (limit 150)
  ✓ learned-rules.md: 6 lines (limit 50)
  ✓ Rules verified: 2 passed, 0 failed
  ✓ MEMORY.md: valid
  ✓ Agents: 2 defined
  ✓ Hook permissions: OK
═══════════════════════════════════════
```

## Self-Check After Reading Output

- Any `✗` markers? Investigate and fix before proceeding.
- Any `⚠` violations? Check `violations.jsonl` for details.
- Are there `verify` lines without a matching rule? Either add the verified rule or remove stale `verify` comments.
