---
description: Evolution audit — promote corrections to rules, prune stale rules
---

# /evolve — Evolution Audit

Run this every ~10 sessions to evolve the learning system.

## What It Does

1. **Auto-rotate large files** — If `corrections.jsonl` or `observations.jsonl` exceed **500 lines**, archive entries older than **30 days** to `archive/` directory. Archives larger than 1000 lines are gzip-compressed. Keeps hot files small and /evolve fast.
2. **Apply confidence decay** — In `observations.jsonl`, entries older than **60 days** get confidence halved. Entries below **0.3 threshold** after decay are archived to `archive/observations-decayed-YYYY-MM.jsonl`.
3. **Analyze corrections** — Read `.claude/memory/corrections.jsonl` and group by `pattern`
4. **Promote frequent patterns** — Any pattern appearing 2+ times → promote to `learned-rules.md` with a `verify` line
5. **Prune stale rules** — Rules in `learned-rules.md` that haven't been verified in 10+ sessions → mark as `deprecated`
6. **Check limits** — If `learned-rules.md` > 50 lines, suggest which rules to prune
7. **Log decisions** — Write all promotion/pruning/rejection decisions to `evolution-log.md`
8. **Prune corrections** — Remove patterns that were successfully promoted (keep unique/uncounted ones)

## Promotion Format

Each promoted rule in `learned-rules.md` follows this format:

```markdown
- **Rule description**
  <!-- verify: <grep or test command that returns 0 on pass> -->
  <!-- promoted: YYYY-MM-DD from corrections.jsonl -->
```

## Decision Categories

| Decision | Meaning | Log Action |
|----------|---------|------------|
| Promoted | Pattern seen 2+ times, added to learned-rules.md | Log with verify line |
| Pruned | Rule was stale/low-confidence, removed | Log with reason |
| Rejected | Rule doesn't make sense, or is covered elsewhere | Log with reason — never re-propose |
| Deferred | Rule is borderline, wait for more evidence | Log with current count |
