# Multi-Agent Adapter Architecture

> **Status:** ✅ Implemented — All four adapters (Claude Code, Codex CLI, OpenCode CLI, Pi CLI) are complete
> This document defines the adapter interface for integrating with other AI coding assistants.

## Motivation

EvoKit works with 4 AI coding assistants (Claude Code, Codex, OpenCode, Pi) via hooks/extensions/tools, providing a **project-context engine** (conversation extraction + endorsement). Knowledge is **assistant-agnostic** — any assistant can read/write the same knowledge.

The adapter architecture decouples the knowledge engine from any one assistant, allowing knowledge to be shared across tools (read-agnostic / write-per-assistant confirmation).

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
   * Extracts what the assistant has learned (corrections, observations) — v0.  v1.0 knowledge lives in shared root; no export needed.
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
  // v0 shape (deprecated). In v1.0 knowledge flows via the shared knowledge root `~/.evokit/knowledge/` + endorsement; this interface no longer holds corrections/observations/sessions.
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
| Memory       | Private data in `.claude/memory/`; shared knowledge in `~/.evokit/knowledge/` + `<project>/.evokit/` |
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
| `.claude/memory/`       | Private-data dir (shared knowledge lives in `.evokit/` root)      |

#### EvoKit → Claude Code Project-Level Mapping

| EvoKit Concept (Global)    | Claude Code Project-Level Equivalent |
| -------------------------- | ------------------------------------ |
| `~/.claude/` + `CLAUDE.md` | `<project>/.claude/` + `CLAUDE.md`   |
| `~/.claude/settings.json`  | `<project>/.claude/settings.json`    |
| `~/.claude/rules/`         | `<project>/.claude/rules/`           |
| `~/.claude/commands/`      | `<project>/.claude/commands/`        |
| `~/.claude/agents/`        | `<project>/.claude/agents/`          |
| `~/.claude/memory/`        | `<project>/.claude/memory/` (private data; knowledge in `.evokit/`)          |
| —                          | `<project>/.claude/skills/`          |

### Codex CLI Adapter (v0.3 — ✅ Implemented)

| Aspect         | Implementation                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| Installation   | `evokit init --adapter codex` — copies to `~/.codex/` (global) + `.codex/` (project-level, optional) |
| Hooks          | `hooks.json` — SessionStart, Stop, PreToolUse events                                                 |
| Rules          | Starlark `.rules` files in `~/.codex/rules/`                                                         |
| Memory         | `~/.codex/memory/` (private data; shared knowledge in `~/.evokit/knowledge/`)                                   |
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
| `.codex/memory/`     | Private-data dir (shared knowledge in `.evokit/` root)                    |

#### EvoKit → Codex CLI Mapping

| EvoKit Concept                | Codex CLI Equivalent                 |
| ----------------------------- | ------------------------------------ |
| `~/.claude/` + `CLAUDE.md`    | `~/.codex/` + `AGENTS.md`            |
| `.claude/hooks/settings.json` | `hooks.json` + inline `[hooks]` TOML |
| `.claude/rules/` (markdown)   | `.codex/rules/` (Starlark `.rules`)  |
| `.claude/agents/`             | Subagents + Skills                   |
| `.claude/commands/` (`/boot`) | SessionStart hook + `codex exec`     |
| `.claude/memory/` (JSONL)     | `~/.codex/memory/` (private data; knowledge in shared root)     |

#### EvoKit → Codex CLI Project-Level Mapping

| EvoKit Concept (Global)   | Codex CLI Project-Level Equivalent |
| ------------------------- | ---------------------------------- |
| `~/.codex/` + `AGENTS.md` | `<project>/.codex/` + `AGENTS.md`  |
| `~/.codex/config.toml`    | `<project>/.codex/config.toml`     |
| `~/.codex/rules/`         | `<project>/.codex/rules/`          |
| `~/.codex/agents/`        | `<project>/.codex/agents/`         |
| `~/.codex/memory/`        | `<project>/.codex/memory/` (private data; knowledge in `.evokit/`)         |
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
│   ├── stop.sh            # Session-end pending hint (knowledge in ~/.evokit/knowledge/)
│   └── pre-tool-use.sh    # Learned rules context injection
└── memory/
    └── README.md          # Learning data directory
```

### OpenCode CLI Adapter (v0.4 — ✅ Implemented)

| Aspect         | Implementation                                                    |
| -------------- | ----------------------------------------------------------------- |
| Installation   | `evokit init --adapter opencode` (or `bash install.sh`, option 3) |
| Hooks          | None — replaced by custom tools in `.opencode/tools/`             |
| Memory         | `.opencode/memory/` (private data; shared knowledge in `~/.evokit/knowledge/`)                  |
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
| `.claude/memory/` (JSONL)        | `.opencode/memory/` (private data; knowledge in shared root)                      |
| SessionStart hook                | Custom tool `evokit-boot.ts` (AI-invoked)              |
| Stop hook                        | Custom tool `evokit-session.ts` (AI-invoked)           |

#### Important: No Automatic Hooks

OpenCode has no SessionStart/Stop lifecycle hooks, so:

- **Boot verification is not automatic** — AI must call `evokit-boot.ts` (instructed via `AGENTS.md`)
- **Session-end flush is not automatic** — AI must call `evokit-session.ts` with `action: "flush_pending"` before finishing (no-Stop equivalent trigger)
- All tools are idempotent — safe to call multiple times

#### Installed Structure

```
project-root/
├── AGENTS.md                          # L1 cognitive core
├── opencode.json                      # OpenCode configuration
└── .opencode/
    ├── tools/
    │   ├── evokit-boot.ts             # Knowledge integrity check tool
    │   ├── evokit-learn.ts            # Endorse / explicit declare tool
    │   └── evokit-session.ts          # Session-end flush_pending tool
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
| Memory         | `~/.pi/agent/memory/` (private data; shared knowledge in `~/.evokit/knowledge/`)                    |
| Commands       | Custom extensions — evokit-boot, evokit-learn                        |
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
| `.claude/memory/` (JSONL)        | `~/.pi/agent/memory/` (private data; knowledge in shared root)                     |
| SessionStart hook                | `pi.on("session_start")` in evokit-lifecycle.ts         |
| Stop hook                        | `pi.on("session_shutdown")` in evokit-lifecycle.ts      |
| PreToolUse hook                  | `pi.on("tool_call")` in evokit-lifecycle.ts             |

#### Important: Extension-based Lifecycle

Pi CLI uses TypeScript extensions for lifecycle events, not shell-based hooks:

- **Boot verification is automatic** — `evokit-lifecycle.ts` subscribes to `session_start` via `pi.on()`
- **Session recording is automatic** — `evokit-lifecycle.ts` subscribes to `session_shutdown`
- **Learned rules injection is automatic** — `evokit-lifecycle.ts` subscribes to `tool_call`
- Manual commands also available via `evokit-boot`, `evokit learn`

#### Installed Structure

```
~/.pi/agent/
├── AGENTS.md                  # L1 cognitive core (thinking framework, evolution protocol)
├── settings.json              # Skills + extensions configuration
├── extensions/
│   ├── evokit-lifecycle.ts    # Lifecycle events (session_start, session_shutdown)
│   ├── evokit-boot.ts        # Knowledge integrity check command
│   └── evokit-learn.ts       # Endorse / explicit declare command
├── skills/evokit/
│   └── SKILL.md              # EvoKit skill definition
├── agent/
│   ├── architect.md           # Architect sub-agent
│   └── reviewer.md            # Reviewer sub-agent
└── memory/
    └── README.md              # Learning data directory
```

## Shared Knowledge Root (v1.0)

All assistants share the same knowledge (read-agnostic / write-per-assistant confirmation); the knowledge roots are detached from any assistant's private directory:

| Tier    | Location                  | Description                                  |
| ------- | ------------------------- | -------------------------------------------- |
| Personal | `~/.evokit/knowledge/`   | Cross-project, agent-agnostic (shared by 4)  |
| Project | `<project>/.evokit/`     | Follows git, shared by 4 assistants           |

Each root contains `knowledge-index.md` (index) / `knowledge/` (entries) / `.pending/` (drafts).

The only write gate = **human endorsement**: each assistant triggers confirmation (claude/codex=Stop, opencode=`evokit-session --action flush_pending` session-end flush, pi=`session_shutdown`), all landing on the same `evokit learn` semantics.

## Deprecated Concepts

The v0.x per-adapter independent `memory/` (corrections.jsonl / observations.jsonl / learned-rules.md / evolution-log.md / sessions.jsonl / violations.jsonl) and `evokit-evolve` / `evokit-memory` record-* are **deprecated in v1.0**, replaced by the shared knowledge root + conversation extraction + endorsement above.

## Contribution

To add a new adapter:

1. Implement the `AgentAdapter` interface
2. Create a template in `template/adapters/<name>/`
3. Write tests in `tests/<name>-adapter/`
4. Update this document
5. Submit a PR!

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.
