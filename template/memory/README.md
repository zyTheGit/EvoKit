# Self-Evolving Memory System

## Overview

This directory is the learning infrastructure for the Self-Evolving System. It stores corrections, observations, learned rules, and session data that persist across AI coding assistant sessions.

## File Reference

### corrections.jsonl
- **Format:** `{"timestamp":"ISO8601","pattern":"error description","context":"what happened","count":1}`
- **Auto-generated:** Yes — appended when the user corrects the AI.
- **Promotion:** When the same `pattern` appears 2+ times, it graduates to `learned-rules.md`.

### observations.jsonl
- **Format:** `{"timestamp":"ISO8601","pattern":"observed pattern","confidence":0.7,"source":"auto"}`
- **Auto-generated:** Yes — appended during analysis.
- **Promotion:** High-confidence patterns may be proposed for promotion in `/evolve`.

### learned-rules.md
- **Format:** Markdown with `<!-- verify: ... -->` comments for machine-checkable conditions.
- **Max:** 50 lines. When full, run `/evolve` to prune.
- **Verification:** Each rule MUST have a `verify` line. Without one, it's a wish, not a rule.

### evolution-log.md
- **Format:** Chronological log of `/evolve` audit decisions.
- **Purpose:** Records which rules were promoted, pruned, or rejected. Rejected rules are never re-proposed.

### violations.jsonl
- **Format:** `{"timestamp":"ISO8601","rule":"...","file":"...","detail":"..."}`
- **Auto-generated:** Yes — by `/boot` verification scan.

### sessions.jsonl
- **Format:** `{"timestamp":"ISO8601","duration_seconds":N,"corrections":N,"observations":N,"score":"A/B/C"}`
- **Auto-generated:** Yes — written by Stop hook at session end.

## Key Constraints

- `learned-rules.md` ≤ 50 lines
- `corrections.jsonl` / `observations.jsonl` should be in `.gitignore` (personal session data)
- `learned-rules.md` / `evolution-log.md` can be committed (team knowledge)
- Same pattern in `corrections.jsonl` twice → auto-promote to `learned-rules.md`
