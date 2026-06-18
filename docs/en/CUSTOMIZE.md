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
disallowedTools: [Write, Edit]
memory: project
isolation: worktree
maxTurns: 10
---

# My Agent

Instructions for the agent...
```

### Available Options

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Agent name, used as `claude agent <name>` |
| `description` | Yes | One-line description for discovery |
| `model` | Yes | sonnet / haiku / opus |
| `tools` | Yes | Array of allowed tool names |
| `disallowedTools` | No | Array of tools to explicitly disallow |
| `maxTurns` | No | Max tool-using turns (default: 20) |
| `memory` | No | Memory scope: `user`, `project`, `local` |
| `isolation` | No | Set to `worktree` for isolated git worktree |
| `background` | No | Set to `true` for background task execution |

## Custom Skills

Skills are auto-invoked workflow definitions in `.claude/skills/<name>/SKILL.md`.

### Creating a Skill

```markdown
---
name: my-skill
description: What this skill does when auto-invoked
disable-model-invocation: true
---

# My Skill

Detailed instructions for Claude to follow when this skill is relevant...
```

### Skill Frontmatter

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Display name (kebab-case, max 64 chars) |
| `description` | Yes | What the skill does (max 1024 chars) |
| `disable-model-invocation` | No | Prevent auto-loading (default: false) |
| `context` | No | Run in isolated subagent context (`fork`) |
| `allowed-tools` | No | Tools permitted without asking |
| `model` | No | Model override |

### How Skills Work

Skills use **progressive disclosure** -- only the `description` (~30-50 tokens) is loaded into context initially. Full instructions load on-demand when Claude determines the skill is relevant. You can have 100+ skills without significantly impacting context.

## Custom Commands

Commands are markdown files in `.claude/commands/` with frontmatter.

### Creating a Command

```markdown
---
description: One-line description shown in /help
---

# /mycommand -- My Command

What this command does and how to use it.
```

Commands are invoked as `/mycommand` and can pass arguments.

## Custom Hooks

Hooks are configured in `settings.json`. Each hook event can trigger shell commands, HTTP requests, or LLM prompts.

### Adding a Custom Hook

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/my-custom-hook.sh",
            "async": true,
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

### Hook Types

| Type | Description |
|------|-------------|
| `command` | Execute a shell script |
| `http` | Send an HTTP POST request |
| `prompt` | Delegate decision to an LLM |
| `agent` | Use a subagent for validation |

### Hook Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Allow / success |
| 1 | Non-blocking warning |
| 2 | Block the operation (PreToolUse only) |

See the full list of 17+ available hook events in the [ARCHITECTURE.md](ARCHITECTURE.md) Layer 4 section.

## Auto-Memory

Claude Code's built-in auto-memory saves notes automatically:
- Notes stored in `~/.claude/projects/<slug>/memory/`
- Controlled via `autoMemoryEnabled` in `settings.json`
- Custom path via `autoMemoryDirectory`
- View with `/memory`, toggle with `/toggle-memory`

Disable with `"autoMemoryEnabled": false` in settings.json or `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` env var.

## Adjusting Rotation Thresholds

The rotation and confidence decay thresholds are in the hooks and evolve command:

1. **`pre-compact.sh`** and **`export-system.sh`** -- Python code in the rotation step:
   - `max_lines=500` -- trigger rotation
   - `max_days=30` -- archive threshold
   - `confidence_decay_max_days=60` -- decay threshold
   - `confidence_threshold=0.3` -- archive after decay

2. **`commands/evolve.md`** -- Documents the thresholds (update to match)

## Multi-Agent Setup

See [MULTI_AGENT.md](MULTI_AGENT.md) for integrating with other AI coding assistants.
