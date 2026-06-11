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
- Comment WHY, not WHAT. The code itself should express what it does.

## Quality
- No `console.log` / `print()` left in production code (use proper logging).
- No `TODO` / `FIXME` / `HACK` / `XXX` in committed code.
- Handle errors explicitly — no empty catch blocks.
- Prefer early returns over deep nesting.

## Language-Specific
- **Node.js:** Use a version manager (fnm/nvm). Prefer `import` over `require`.
- **Python:** Use a package manager (uv/pip/poetry). Prefer f-strings over `%`/`.format()`.
