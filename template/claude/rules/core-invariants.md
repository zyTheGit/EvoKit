---
paths: '*/core-invariants*'
---

# Core Invariants

## File System Invariants

- **Never delete a file you haven't read.** If you haven't read it, you don't know what it contains.
- **Never overwrite project structure** without understanding it first.
- **Never modify files outside the project** without explicit user permission.

## Knowledge System Invariants

- `CLAUDE.md` must never exceed **150 lines**. If full, delegate to `.claude/rules/`.
- `.pending/` 中的知识条目未经用户确认不得移入 `knowledge/`。
- `knowledge-index.md` 中引用的条目文件必须存在。

## Interaction Invariants

- Present options before choosing. If 2+ valid approaches exist, ask the user.
- If a command fails, explain what went wrong and suggest a fix — don't silently retry.
- Report all errors truthfully. Never pretend a step succeeded if it didn't.

## Self-Check Before Any Modification

- ✅ Have I read the file I'm about to edit? (If no → Read first.)
- ✅ Is this file in the project's scope? (If no → ask permission.)
- ✅ Am I about to delete something? (If yes → double-check with user.)

## Examples

| Scenario                                | Correct                                                                               | Incorrect                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| An error occurs during install          | Report the error, explain what went wrong, suggest a fix                              | Silently retry 3 times, then report vague "installation failed" |
| Two approaches for a feature            | "There are two approaches: A (faster) and B (more maintainable). Which should I use?" | Silently pick approach A                                        |
| Knowledge index references missing file | Report the inconsistency, suggest running `/evokit-boot`                              | Silently ignore the broken reference                            |
