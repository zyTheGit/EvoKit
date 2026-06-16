---
name: debug
description: Systematic debugging workflow — isolate root cause, fix, verify, and record learning
---

# Debugging Workflow

When asked to debug an issue, follow this systematic process:

## 1. Reproduce & Understand
- Confirm the exact error message or unexpected behavior
- Identify the minimal input/action that triggers the issue
- Check if this is a regression (recently working? `git bisect` if needed)

## 2. Isolate Root Cause
- Form a hypothesis about the root cause before making changes
- Use targeted `Bash` commands (not guesswork) to test the hypothesis
- Read the relevant source code — don't debug by printf
- Check logs, error output, and return codes

## 3. Fix & Verify
- Apply the minimal change needed (no scope creep)
- Verify the fix resolves the issue with the same reproduction case
- Run existing tests to confirm no regressions
- Run `/boot` if configured

## 4. Record Learning
- If this was a non-obvious bug, record an observation:
  `observations.jsonl` — pattern, root cause, solution
- If the user corrected your approach, record a correction:
  `corrections.jsonl` — what you did wrong, correct approach
