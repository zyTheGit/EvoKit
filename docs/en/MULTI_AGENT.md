# Multi-Agent Adapter Architecture

> **Status:** Planned for v0.3+ / v0.4+
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

## Planned Adapters

### Claude Code Adapter (v0.1 — ✅ Current)

| Aspect       | Implementation                             |
| ------------ | ------------------------------------------ |
| Installation | Copy template to `~/.claude/`              |
| Hooks        | `settings.json` hooks config               |
| Memory       | File-based in `.claude/memory/`            |
| Commands     | Slash commands in `.claude/commands/`      |
| Agents       | Sub-agent definitions in `.claude/agents/` |
| Status       | ✅ Complete                                |

### Codex CLI Adapter (v0.3 — ✅ Implemented)

| Aspect         | Implementation                                                     |
| -------------- | ------------------------------------------------------------------ |
| Installation   | `evokit init --adapter codex` — copies to `~/.codex/`              |
| Hooks          | `hooks.json` — SessionStart, Stop, PreToolUse events               |
| Rules          | Starlark `.rules` files in `~/.codex/rules/`                       |
| Memory         | `~/.codex/memory/` (per-adapter, tagged with `assistant: "codex"`) |
| Cognitive Core | `~/.codex/AGENTS.md` (analogous to CLAUDE.md)                      |
| Config         | `~/.codex/config.toml` (features, model, permissions)              |
| Commands       | `evokit evolve`, `evokit doctor`, shell-based `/boot`              |
| Status         | ✅ v0.3.0 — Complete                                               |

#### EvoKit → Codex CLI Mapping

| EvoKit Concept                | Codex CLI Equivalent                 |
| ----------------------------- | ------------------------------------ |
| `~/.claude/` + `CLAUDE.md`    | `~/.codex/` + `AGENTS.md`            |
| `.claude/hooks/settings.json` | `hooks.json` + inline `[hooks]` TOML |
| `.claude/rules/` (markdown)   | `.codex/rules/` (Starlark `.rules`)  |
| `.claude/agents/`             | Subagents + Skills                   |
| `.claude/commands/` (`/boot`) | SessionStart hook + `codex exec`     |
| `.claude/memory/` (JSONL)     | `~/.codex/memory/` (per-adapter)     |

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

### Pi CLI Adapter (v0.4 — 🔜 Planned)

| Aspect       | Implementation                         |
| ------------ | -------------------------------------- |
| Installation | ~/.pi/agent/ (global) + .pi/ (project) |
| Hooks        | Pi CLI extensions + skills             |
| Memory       | ~/.pi/agent/ memory (per-adapter)      |
| Commands     | Pi CLI skills                          |

## Per-Adapter Learning Data

Each adapter stores its learning data in its own directory:

| Adapter      | Memory Path                   |
| ------------ | ----------------------------- |
| Claude Code  | `~/.claude/memory/`           |
| Codex CLI    | `~/.codex/memory/`            |
| OpenCode CLI | `<project>/.opencode/memory/` |

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
