# EvoKit Adapter Specification

## Overview

EvoKit adapters allow the self-evolving system to work with different AI coding assistants. Each adapter implements a common interface to bridge between EvoKit's learning pipeline and the assistant's plugin/hook system.

## Current Status

| Adapter | Status | Version |
|---------|--------|---------|
| Claude Code | ✅ Complete | v0.1.0 |
| Codex CLI | 🔜 Planned | v0.3.0 |
| OpenCode CLI | 🔜 Planned | v0.4.0 |
| Aider | 🔜 Planned | v0.4.0 |

## Interface

See [MULTI_AGENT.md](../../docs/MULTI_AGENT.md) for the full `AgentAdapter` interface specification.

## Adding a New Adapter

1. Create `src/adapters/<name>-adapter.ts`
2. Implement the `AgentAdapter` interface
3. Create template files in `template/adapters/<name>/`
4. Register in `src/adapters/index.ts`
5. Write tests in `tests/<name>-adapter/`
6. Submit a PR!

## Template Structure

Each adapter template should include:

```
template/adapters/<name>/
├── config            # Assistant-specific config
├── hooks/            # Hook/event handlers
├── rules/            # Shared rules (if applicable)
└── README.md         # Adapter-specific install guide
```
