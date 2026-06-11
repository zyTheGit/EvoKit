---
description: Run pre-deployment checks (tests, lint, build)
---

# /deploy-check — Pre-Deployment Checklist

Run a complete pre-deployment check before pushing to production.

## Usage

```
/deploy-check                 — Run all checks
/deploy-check --skip-lint    — Skip linting
/deploy-check --env staging  — Check against staging environment
```

## Checks Run

1. ✅ **Code quality** — Run linter (ESLint, Ruff, etc.)
2. ✅ **Unit tests** — Run test suite
3. ✅ **Build** — Verify project builds successfully
4. ✅ **Type check** — Run TypeScript/type checker
5. ✅ **Security audit** — Quick dependency vulnerability scan

## Exit Codes

- `0` — All checks passed, ready to deploy
- `1` — Some checks failed
