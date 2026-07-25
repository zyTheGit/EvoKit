# Multi-Agent Adapter Architecture

> **Status:** ✅ Implemented — All four adapters (Claude Code, Codex CLI, OpenCode CLI, Pi CLI) are complete
> This document defines the adapter interface for integrating with other AI coding assistants.

## Motivation

EvoKit currently works with Claude Code via its hook system. However, the evolution pipeline (corrections → observations → promotion → graduation) is **assistant-agnostic** — any AI coding assistant can benefit from it.

The adapter architecture decouples the evolution engine from the specific AI assistant, allowing shared learning across tools.

## Adapter Interface

```typescript
interface AgentAdapter {
  /** Name of the AI assistant */
  name: string;

  /**
   * Install EvoKit for this assistant.
   * Copies templates, configures hooks/plugins, sets up the environment.
   */
  install(config: InstallConfig): Promise<InstallResult>;

  /**
   * Register lifecycle hooks.
   * Each assistant has different hook mechanisms — this abstracts them.
   */
  setupHooks(events: HookEvent[]): Promise<void>;

  /**
   * Inject learning data into the assistant's context.
   * How this works depends on the assistant — may involve files, env vars, or API calls.
   */
  injectMemory(data: MemoryData): Promise<void>;

  /**
   * Export learning data from the assistant.
   * Extracts what the assistant has learned (corrections, observations).
   */
  exportMemory(): Promise<MemoryData>;

  /**
   * Execute a command within the assistant's context.
   * Used by commands like /boot, /evolve, /review.
   */
  runCommand(name: string, args: string[]): Promise<CommandResult>;
}

// Types

interface InstallConfig {
  targetPath: string; // Where to install (e.g., ~/.claude/)
  templatePath: string; // Where templates are
  adapterOptions?: Record<string, any>;
}

interface InstallResult {
  success: boolean;
  filesInstalled: string[];
  errors: string[];
}

interface HookEvent {
  event: 'SessionStart' | 'Stop' | 'PreToolUse' | string;
  handler: string; // Command path or callback
}

interface MemoryData {
  corrections: Correction[];
  observations: Observation[];
  learnedRules: string;
  evolutionLog: string;
  sessions: SessionRecord[];
}

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}
```

## Implemented Adapters

### Claude Code Adapter (v0.1 — ✅ Current)

| Aspect       | Implementation                                                                |
| ------------ | ----------------------------------------------------------------------------- |
| Installation | Copy template to `~/.claude/` (global) + `.claude/` (project-level, optional) |
| Hooks        | `settings.json` hooks config                                                  |
| Memory       | File-based in `.claude/memory/`                                               |
| Commands     | Slash commands in `.claude/commands/`                                         |
| Agents       | Sub-agent definitions in `.claude/agents/`                                    |
| Status       | ✅ Complete                                                                   |

#### Project-Level Installation

Claude Code supports both global (`~/.claude/`) and project-level (`.claude/` in the project root) configuration. Project-level settings are ideal for team-shared rules, commands, and agents that travel with the repository.

**Project-level directory structure:**

| Path                    | Purpose                                        |
| ----------------------- | ---------------------------------------------- |
| `.claude/settings.json` | Team-shared settings (hooks, permissions, env) |
| `CLAUDE.md`             | Project-level cognitive core (project root)    |
| `.claude/rules/`        | Project-level path-scoped rules                |
| `.claude/commands/`     | Project-level slash commands                   |
| `.claude/agents/`       | Project-level sub-agent definitions            |
| `.claude/skills/`       | Project-level skills                           |
| `.claude/memory/`       | Project-level learning data                    |

#### EvoKit → Claude Code Project-Level Mapping

| EvoKit Concept (Global)    | Claude Code Project-Level Equivalent |
| -------------------------- | ------------------------------------ |
| `~/.claude/` + `CLAUDE.md` | `<project>/.claude/` + `CLAUDE.md`   |
| `~/.claude/settings.json`  | `<project>/.claude/settings.json`    |
| `~/.claude/rules/`         | `<project>/.claude/rules/`           |
| `~/.claude/commands/`      | `<project>/.claude/commands/`        |
| `~/.claude/agents/`        | `<project>/.claude/agents/`          |
| `~/.claude/memory/`        | `<project>/.claude/memory/`          |
| —                          | `<project>/.claude/skills/`          |

### Codex CLI Adapter (v0.3 — ✅ Implemented)

| Aspect         | Implementation                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| Installation   | `evokit init --adapter codex` — copies to `~/.codex/` (global) + `.codex/` (project-level, optional) |
| Hooks          | `hooks.json` — SessionStart, Stop, PreToolUse events                                                 |
| Rules          | Starlark `.rules` files in `~/.codex/rules/`                                                         |
| Memory         | `~/.codex/memory/` (per-adapter, tagged with `assistant: "codex"`)                                   |
| Cognitive Core | `~/.codex/AGENTS.md` (analogous to CLAUDE.md)                                                        |
| Config         | `~/.codex/config.toml` (features, model, permissions)                                                |
| Commands       | `evokit evolve`, `evokit doctor`, shell-based `/boot`                                                |
| Status         | ✅ v0.4.0 — Complete (manifest + uninstall)                                                          |

#### Project-Level Installation

Codex CLI supports both global (`~/.codex/`) and project-level (`.codex/` in the project root) configuration. Project-level settings allow teams to share rules, agents, and hooks within the repository.

**Project-level directory structure:**

| Path                 | Purpose                                        |
| -------------------- | ---------------------------------------------- |
| `.codex/config.toml` | Project-level configuration                    |
| `AGENTS.md`          | Project-level development norms (project root) |
| `.codex/rules/`      | Project-level Starlark permission rules        |
| `.codex/agents/`     | Project-level sub-agents                       |
| `.codex/skills/`     | Project-level skills                           |
| `.codex/hooks/`      | Project-level lifecycle hook scripts           |
| `.codex/memory/`     | Project-level learning data                    |

#### EvoKit → Codex CLI Mapping

| EvoKit Concept                | Codex CLI Equivalent                 |
| ----------------------------- | ------------------------------------ |
| `~/.claude/` + `CLAUDE.md`    | `~/.codex/` + `AGENTS.md`            |
| `.claude/hooks/settings.json` | `hooks.json` + inline `[hooks]` TOML |
| `.claude/rules/` (markdown)   | `.codex/rules/` (Starlark `.rules`)  |
| `.claude/agents/`             | Subagents + Skills                   |
| `.claude/commands/` (`/boot`) | SessionStart hook + `codex exec`     |
| `.claude/memory/` (JSONL)     | `~/.codex/memory/` (per-adapter)     |

#### EvoKit → Codex CLI Project-Level Mapping

| EvoKit Concept (Global)   | Codex CLI Project-Level Equivalent |
| ------------------------- | ---------------------------------- |
| `~/.codex/` + `AGENTS.md` | `<project>/.codex/` + `AGENTS.md`  |
| `~/.codex/config.toml`    | `<project>/.codex/config.toml`     |
| `~/.codex/rules/`         | `<project>/.codex/rules/`          |
| `~/.codex/agents/`        | `<project>/.codex/agents/`         |
| `~/.codex/memory/`        | `<project>/.codex/memory/`         |
| —                         | `<project>/.codex/skills/`         |
| —                         | `<project>/.codex/hooks/`          |

#### Installed Structure

When installed with `evokit init --adapter codex`, the following is created:

```
~/.codex/
├── AGENTS.md              # L1 cognitive core (thinking framework, evolution protocol)
├── hooks.json             # Lifecycle hooks configuration
├── config.toml            # Feature flags, permissions, model settings
├── rules/
│   └── evokit-base.rules  # Starlark safety rules (rm -rf, git push --force, sudo...)
├── hooks-scripts/
│   ├── session-start.sh   # Boot verification on session start
│   ├── stop.sh            # Session recording to ~/.codex/memory/
│   └── pre-tool-use.sh    # Learned rules context injection
└── memory/
    └── README.md          # Learning data directory
```

### OpenCode CLI Adapter (v0.4 — ✅ Implemented)

| Aspect         | Implementation                                                    |
| -------------- | ----------------------------------------------------------------- |
| Installation   | `evokit init --adapter opencode` (or `bash install.sh`, option 3) |
| Hooks          | None — replaced by custom tools in `.opencode/tools/`             |
| Memory         | `.opencode/memory/` (per-adapter, project-level)                  |
| Commands       | Custom tools using `@opencode-ai/plugin`                          |
| Cognitive Core | Project root `AGENTS.md`                                          |
| Config         | Project root `opencode.json`                                      |
| Sub-agents     | `.opencode/agents/` Markdown files                                |
| Status         | ✅ v0.4.0 — Complete                                              |

#### EvoKit → OpenCode CLI Mapping

| EvoKit Concept                   | OpenCode Equivalent                                    |
| -------------------------------- | ------------------------------------------------------ |
| `~/.claude/` + `CLAUDE.md`       | Project root `AGENTS.md`                               |
| `.claude/hooks/settings.json`    | None — custom tools replace hooks                      |
| `.claude/hooks/` (shell scripts) | `.opencode/tools/` (TypeScript, `@opencode-ai/plugin`) |
| `.claude/rules/` (markdown)      | `opencode.json` → `instructions` field (glob patterns) |
| `.claude/agents/`                | `.opencode/agents/` (Markdown + YAML frontmatter)      |
| `.claude/commands/` (`/boot`)    | `.opencode/tools/evokit-boot.ts`                       |
| `.claude/memory/` (JSONL)        | `.opencode/memory/` (per-adapter)                      |
| SessionStart hook                | Custom tool `evokit-boot.ts` (AI-invoked)              |
| Stop hook                        | Custom tool `evokit-session.ts` (AI-invoked)           |

#### Important: No Automatic Hooks

OpenCode has no SessionStart/Stop lifecycle hooks, so:

- **Boot verification is not automatic** — AI must call `evokit-boot.ts` (instructed via `AGENTS.md`)
- **Session recording is not automatic** — AI must call `evokit-session.ts` with `action: "end"` before finishing
- All tools are idempotent — safe to call multiple times

#### Installed Structure

```
project-root/
├── AGENTS.md                          # L1 cognitive core
├── opencode.json                      # OpenCode configuration
└── .opencode/
    ├── tools/
    │   ├── evokit-boot.ts             # Boot verification tool
    │   ├── evokit-evolve.ts           # Evolution audit tool
    │   ├── evokit-memory.ts           # Memory management tool
    │   └── evokit-session.ts          # Session recording tool
    ├── agents/
    │   ├── architect.md               # Architect sub-agent
    │   └── reviewer.md                # Reviewer sub-agent
    └── memory/
        └── README.md                  # Learning data directory
```

### Pi CLI Adapter (v0.6 — ✅ Implemented)

| Aspect         | Implementation                                                                   |
| -------------- | -------------------------------------------------------------------------------- |
| Installation   | `evokit init --adapter pi` — copies to `~/.pi/agent/` + `.pi/`                   |
| Hooks          | TypeScript extensions via `pi.on()` — session_start, session_shutdown, tool_call |
| Memory         | `~/.pi/agent/memory/` (per-adapter, tagged `assistant: "pi"`)                    |
| Commands       | Custom extensions — evokit-boot, evokit-evolve, evokit-memory, evokit-session    |
| Cognitive Core | `~/.pi/agent/AGENTS.md` (analogous to CLAUDE.md)                                 |
| Config         | `~/.pi/agent/settings.json` (skills + extensions)                                |
| Skills         | `~/.pi/agent/skills/evokit/` (Agent Skills standard)                             |
| Sub-agents     | `~/.pi/agent/agent/` Markdown files (architect, reviewer)                        |
| Status         | ✅ v0.6.0 — Complete (Pi CLI ≥ 0.82.0)                                           |

#### EvoKit → Pi CLI Mapping

| EvoKit Concept                   | Pi CLI Equivalent                                       |
| -------------------------------- | ------------------------------------------------------- |
| `~/.claude/` + `CLAUDE.md`       | `~/.pi/agent/` + `AGENTS.md`                            |
| `.claude/hooks/settings.json`    | Extensions via `pi.on()` (TypeScript event system)      |
| `.claude/hooks/` (shell scripts) | `~/.pi/agent/extensions/` (TypeScript, `pi.on()`)       |
| `.claude/rules/` (markdown)      | `AGENTS.md` + extensions (no dedicated rules directory) |
| `.claude/agents/`                | `~/.pi/agent/agent/` (Markdown + YAML frontmatter)      |
| `.claude/commands/` (`/boot`)    | `~/.pi/agent/extensions/evokit-boot.ts`                 |
| `.claude/memory/` (JSONL)        | `~/.pi/agent/memory/` (per-adapter)                     |
| SessionStart hook                | `pi.on("session_start")` in evokit-lifecycle.ts         |
| Stop hook                        | `pi.on("session_shutdown")` in evokit-lifecycle.ts      |
| PreToolUse hook                  | `pi.on("tool_call")` in evokit-lifecycle.ts             |

#### Important: Extension-based Lifecycle

Pi CLI uses TypeScript extensions for lifecycle events, not shell-based hooks:

- **Boot verification is automatic** — `evokit-lifecycle.ts` subscribes to `session_start` via `pi.on()`
- **Session recording is automatic** — `evokit-lifecycle.ts` subscribes to `session_shutdown`
- **Learned rules injection is automatic** — `evokit-lifecycle.ts` subscribes to `tool_call`
- Manual commands also available via `/evokit-boot`, `/evokit-evolve`, `/evokit-memory`, `/evokit-session`

#### Installed Structure

```
~/.pi/agent/
├── AGENTS.md                  # L1 cognitive core (thinking framework, evolution protocol)
├── settings.json              # Skills + extensions configuration
├── extensions/
│   ├── evokit-lifecycle.ts    # Lifecycle events (session_start, session_shutdown, tool_call)
│   ├── evokit-boot.ts        # Boot verification command
│   ├── evokit-evolve.ts      # Evolution audit command
│   ├── evokit-memory.ts      # Memory management command
│   └── evokit-session.ts     # Session recording command
├── skills/evokit/
│   └── SKILL.md              # EvoKit skill definition
├── agent/
│   ├── architect.md           # Architect sub-agent
│   └── reviewer.md            # Reviewer sub-agent
└── memory/
    └── README.md              # Learning data directory
```

## Per-Adapter Learning Data

Each adapter stores its learning data in its own directory:

| Adapter      | Memory Path (Global)         | Memory Path (Project)         |
| ------------ | ---------------------------- | ----------------------------- |
| Claude Code  | `~/.claude/memory/`          | `<project>/.claude/memory/`   |
| Codex CLI    | `~/.codex/memory/`           | `<project>/.codex/memory/`    |
| OpenCode CLI | `~/.config/opencode/memory/` | `<project>/.opencode/memory/` |
| Pi CLI       | `~/.pi/agent/memory/`        | `<project>/.pi/memory/`       |

Each session record identifies the assistant with a tag:

```json
{
  "timestamp": "2026-06-11T14:30:00",
  "assistant": "opencode",
  "duration_seconds": 300,
  "corrections": 2,
  "score": "A"
}
```

Each session record identifies the assistant:

```json
{
  "timestamp": "2026-06-11T14:30:00",
  "assistant": "claude-code",
  "duration_seconds": 300,
  "corrections": 2,
  "observations": 1,
  "score": "A"
}
```

## Contribution

To add a new adapter:

1. Implement the `AgentAdapter` interface
2. Create a template in `template/adapters/<name>/`
3. Write tests in `tests/<name>-adapter/`
4. Update this document
5. Submit a PR!

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.
