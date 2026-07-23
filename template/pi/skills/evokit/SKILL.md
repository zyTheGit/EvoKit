---
name: evokit
description: EvoKit self-evolving system — boot verification, evolution audit, memory management, and session recording for Pi CLI
allowed-tools: read write bash
---

# EvoKit Skill

Use this skill when the user asks about EvoKit, self-evolving systems, boot verification, evolution audit, or learning data management.

## Available Commands

| Command           | Description                                                             |
| ----------------- | ----------------------------------------------------------------------- |
| `/evokit-boot`    | Run boot verification — check system integrity and learned rules        |
| `/evokit-evolve`  | Run evolution audit — promote corrections to learned rules              |
| `/evokit-memory`  | Manage learning data — record corrections, observations, inject context |
| `/evokit-session` | Record session lifecycle — call with `action: "end"` before finishing   |

## When to Use

- **Session start**: Boot verification runs automatically via `evokit-lifecycle` extension
- **User corrects you**: Call `/evokit-memory` with `action: record-correction`
- **You notice a pattern**: Call `/evokit-memory` with `action: record-observation`
- **Session end**: Session recording is automatic via `session_shutdown` event
- **Evolution audit**: Call `/evokit-evolve` when corrections accumulate (10+ entries)
