# Self-Evolving Memory System

## Overview

This directory is the learning infrastructure for the Self-Evolving System. It stores corrections, observations, learned rules, and session data that persist across AI coding assistant sessions.

## File Reference

### `corrections.jsonl`
- **Format:** `{"timestamp":"ISO8601","pattern":"error description","context":"what happened","count":1}`
- **Auto-generated:** Yes — appended when the user corrects the AI.
- **Promotion:** When the same `pattern` appears **2+ times**, it graduates to `learned-rules.md`.
- **Append-only:** Never delete or edit entries. Let `/evolve` handle rotation.

### `observations.jsonl`
- **Format:** `{"timestamp":"ISO8601","pattern":"observed pattern","confidence":0.7,"source":"auto"}`
- **Auto-generated:** Yes — appended during analysis.
- **Promotion:** High-confidence patterns may be proposed for promotion in `/evolve`.
- **Confidence decay:** Entries older than **60 days** → confidence halved. Below **0.3** → archived.

### `learned-rules.md`
- **Format:** Markdown with `<!-- verify: ... -->` comments for machine-checkable conditions.
- **Max:** **50 lines.** When full, run `/evolve` to prune.
- **Verification:** Each rule MUST have a `verify` line. Without one, it's a wish, not a rule.

### `evolution-log.md`
- **Format:** Chronological log of `/evolve` audit decisions.
- **Purpose:** Records which rules were promoted, pruned, or rejected. **Rejected rules are never re-proposed.**

### `violations.jsonl`
- **Format:** `{"timestamp":"ISO8601","rule":"...","file":"...","detail":"..."}`
- **Auto-generated:** Yes — by `/boot` verification scan.
- **Severity indicators:** `🔴 Hard violation` / `⚠ Warning` / `ℹ Info`

### `sessions.jsonl`
- **Format:** `{"timestamp":"ISO8601","duration_seconds":N,"corrections":N,"observations":N,"score":"A/B/C"}`
- **Auto-generated:** Yes — written by Stop hook at session end.

## When to Record

| Trigger | Record To | Example Entry |
|---------|-----------|--------------|
| User explicitly corrects you | `corrections.jsonl` | `{"pattern":"prefer-named-exports","context":"User requested named exports over default","count":1}` |
| You discover a reusable code pattern | `observations.jsonl` | `{"pattern":"project-uses-pascalcase-components","confidence":0.8,"source":"auto"}` |
| A rule is violated during boot | `violations.jsonl` | `{"rule":"claude-md-line-limit","detail":"CLAUDE.md is 182 lines (limit 150)"}` |
| Session ends | `sessions.jsonl` | `{"duration_seconds":340,"corrections":2,"observations":1,"score":"B"}` |

## Confidence System

Used by `/evolve` to decide which observations to promote or prune:

| Confidence | Meaning | Action |
|------------|---------|--------|
| 0.8–1.0 | High — pattern observed many times, well-established | Promote to `learned-rules.md` on next `/evolve` |
| 0.4–0.7 | Medium — pattern observed a few times | Wait for more evidence |
| 0.1–0.3 | Low — pattern rarely observed | Archive on next `/evolve` |
| Below 0.3 | Decayed — observation is stale or contradicted | Auto-archived (never re-proposed) |

## Key Constraints

- `learned-rules.md` ≤ **50 lines**
- `corrections.jsonl` / `observations.jsonl` → `.gitignore` (personal session data)
- `learned-rules.md` / `evolution-log.md` → can be committed (team knowledge)
- Same pattern in `corrections.jsonl` twice → auto-promote to `learned-rules.md`
- Confidentiality: corrections/observations/violations contain personal work context — keep in `.gitignore`
