# OpenCode CLI Adapter — Development Plan

> **Branch:** `feat/opencode-adapter`
> **Target:** EvoKit v0.4.0
> **Status:** ✅ Complete (shipped in v0.5.0)

## Architecture Overview

Unlike Claude Code (hooks via `settings.json`) and Codex CLI (hooks via `hooks.json`), **OpenCode has no lifecycle hooks**. The adapter uses its custom tool system instead.

### EvoKit Feature Mapping

| EvoKit Feature        | OpenCode Mechanism                    | Details                                        |
| --------------------- | ------------------------------------- | ---------------------------------------------- |
| L1 Cognitive Core     | `AGENTS.md`                           | Primary rule file in project root              |
| Evolution Commands    | **Custom Tools** (`.opencode/tools/`) | TypeScript tools using `@opencode-ai/plugin`   |
| Boot Verification     | Custom tool `evokit-boot.ts`          | Replaces SessionStart hook                     |
| Session Recording     | Custom tool `evokit-session.ts`       | Replaces Stop hook                             |
| Rule/Memory Injection | Custom tool `evokit-memory.ts`        | Replaces PreToolUse hook                       |
| Sub-agents            | `.opencode/agents/` Markdown files    | Architect, Reviewer                            |
| Learning Data         | `.opencode/memory/`                   | **Per-adapter**, not shared                    |
| Config                | `opencode.json`                       | With `instructions` field for extra rule files |

### ⚠️ Key Asymmetry: No Hooks

OpenCode has no SessionStart/Stop/PreToolUse hooks. This means:

- **Session recording is not automatic** — AI must be instructed (in `AGENTS.md`) to call `evokit-session.ts` before finishing
- **Boot verification is not automatic** — AI must be instructed to call `evokit-boot.ts` at session start
- **Reliability strategy**: `AGENTS.md` will contain explicit reminders; the tools themselves are idempotent and safe to call multiple times

---

## Memory Architecture Decision

### Principle: Each Adapter's Memory Goes in Its Own Directory

```
~/.claude/memory/              ← Claude Code's memory
.opencode/memory/              ← OpenCode's memory (under project root .opencode/)
~/.codex/memory/               ← Codex CLI's memory
```

### Scope of Changes

Existing **Claude Code** and **Codex CLI** adapters need modification:

#### Claude Code (Current State)

Current memory is at `~/.claude/memory/` — this already belongs to Claude Code, **no change needed**, it's its own "territory."

#### Codex CLI

Currently `template/codex/AGENTS.md` and `codex-adapter.ts` point to `~/.claude/memory/` as shared memory. This should be changed to `~/.codex/memory/`.

- Modify `template/codex/AGENTS.md`: `__HOME__/.claude/memory/` → `__HOME__/.codex/memory/`
- Modify `src/adapters/codex-adapter.ts`: `SHARED_MEMORY_DIR`
- Modify `src/adapters/codex-installer.ts`: memory directory creation

#### OpenCode (New)

Memory goes in `.opencode/memory/` (project-level), with a global fallback to `~/.config/opencode/memory/`.

- `template/opencode/AGENTS.md` references `.opencode/memory/`
- Custom tool reads/writes `.opencode/memory/`

### Design Rationale

| Dimension                    | Shared (Old)                                      | Per-Directory (New)                     |
| ---------------------------- | ------------------------------------------------- | --------------------------------------- |
| **Mental model**             | "My data lives in someone else's house"           | "Each manages its own"                  |
| **Clean uninstall**          | Uninstalling OpenCode can't delete `.claude/`     | Just delete `.opencode/`                |
| **Dependency**               | OpenCode depends on `.claude/` existence          | **No external dependency**              |
| **Permission isolation**     | Need to handle file permission 600                | Naturally isolated                      |
| **Async write conflicts**    | Two agents may write the same file simultaneously | Completely independent                  |
| **Cross-agent fusion value** | EvoKit has no fusion logic — benefit = 0          | No loss; future `evokit sync` can merge |

---

## Plan Structure

### Phase 0: Background Study ✅ (Complete)

- [x] Read OpenCode Chinese documentation (agents, rules, tools, MCP)
- [x] Study EvoKit adapter interface (`MULTI_AGENT.md`)
- [x] Analyze existing adapters (Claude Code, Codex CLI)
- [x] Identify missing hooks → custom tools replacement strategy
- [x] Memory-per-adapter architecture decision

### Phase 1: Fix Existing Adapters — Memory Isolation

**Objective**: Move Codex CLI memory out of `~/.claude/memory/` into `~/.codex/memory/`.

**Files to modify:**

| File                              | Change                                                                      |
| --------------------------------- | --------------------------------------------------------------------------- |
| `src/adapters/codex-adapter.ts`   | `SHARED_MEMORY_DIR` → `.codex/memory`                                       |
| `src/adapters/codex-installer.ts` | Add `memory` to `CODEX_SUBDIRS`, remove shared `~/.claude/memory/` creation |
| `template/codex/AGENTS.md`        | `__HOME__/.claude/memory/` → `__HOME__/.codex/memory/`                      |

### Phase 2: OpenCode Template & Installer (3 files)

**Objective**: Create the installable OpenCode template and installer module.

#### 2.1 Create `template/opencode/` directory structure

```
template/opencode/
├── AGENTS.md                  # L1 cognitive core
├── opencode.json               # Configuration reference
├── tools/
│   ├── evokit-boot.ts          # Boot verification tool
│   ├── evokit-evolve.ts        # Evolution audit tool
│   ├── evokit-memory.ts        # Memory management tool
│   └── evokit-session.ts       # Session recording tool
├── agents/
│   ├── architect.md            # Architect sub-agent
│   └── reviewer.md             # Reviewer sub-agent
└── memory/
    └── README.md               # Explanation of .opencode/memory/
```

**Files to create:**

1. `template/opencode/AGENTS.md` — Cognitive core adapted for OpenCode
2. `template/opencode/opencode.json` — `$schema` + `instructions` + agent config
3. `template/opencode/memory/README.md` — Explain per-adapter memory

#### 2.2 Create `src/adapters/opencode-installer.ts`

**Function exports:**

- `resolveOpenCodeHome(homeDir)` — Returns `~/.config/opencode/` (respects `XDG_CONFIG_HOME`)
- `resolveOpenCodeProjectDir(projectDir)` — Returns `.opencode/` from project root
- `installOpenCodeTemplate(config)` — Copies template, replaces `__HOME__` placeholders
- `verifyOpenCodeInstallation()` — Integrity checks

**Template installation logic:**

1. Copy `template/opencode/AGENTS.md` → project root `AGENTS.md` (skip if exists, `--force` to overwrite)
2. Copy `template/opencode/opencode.json` → project root `opencode.json` (skip if exists)
3. Copy `.opencode/tools/*.ts` → project `.opencode/tools/`
4. Copy `.opencode/agents/*.md` → project `.opencode/agents/`
5. Copy `.opencode/memory/*` → project `.opencode/memory/`
6. Replace `__HOME__` placeholders in all installed files
7. Set permissions

### Phase 3: Full Adapter Implementation (2 files)

**Objective**: Implement the `AgentAdapter` interface in TypeScript.

#### 3.1 Rewrite `src/adapters/opencode-adapter.ts`

**Implements:**

- `name` → `'opencode'`
- `install(config)` → delegates to `installOpenCodeTemplate()`
- `setupHooks(events)` → **No-op** (OpenCode has no hooks; logs a warning if events are passed)
- `injectMemory(data)` → Writes to `.opencode/memory/` (via `context.directory` from custom tool)
- `exportMemory()` → Reads from `.opencode/memory/`
- `runCommand(name, args)` → Injects guidance for using the corresponding custom tool

**New types to add to `src/core/types.ts`:**

```typescript
export interface OpenCodeAdapterOptions {
  opencodeConfigDir?: string; // Default: ~/.config/opencode/
  opencodeProjectDir?: string; // Default: .opencode/
  dryRun?: boolean;
}
```

#### 3.2 Create `src/adapters/opencode-hooks.ts`

Since OpenCode has no hooks, this file contains **tool source code generators**:

- `generateBootToolSource()` → Returns TypeScript source for `evokit-boot.ts`
- `generateEvolveToolSource()` → Returns TypeScript source for `evokit-evolve.ts`
- `generateMemoryToolSource()` → Returns TypeScript source for `evokit-memory.ts`
- `generateSessionToolSource()` → Returns TypeScript source for `evokit-session.ts`

These can be used programmatically when EvoKit updates the tools after its own evolution.

### Phase 4: Custom Tools Implementation (4 files)

**Objective**: Create TypeScript custom tools for `.opencode/tools/`.

#### 4.1 `evokit-boot.ts` — Boot Verification

```typescript
import { tool } from '@opencode-ai/plugin';

export default tool({
  description: 'Run EvoKit boot verification — check system integrity and learned rules',
  args: {},
  async execute(args, context) {
    // 1. Read learned-rules.md from .opencode/memory/
    // 2. Run each verify command
    // 3. Read violations.jsonl
    // 4. Check AGENTS.md, opencode.json, .opencode/ structure
    // 5. Return structured integrity report
  },
});
```

#### 4.2 `evokit-evolve.ts` — Evolution Audit

Parameters: `dryRun` (boolean, optional)

Logic:

1. Read `corrections.jsonl`, group by pattern
2. Promote patterns with count >= 2 to `learned-rules.md`
3. Record decisions in `evolution-log.md`
4. Handle confidence decay, rotation, archiving

#### 4.3 `evokit-memory.ts` — Memory Management

Parameters: `action` ("inject" | "export" | "record-correction"), `pattern`?, `context`?

Logic:

- `inject`: Load AGENTS.md + learned-rules.md context
- `export`: Read all JSONL files
- `record-correction`: Append to corrections.jsonl

#### 4.4 `evokit-session.ts` — Session Recording

Parameters: `action` ("start" | "end"), `duration`?

Logic:

- Write session entry to sessions.jsonl with `assistant: "opencode"` tag

### Phase 5: Agent Definitions (2 files)

#### 5.1 `.opencode/agents/architect.md`

```markdown
---
description: Designs implementation plans for complex multi-step tasks
mode: subagent
temperature: 0.1
tools:
  write: false
  edit: false
  bash: false
---

You are the EvoKit Architect...
```

#### 5.2 `.opencode/agents/reviewer.md`

```markdown
---
description: Reviews code for quality, bugs, and security
mode: subagent
temperature: 0.1
tools:
  write: false
  edit: false
  bash: false
---

You are the EvoKit Reviewer...
```

### Phase 6: Integration & Registration (3 files)

#### 6.1 Update `src/adapters/index.ts`

Export OpenCode adapter functions.

#### 6.2 CLI Wiring

Support `evokit init --adapter opencode`, `evokit doctor --adapter opencode`.

#### 6.3 Tests

Create `tests/opencode-adapter/`:

- `installer.test.ts` — Template installation, placeholder replacement
- `adapter.test.ts` — Adapter interface compliance
- `tools.test.ts` — Custom tool code generation

### Phase 7: Documentation (2 files)

#### 7.1 Update `MULTI_AGENT.md`

Add OpenCode row with accurate info:

| Aspect         | Implementation                             |
| -------------- | ------------------------------------------ |
| Installation   | Template copy to project root `.opencode/` |
| Hooks          | None — replaced by custom tools            |
| Memory         | `.opencode/memory/` (per-adapter)          |
| Commands       | Custom tools in `.opencode/tools/`         |
| Cognitive Core | Project root `AGENTS.md`                   |
| Config         | Project root `opencode.json`               |
| Sub-agents     | `.opencode/agents/` Markdown files         |

Also update Claude Code and Codex rows to indicate per-adapter memory.

#### 7.2 Update `src/adapters/adapter-spec.md`

Mark OpenCode as "🔜 In Progress v0.4.0".

## Implementation Order

```
Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5 ──► Phase 6 ──► Phase 7
  │            │            │            │            │            │
  ├─ codex     ├─ AGENTS   ├─ adapter   ├─ boot.ts   ├─ architect ├─ index.ts
  │  memory    │  .md       │  .ts        │            │  .md       │
  │  isolation │            │            ├─ evolve   ├─ reviewer ├─ CLI
  ├─ codex     ├─ installer├─ hooks      │  .ts        │  .md       │  wiring
  │  installer │  .ts       │  .ts        │            │            │
  │            │            │            ├─ memory   │            ├─ tests
  └─ codex     └─ opencode └─ types      │  .ts        │            │
     AGENTS      .json       更新         │            │            └─ MULTI_
     .md                                  ├─ session  │              AGENT.md
  (Codex fix)                             │  .ts        │
                                          └───────────┘
```

## Key Design Decisions

1. **Custom tools instead of hooks** — OpenCode lacks a hook system so EvoKit commands become `@opencode-ai/plugin` custom tools
2. **AGENTS.md as the primary rule file** — Uses OpenCode's native format
3. **Per-adapter memory** — `.opencode/memory/` instead of shared `~/.claude/memory/`. Claude Code keeps `~/.claude/memory/`, Codex CLI gets `~/.codex/memory/`
4. **opencode.json's `instructions` field** — For including additional rule files via glob patterns
5. **Minimal AGENTS.md** — Below 150 lines, same as CLAUDE.md limit
6. **Reliability strategy for missing hooks** — AGENTS.md instructs AI to call boot/session tools; tools are idempotent
