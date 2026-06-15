---
description: Evolution audit — promote corrections to rules, prune stale rules
---

# /evolve — Evolution Audit

Run this every ~10 sessions (or when prompted by a "/boot" violation) to evolve the learning system.

## What It Does

1. **Auto-rotate large files** — If `corrections.jsonl` or `observations.jsonl` exceed **500 lines**, archive entries older than **30 days** to `archive/`. Archives larger than 1000 lines are gzip-compressed.
2. **Apply confidence decay** — In `observations.jsonl`, entries older than **60 days** get confidence halved. Entries below **0.3 threshold** are archived.
3. **Analyze corrections** — Read `corrections.jsonl` and group by `pattern`
4. **Promote frequent patterns** — Any pattern appearing **2+ times** → promote to `learned-rules.md` with a `verify` line
5. **Prune stale rules** — Rules in `learned-rules.md` not verified in **10+ sessions** → mark as `deprecated`
6. **Check limits** — If `learned-rules.md` > 50 lines, suggest which rules to prune
7. **Log decisions** — Write all promotion/pruning/rejection decisions to `evolution-log.md`
8. **Prune corrections** — Remove patterns that were successfully promoted

## Self-Check Before Running

- Have I accumulated corrections since the last evolve? Check `wc -l .claude/memory/corrections.jsonl`.
- Did the same correction pattern appear ≥2 times? (If yes, promote.)
- Are any existing rules stale or unverified? Run `/boot` first to verify each rule's `verify` line.

## Self-Check After Running

- Did the promotion succeed? Verify `learned-rules.md` has the new rule with its `verify` line.
- Were any rules rejected or pruned? Confirm in `evolution-log.md` — rejected rules are never re-proposed.
- Are file sizes under limits? Check `wc -l corrections.jsonl observations.jsonl`.

## Example Evolution Session

```
corrections.jsonl has 2 entries with pattern "prefer-named-exports":
  {"pattern":"prefer-named-exports","context":"User said use named exports","count":1}
  {"pattern":"prefer-named-exports","context":"User corrected same issue","count":2}

/evolve processing:
  → Pattern "prefer-named-exports" (count=2) → PROMOTE to learned-rules.md
  → Added: "- Prefer named exports over default exports\n  <!-- verify: grep -r 'export default' src/ -->"
  → Archived both correction entries (promoted → safe to remove)
  → Logged to evolution-log.md
```

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
| Promoted | Pattern seen 2+ times, added to `learned-rules.md` | Log with `verify` line |
| Pruned | Rule was stale/low-confidence, removed | Log with reason |
| Rejected | Rule doesn't make sense, or is covered elsewhere | Log with reason — **never re-propose** |
| Deferred | Rule is borderline, wait for more evidence | Log with current count |
