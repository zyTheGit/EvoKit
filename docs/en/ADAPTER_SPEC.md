# Adapter Specification

> This document records official documentation summaries, version numbers, lifecycle events, and extension mechanisms for each AI coding assistant CLI supported by EvoKit.
> When a CLI's hooks, trigger events, or rules change, update the corresponding section and note the supported version numbers.

---

## Claude Code

### Version Info

| Item                   | Version                     |
| ---------------------- | --------------------------- |
| EvoKit adapter version | 0.2.0                       |
| CLI minimum supported  | ≥ 2.1.0                     |
| CLI latest known       | 2.1.217                     |
| npm package            | `@anthropic-ai/claude-code` |

### Directory Structure

| Path                                   | Purpose                                           |
| -------------------------------------- | ------------------------------------------------- |
| `~/.claude/`                           | Global config directory                           |
| `~/.claude/CLAUDE.md`                  | User-level cognitive core (all projects)          |
| `./CLAUDE.md` or `./.claude/CLAUDE.md` | Project-level cognitive core                      |
| `./CLAUDE.local.md`                    | Local instructions (self only, add to .gitignore) |
| `~/.claude/settings.json`              | Global settings                                   |
| `.claude/settings.json`                | Project settings                                  |
| `.claude/settings.local.json`          | Local settings (gitignored)                       |
| `~/.claude/rules/`                     | Global path rules                                 |
| `.claude/rules/`                       | Project path rules                                |
| `~/.claude/commands/`                  | Slash commands (merged into Skills)               |
| `~/.claude/agents/`                    | Sub-agent definitions                             |
| `~/.claude/skills/`                    | Skill definitions                                 |
| `~/.claude/hooks/`                     | Hook scripts                                      |
| `~/.claude/memory/`                    | Learning data                                     |

### Lifecycle Events

| Event                 | Trigger                       | Blockable | EvoKit Uses         |
| --------------------- | ----------------------------- | --------- | ------------------- |
| `SessionStart`        | Session start or resume       | No        | ✅ session-start.sh |
| `PreToolUse`          | Before tool call execution    | Yes       | ✅ pre-tool-use.sh  |
| `PostToolUse`         | After tool call success       | No        | ✅ post-tool-use.sh |
| `PreCompact`          | Before context compaction     | Yes       | ✅ pre-compact.sh   |
| `Stop`                | Claude finishes response      | Yes       | ✅ stop.sh          |
| `SessionEnd`          | Session termination           | No        | ❌                  |
| `PostToolUseFailure`  | After tool call failure       | No        | ❌                  |
| `PostToolBatch`       | After parallel tool batch     | Yes       | ❌                  |
| `SubagentStart`       | Sub-agent starts              | No        | ❌                  |
| `SubagentStop`        | Sub-agent completes           | Yes       | ❌                  |
| `UserPromptSubmit`    | User submits prompt           | Yes       | ❌                  |
| `UserPromptExpansion` | User command expansion        | Yes       | ❌                  |
| `PermissionRequest`   | Permission dialog appears     | Yes       | ❌                  |
| `PermissionDenied`    | Tool call denied              | No        | ❌                  |
| `Notification`        | Notification sent             | No        | ❌                  |
| `InstructionsLoaded`  | CLAUDE.md/rules loaded        | No        | ❌                  |
| `ConfigChange`        | Config file changes           | Yes       | ❌                  |
| `FileChanged`         | Watched file changes on disk  | No        | ❌                  |
| `WorktreeCreate`      | Worktree creation             | Yes       | ❌                  |
| `WorktreeRemove`      | Worktree removal              | No        | ❌                  |
| `PostCompact`         | After context compaction      | No        | ❌                  |
| `TaskCreated`         | Task created                  | Yes       | ❌                  |
| `TaskCompleted`       | Task completed                | Yes       | ❌                  |
| `TeammateIdle`        | Agent team teammate idle      | Yes       | ❌                  |
| `Setup`               | Initialization mode           | No        | ❌                  |
| `StopFailure`         | API error causes stop         | No        | ❌                  |
| `MessageDisplay`      | Message display               | No        | ❌                  |
| `Elicitation`         | MCP user interaction request  | Yes       | ❌                  |
| `ElicitationResult`   | MCP user interaction response | Yes       | ❌                  |

### Hook Handler Types

| Type       | Key Fields                                                                    | Description                           |
| ---------- | ----------------------------------------------------------------------------- | ------------------------------------- |
| `command`  | `command`, `args`, `async`, `timeout`, `shell`, `if`, `statusMessage`, `once` | Shell command execution               |
| `http`     | `url`, `headers`, `allowedEnvVars`, `timeout`                                 | HTTP POST request                     |
| `mcp_tool` | `server`, `tool`, `input`                                                     | MCP tool invocation                   |
| `prompt`   | `prompt`, `model`                                                             | LLM prompt evaluation                 |
| `agent`    | `prompt`, `model`                                                             | Sub-agent verification (experimental) |

### Hook Exit Code Semantics

| Exit Code | Meaning                                                      |
| --------- | ------------------------------------------------------------ |
| 0         | Success, stdout parsed as JSON output                        |
| 2         | Blocking error, stderr fed back to Claude, operation blocked |
| Other     | Non-blocking error, execution continues                      |

### Configuration Locations (highest to lowest priority)

1. Managed policy settings (organization-wide)
2. `~/.claude/settings.json` (user-level)
3. `.claude/settings.json` (project-level)
4. `.claude/settings.local.json` (local-level)

### CLAUDE.md Features

- Supports `@path/to/import` syntax for importing other files (max 4 levels recursion)
- `AGENTS.md` importable via `@AGENTS.md`
- HTML comments stripped before injection, no token cost
- Recommended max 200 lines per CLAUDE.md

### Rules System

- Supports YAML frontmatter `paths` field for scope restriction
- Rules without `paths` load unconditionally at startup
- Supports glob pattern matching and symbolic links

### Skills System

- Located at `.claude/skills/<name>/SKILL.md`
- Frontmatter controls: `disable-model-invocation`, `user-invocable`, `allowed-tools`, `model`, `effort`, `paths`, etc.
- Dynamic context injection: `` !`command` `` syntax
- String substitution: `$ARGUMENTS`, `${CLAUDE_SESSION_ID}`, etc.

### Agents System

- Located at `.claude/agents/`
- Frontmatter fields: `name`, `description`, `permission`, `model`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`, `background`, `effort`, `isolation`, etc.
- Hooks definable in Skills/Agent frontmatter

### Permissions System

- Rule format: `Tool` or `Tool(specifier)`
- Evaluation order: deny > ask > allow
- Specifier patterns: exact match, wildcard, glob, regex

---

## Codex CLI

### Version Info

| Item                   | Version         |
| ---------------------- | --------------- |
| EvoKit adapter version | 0.4.0           |
| CLI minimum supported  | ≥ 1.0.0         |
| CLI latest known       | TBD             |
| npm package            | `@openai/codex` |

### Directory Structure

| Path                      | Purpose                                    |
| ------------------------- | ------------------------------------------ |
| `~/.codex/`               | Global config directory                    |
| `~/.codex/AGENTS.md`      | Cognitive core (analogous to CLAUDE.md)    |
| `~/.codex/hooks.json`     | Lifecycle hooks configuration              |
| `~/.codex/config.toml`    | Feature flags, permissions, model settings |
| `~/.codex/rules/`         | Starlark `.rules` safety rules             |
| `~/.codex/hooks-scripts/` | Hook scripts                               |
| `~/.codex/memory/`        | Learning data                              |

### Lifecycle Events

| Event               | Trigger             | EvoKit Uses               |
| ------------------- | ------------------- | ------------------------- |
| `SessionStart`      | Session start       | ✅ session-start.sh       |
| `Stop`              | Session end         | ✅ stop.sh                |
| `PreToolUse`        | Before tool call    | ✅ pre-tool-use.sh        |
| `PostToolUse`       | After tool call     | ❌ (optional enhancement) |
| `SubagentStart`     | Sub-agent starts    | ❌                        |
| `SubagentStop`      | Sub-agent completes | ❌                        |
| `UserPromptSubmit`  | User submits prompt | ❌                        |
| `PermissionRequest` | Permission request  | ❌                        |

> **Note**: Codex CLI official documentation access is limited. PostToolUse and other events are inferred from Claude Code's hooks system and marked as optional/experimental.

### Hook Configuration Format

```json
{
  "hooks": {
    "<EventName>": [
      {
        "matcher": "<pattern>",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/script.sh",
            "timeout": 30,
            "statusMessage": "Description"
          }
        ]
      }
    ]
  }
}
```

Also supports inline TOML format (in `config.toml` `[hooks]` section).

### Rules System

- Starlark language `.rules` files
- `prefix_rule()` function for safety rules
- Fields: `pattern`, `decision` (prompt/allow/deny), `justification`, `match`, `not_match`

### Configuration File (config.toml)

```toml
[features]
hooks = true
memories = true
multi_agent = true

approval_policy = "on-request"
sandbox_mode = "workspace-write"

[shell_environment_policy]
include_only = ["PATH", "HOME", "USER"]
```

---

## OpenCode CLI

### Version Info

| Item                   | Version                         |
| ---------------------- | ------------------------------- |
| EvoKit adapter version | 0.5.0                           |
| CLI minimum supported  | ≥ 0.1.0                         |
| CLI latest known       | TBD (no version number in docs) |

### Directory Structure

| Path                               | Purpose                       |
| ---------------------------------- | ----------------------------- |
| `~/.config/opencode/`              | Global config directory (XDG) |
| `~/.config/opencode/AGENTS.md`     | Global cognitive core         |
| `~/.config/opencode/opencode.json` | Global configuration          |
| `~/.config/opencode/agents/`       | Global sub-agent definitions  |
| `~/.config/opencode/memory/`       | Global learning data          |
| `~/.config/opencode/skills/`       | Global skills                 |
| `.opencode/tools/`                 | Project-level custom tools    |
| `.opencode/agents/`                | Project-level agent overrides |
| `.opencode/memory/`                | Project-level learning data   |
| `./AGENTS.md`                      | Project-level cognitive core  |
| `./opencode.json`                  | Project-level configuration   |

### Lifecycle Events

**OpenCode has no lifecycle hooks system.** EvoKit commands are implemented via custom tools in `.opencode/tools/`.

| EvoKit Feature    | OpenCode Mechanism              | Auto-triggered  |
| ----------------- | ------------------------------- | --------------- |
| SessionStart hook | `evokit-boot.ts` custom tool    | ❌ AI must call |
| Stop hook         | `evokit-session.ts` custom tool | ❌ AI must call |
| PreToolUse hook   | `evokit-memory.ts` custom tool  | ❌ AI must call |
| /evolve command   | `evokit-evolve.ts` custom tool  | ❌ AI must call |

### Custom Tools System

- Uses `@opencode-ai/plugin` SDK
- Tools defined in `.opencode/tools/*.ts`
- Tools defined via `tool()` function with `description`, `args`, `execute`

### Built-in Tools (12)

| Tool        | Permission Key | Description                        |
| ----------- | -------------- | ---------------------------------- |
| `bash`      | `bash`         | Execute shell commands             |
| `edit`      | `edit`         | Precise string replacement editing |
| `write`     | `edit`         | Create/overwrite files             |
| `read`      | `read`         | Read file contents                 |
| `grep`      | `grep`         | Regex content search               |
| `glob`      | `glob`         | Pattern file finding               |
| `lsp`       | `lsp`          | LSP interaction (experimental)     |
| `patch`     | `edit`         | Apply patch files                  |
| `skill`     | `skill`        | Load SKILL.md                      |
| `todowrite` | `todowrite`    | Manage todo lists                  |
| `webfetch`  | `webfetch`     | Fetch web page content             |
| `websearch` | `websearch`    | Web search (Exa AI)                |
| `question`  | `question`     | Ask user questions                 |

### opencode.json Configuration Fields

| Field                | Description            |
| -------------------- | ---------------------- |
| `model`              | Primary model          |
| `small_model`        | Lightweight task model |
| `provider`           | Provider configuration |
| `tui`                | TUI settings           |
| `server`             | Server settings        |
| `tools`              | Tool enable/disable (deprecated, use permission) |
| `theme`              | Theme                  |
| `agent`              | Agent configuration    |
| `default_agent`      | Default agent          |
| `share`              | Share settings         |
| `command`            | Custom commands        |
| `keybinds`           | Keybindings            |
| `autoupdate`         | Auto-update            |
| `formatter`          | Code formatters        |
| `permission`         | Permission control     |
| `compaction`         | Context compaction     |
| `watcher`            | File watcher           |
| `mcp`                | MCP servers            |
| `plugin`             | Plugin list            |
| `instructions`       | Instruction file list  |
| `disabled_providers` | Disabled providers     |
| `enabled_providers`  | Enabled providers      |

### Variable Substitution

- Environment variables: `{env:VARIABLE_NAME}`
- File contents: `{file:path/to/file}`

---

## Pi CLI

### Version Info

| Item                   | Version                           |
| ---------------------- | --------------------------------- |
| EvoKit adapter version | 0.6.0                             |
| CLI minimum supported  | ≥ 0.81.0                          |
| CLI latest known       | 0.81.1                            |
| npm package            | `@earendil-works/pi-coding-agent` |

### Directory Structure

#### Global Config (`~/.pi/agent/`)

| Path                           | Purpose                     |
| ------------------------------ | --------------------------- |
| `~/.pi/agent/settings.json`    | Global settings             |
| `~/.pi/agent/trust.json`       | Project trust decisions     |
| `~/.pi/agent/AGENTS.md`        | Global cognitive core       |
| `~/.pi/agent/SYSTEM.md`        | System prompt replacement   |
| `~/.pi/agent/APPEND_SYSTEM.md` | System prompt append        |
| `~/.pi/agent/extensions/`      | TypeScript extensions       |
| `~/.pi/agent/skills/`          | Global Skills               |
| `~/.pi/agent/prompts/`         | Global Prompt templates     |
| `~/.pi/agent/npm/`             | npm-installed packages      |
| `~/.pi/agent/git/`             | git-installed packages      |
| `~/.pi/agent/models.json`      | Custom providers and models |

#### Project Config (`.pi/`)

| Path                   | Purpose                             |
| ---------------------- | ----------------------------------- |
| `.pi/settings.json`    | Project settings (overrides global) |
| `.pi/SYSTEM.md`        | Project system prompt replacement   |
| `.pi/APPEND_SYSTEM.md` | Project system prompt append        |
| `.pi/extensions/`      | Project extensions (requires trust) |
| `.pi/skills/`          | Project Skills                      |
| `.pi/prompts/`         | Project Prompt templates            |

#### Cross-tool Shared

| Path                | Purpose                                  |
| ------------------- | ---------------------------------------- |
| `~/.agents/skills/` | Cross-tool shared Skills (global)        |
| `.agents/skills/`   | Cross-tool shared Skills (project-level) |

### Environment Variables

| Variable                      | Purpose                                           |
| ----------------------------- | ------------------------------------------------- |
| `PI_CODING_AGENT_DIR`         | Override config directory (default `~/.pi/agent`) |
| `PI_CODING_AGENT_SESSION_DIR` | Override session directory                        |
| `PI_PACKAGE_DIR`              | Override package directory                        |
| `PI_OFFLINE=1`                | Disable startup network operations                |
| `PI_SKIP_VERSION_CHECK=1`     | Skip version check                                |
| `PI_TELEMETRY`                | Control telemetry                                 |
| `PI_CACHE_RETENTION=long`     | Extended prompt cache retention                   |

### Lifecycle Events (via extension `pi.on()`)

#### Startup Flow

| Event                | Trigger                | EvoKit Uses            |
| -------------------- | ---------------------- | ---------------------- |
| `project_trust`      | Project trust decision | ❌                     |
| `session_start`      | Session start          | ✅ evokit-lifecycle.ts |
| `resources_discover` | Resource discovery     | ❌                     |

#### User Interaction

| Event                | Trigger                                   | EvoKit Uses |
| -------------------- | ----------------------------------------- | ----------- |
| `input`              | User input processing                     | ❌          |
| `before_agent_start` | Before agent starts (can inject messages) | ❌          |
| `agent_start`        | Agent starts                              | ❌          |

#### Per-Turn

| Event         | Trigger                                | EvoKit Uses            |
| ------------- | -------------------------------------- | ---------------------- |
| `turn_start`  | Turn starts                            | ❌                     |
| `context`     | Context building (can modify messages) | ❌                     |
| `tool_call`   | Tool call (can intercept/modify)       | ✅ evokit-lifecycle.ts |
| `tool_result` | Tool result (can modify)               | ❌                     |
| `turn_end`    | Turn ends                              | ❌                     |

#### Session Lifecycle

| Event                    | Trigger                                  | EvoKit Uses            |
| ------------------------ | ---------------------------------------- | ---------------------- |
| `agent_end`              | Agent ends                               | ❌                     |
| `agent_settled`          | Agent no longer auto-runs                | ❌                     |
| `session_shutdown`       | Session shutdown                         | ✅ evokit-lifecycle.ts |
| `session_before_switch`  | Before session switch                    | ❌                     |
| `session_before_compact` | Before compaction (can cancel/customize) | ❌                     |

### Extension System

TypeScript modules loaded via `jiti` (no compilation needed):

```typescript
export default function(pi: ExtensionAPI) {
  pi.registerTool({ name: "deploy", ... });
  pi.registerCommand("stats", { ... });
  pi.on("tool_call", async (event, ctx) => { ... });
  pi.sendMessage("Message content");
}
```

**Core API**:

- `pi.registerTool()` — Register custom tools
- `pi.registerCommand()` — Register slash commands
- `pi.registerShortcut()` — Register keyboard shortcuts
- `pi.registerProvider()` — Register model providers
- `pi.on(event, handler)` — Subscribe to lifecycle events
- `pi.sendMessage()` / `pi.sendUserMessage()` — Inject messages
- `pi.setActiveTools()` — Dynamically enable/disable tools

### Skills System

Follows the [Agent Skills standard](https://agentskills.io), progressive disclosure model:

```markdown
---
name: my-skill
description: Skill description
allowed-tools: read write bash
---

# Instructions...
```

Discovery paths: `~/.pi/agent/skills/`, `~/.agents/skills/`, `.pi/skills/`, `.agents/skills/`

### Design Philosophy

Pi deliberately omits the following features, making them buildable via extensions:

- **No MCP** — Build CLI tools with Skills or extensions
- **No sub-agents** — Use tmux or build with extensions
- **No permission popups** — Use containers or build with extensions
- **No plan mode** — Write plans to files or build with extensions
- **No built-in TODOs** — Use TODO.md files or build with extensions
- **No background bash** — Use tmux

---

## EvoKit → CLI Mapping Overview

| EvoKit Concept   | Claude Code           | Codex CLI                | OpenCode CLI                 | Pi CLI                     |
| ---------------- | --------------------- | ------------------------ | ---------------------------- | -------------------------- |
| Cognitive core   | `CLAUDE.md`           | `AGENTS.md`              | `AGENTS.md`                  | `AGENTS.md`                |
| Config directory | `~/.claude/`          | `~/.codex/`              | `~/.config/opencode/`        | `~/.pi/agent/`             |
| Project config   | `.claude/`            | —                        | `.opencode/`                 | `.pi/`                     |
| Config format    | JSON                  | JSON + TOML              | JSON                         | JSON                       |
| Hooks mechanism  | settings.json hooks   | hooks.json               | None (custom tools)          | Extension events           |
| Rules            | `.claude/rules/` (md) | `.codex/rules/` (.rules) | opencode.json instructions   | AGENTS.md + extensions     |
| Skills           | `.claude/skills/`     | —                        | —                            | `skills/` (Agent Skills)   |
| Sub-agents       | `.claude/agents/`     | Sub-agents + Skills      | `.opencode/agents/`          | None built-in (extensions) |
| Commands         | `.claude/commands/`   | —                        | `.opencode/tools/`           | Extensions + prompts/      |
| Learning data    | `~/.claude/memory/`   | `~/.codex/memory/`       | `~/.config/opencode/memory/` | `~/.pi/agent/memory/`      |
