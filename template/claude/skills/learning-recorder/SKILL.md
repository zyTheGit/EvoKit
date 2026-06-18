---
name: learning-recorder
description: Guidelines for recording learning data — when and how to write corrections, observations, and violations
disable-model-invocation: true
---

# Learning Recorder

This skill provides guidelines for recording learning data. It is not auto-invoked — reference it explicitly when you need to record learning data.

## When to Record

| Situation | Record To | Example |
|-----------|-----------|---------|
| User corrects your approach | `corrections.jsonl` | "Use `const` not `let` for unchanged variables" |
| You discover a project pattern | `observations.jsonl` | "Project uses kebab-case for file names" |
| A system rule was violated | `violations.jsonl` | "learned-rules.md exceeded 50 lines" |
| User teaches a new convention | `corrections.jsonl` | "API responses always wrap in {data, error} envelope" |

## Correction Format

```json
{
  "pattern": "kebab-case-files",
  "context": "User corrected: file should be 'user-profile.ts' not 'userProfile.ts'",
  "count": 1,
  "timestamp": "2026-06-16T10:30:00"
}
```

## Observation Format

```json
{
  "pattern": "api-response-envelope",
  "context": "Noticed all API responses use {data, error} wrapper",
  "confidence": 0.5,
  "timestamp": "2026-06-16T10:35:00"
}
```

## Guiding Principles
1. **Be specific** — "use named exports" > "exports were wrong"
2. **Include context** — enough that a future session can apply the rule
3. **Don't record the obvious** — skip things already in CLAUDE.md or rules/
4. **Record immediately** — don't wait; memory is fresh right after the interaction
