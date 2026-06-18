# Skills Directory

Skills are auto-invoked workflow definitions. Each subdirectory contains a `SKILL.md` file with:
- **Frontmatter** — `name`, `description`, `disable-model-invocation`, `context`
- **Body** — instructions Claude follows when the skill is auto-invoked or referenced

## Included Skills

| Skill | Auto-invoked? | Purpose |
|-------|---------------|---------|
| `debug` | Yes | Systematic debugging workflow |
| `code-review` | Yes | Structured code review workflow |
| `learning-recorder` | No (manual) | Guidelines for recording learning data |

## How Skills Work

Skills use **progressive disclosure** — only the `description` (~30-50 tokens) loads into context. Full instructions load on demand when Claude determines the skill is relevant.

To add custom skills:
```
.claude/skills/<skill-name>/SKILL.md
```

See `docs/en/CUSTOMIZE.md` or the official Claude Code docs for more.
