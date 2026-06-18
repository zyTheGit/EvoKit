---
name: code-review
description: Structured code review workflow — examine changes for bugs, security, quality
---

# Code Review Workflow

When asked to review code (or when running `/review`), follow this structured approach:

## Review Dimensions

### Correctness
- Logic errors, off-by-one, null/undefined dereferences
- Race conditions, async issues, incorrect error handling
- Type mismatches, incorrect assumptions about data

### Security
- Injection vulnerabilities (shell, SQL, path traversal)
- Hardcoded secrets, API keys, tokens
- Insecure file operations, unsafe deserialization
- Exposure of sensitive data in logs or output

### Performance
- Unnecessary allocations, N+1 queries, excessive loops
- Missing caching opportunities, blocking I/O in async paths
- Large files or bundles without optimization

### Maintainability
- Dead code, unused variables/imports, overly complex logic
- Missing edge case handling, inadequate error messages
- Violations of project conventions or style guide

## Output Format

```
## Review Summary
**Overall:** ✅ Pass / ⚠️ Issues Found / ❌ Blocking

### Critical (P0)
- description, file:line

### Concerns (P1)
- description, file:line

### Suggestions (P2-P3)
- description, file:line
```
