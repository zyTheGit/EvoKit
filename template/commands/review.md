---
description: Review current changes using the reviewer agent
---

# /review — Code Review

Run this before committing to review all current changes.

## What It Does

1. Get the current git diff (or working tree changes)
2. Invoke the `reviewer` agent to analyze the changes
3. The reviewer checks for: bugs, security issues, performance problems, code quality
4. Output a structured review report

## Usage

```
/review           — Review all unstaged changes
/review --staged  — Review staged changes only
/review --all     — Review all changes (staged + unstaged)
```
