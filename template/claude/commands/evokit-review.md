---
description: Review current changes using the reviewer agent
---

# /evokit-review — Code Review

Run this before committing to review all current changes.

## What It Does

1. Get the current git diff (or working tree changes)
2. Invoke the `reviewer` agent to analyze the changes
3. The reviewer checks for: bugs, security issues, performance problems, code quality
4. Output a structured review report

## Usage

```
/evokit-review           — Review all unstaged changes
/evokit-review --staged  — Review staged changes only
/evokit-review --all     — Review all changes (staged + unstaged)
```

## Learning Integration

- If the review finds recurring issues (same pattern across multiple files), record an **observation** in `observations.jsonl` so future sessions can avoid them.
- If the user corrects a review finding, record a **correction** in `corrections.jsonl` for the `/evolve` pipeline.

## Self-Check Before Running

- Are all intended changes saved to disk? (`git diff` shows what you expect)
- Are there unrelated changes that should be reviewed separately? (Consider staging subsets.)
- Have I run the project's linter? (Catch style issues before the review.)

## Self-Check After Review

- For each **P0 (must fix)** finding: did I apply the fix and re-run tests?
- For each **P1 (should fix)** finding: did I either fix it or document why not?
- Did I re-run `/boot` after making review-driven changes?

## Example Output

```
## Review Summary
**Overall:** ⚠️ Issues Found

### Bugs (P0-P1)
- P1: Potential null dereference in auth.ts:42 — `user.profile` accessed without null check

### Security Issues (P0)
- P0: Hardcoded API key in config.ts:15 — use env variable instead

### Suggestions (P2-P3)
- P2: Unused import `lodash` in utils.ts:3
```

## Priority Guide

| Priority | Label        | Meaning                                | Action                |
| -------- | ------------ | -------------------------------------- | --------------------- |
| P0       | Must fix     | Bug or security issue                  | Fix before committing |
| P1       | Should fix   | Maintainability or correctness concern | Fix or document       |
| P2       | Nice to have | Minor improvement                      | Consider fixing       |
| P3       | Style        | Convention or preference               | Apply if low effort   |
