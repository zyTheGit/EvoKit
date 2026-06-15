---
paths: "*/coding*"
---

# Coding Standards

## Before Editing
- Always `Read` the target file before making changes.
- Understand the existing code style (indentation, naming, comments) and match it.

## Style
- Follow the project's existing conventions. When in doubt, match what's already there.
- Use meaningful variable/function names — avoid single-letter names except in loops/math.
- Comment **WHY**, not **WHAT**. The code itself should express what it does.

## Quality
- No `console.log` / `print()` left in production code (use proper logging).
- No `TODO` / `FIXME` / `HACK` / `XXX` in committed code.
- Handle errors explicitly — no empty `catch` blocks.
- Prefer early returns over deep nesting.

## Language-Specific
- **Node.js:** Use a version manager (fnm/nvm). Prefer `import` over `require`.
- **Python:** Use a package manager (uv/pip/poetry). Prefer f-strings over `%`/`.format()`.

## Self-Check Before Committing

- ✅ Did I remove all `console.log` / `print()` / `debugger` statements?
- ✅ Did I check for leftover `TODO`, `FIXME`, `HACK`, or `XXX` markers?
- ✅ Did I handle all error paths? (No empty `catch` blocks.)
- ✅ Did I match the project's existing code style and conventions?
- ✅ Did I run tests? (`fnm use && npm test` for Node, `uv run pytest` for Python)

## Examples

| Pattern | Correct | Incorrect |
|---------|---------|-----------|
| Error handling | `try { riskyOp() } catch (e) { logger.error('riskyOp failed', e); throw e; }` | `try { riskyOp() } catch (e) {}` |
| Variable naming | `const userCount = await db.countUsers()` | `const x = await db.countUsers()` |
| Comments | `// We use a Map here instead of Object for O(1) key deletion` | `// Set the value` |
| Return style | `if (!user) return null;` (early return) | `if (user) { if (user.active) { return user } } return null` (deep nesting) |
