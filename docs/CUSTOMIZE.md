# Customization Guide

EvoKit is designed to be customized. This guide covers the main extension points.

## Custom Rules

Rules are markdown files in `.claude/rules/` with a `paths` frontmatter field.

### Basic Rule

```markdown
---
paths: "*/terraform*"
---

# Terraform Conventions

- Use `terraform fmt` before every commit
- Backend config must use `s3`, never local
```

### Path Patterns

The `paths` field controls when the rule loads:

| Pattern | Loads When |
|---------|------------|
| `"*/terraform*"` | Editing any file with "terraform" in its path |
| `"*"` | Always loaded |
| `"src/*"` | Editing files in `src/` |

### Rule with Verify Check

When a rule graduates from learning, it includes a verify command:

```markdown
- **Use uv instead of pip**
  <!-- verify: grep -r 'pip install' ~/ --include='*.md' --include='*.sh' && exit 1 || exit 0 -->
```

## Custom Agents

Agents are markdown files in `.claude/agents/` with frontmatter.

### Creating an Agent

```markdown
---
name: my-agent
description: What this agent does
model: haiku
tools: [Read, Bash, Grep]
maxTurns: 10
---

# My Agent

Instructions for the agent...
```

### Available Options

| Field | Required | Description |
|-------|----------|-------------|
| `name` | ✅ | Agent name, used as `claude agent <name>` |
| `description` | ✅ | One-line description for discovery |
| `model` | ✅ | sonnet / haiku / opus |
| `tools` | ✅ | Array of allowed tool names |
| `maxTurns` | ❌ | Max tool-using turns (default: 20) |

## Custom Commands

Commands are markdown files in `.claude/commands/` with frontmatter.

### Creating a Command

```markdown
---
description: One-line description shown in /help
---

# /mycommand — My Command

What this command does and how to use it.
```

Commands are invoked as `/mycommand` and can pass arguments.

## Adjusting Rotation Thresholds

The rotation and confidence decay thresholds are in **two places**:

1. **`export-system.sh`** — Python code in the rotation step (lines ~70-170):
   - `max_lines=500` — trigger rotation
   - `max_days=30` — archive threshold
   - `confidence_decay_max_days=60` — decay threshold
   - `confidence_threshold=0.3` — archive after decay

2. **`commands/evolve.md`** — Documents the thresholds (update to match)

## Multi-Agent Setup

See [MULTI_AGENT.md](MULTI_AGENT.md) for integrating with other AI coding assistants.
