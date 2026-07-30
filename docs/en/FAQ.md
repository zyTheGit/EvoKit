# Frequently Asked Questions

## General

### What is EvoKit?

EvoKit is an open-source **project context engine** that gives AI coding assistants (Claude Code, Codex, etc.) the ability to persist project/personal knowledge and maintain understanding of a project across sessions. Through conversation extraction, knowledge indexing, and staleness detection, it helps AI instantly understand your project.

### Is this an official Anthropic product?

No. EvoKit is a community project that extends Claude Code's capabilities via its hooks and configuration system. It is not affiliated with Anthropic.

### Does EvoKit send my data anywhere?

**No.** All data stays in the local `evokit/` knowledge base directory (e.g. `~/.claude/memory/evokit/`). No cloud, no telemetry, no external API calls.

## Knowledge System

### How does the AI learn?

EvoKit works through a **conversation extraction** mechanism: the AI identifies project/personal knowledge during conversations (project conventions, personal preferences, architectural decisions, etc.) and silently writes it to the `.pending/` directory. After the user confirms via `/evokit-learn`, the knowledge is persisted to the `knowledge/` directory and the index is updated. Users can also explicitly declare knowledge via `/evokit-learn "content"`.

### What types of knowledge are there?

| Type         | Description      | Example                            |
| ------------ | ---------------- | ---------------------------------- |
| convention   | Project convention | "Use Result<T> instead of throw" |
| preference   | Personal preference | "Use uv instead of pip"         |
| architecture | Architectural decision | "packages/api is upstream"   |
| workflow     | Workflow rule    | "Use conventional commit format"   |

### How do I use /evokit-learn?

- `/evokit-learn` — Display pending entries in `.pending/` + review new knowledge identified in the conversation
- `/evokit-learn "content"` — Explicitly declare knowledge, written directly to `knowledge/`

**Pending entry confirmation flow:**

1. Run `/evokit-learn` to display all pending entries
2. User responds in conversation (natural language), e.g. "Confirm 1 and 3, reject 2"
3. Confirmed entries are moved to `knowledge/` and `knowledge-index.md` is updated; rejected entries are deleted from `.pending/`

### How do I confirm pending knowledge?

Run `/evokit-learn`, which displays all pending entries. You can:
- Confirm or reject using natural language (e.g. "Confirm 1 and 3, reject 2")
- Review each entry individually and decide whether to accept

Confirmed entries are moved from `.pending/` to `knowledge/` and the index is updated; rejected entries are deleted.

### I corrected the AI but nothing happened

EvoKit provides the **infrastructure** for knowledge persistence. The actual extraction of knowledge depends on the AI following the knowledge identification protocol in CLAUDE.md. If knowledge isn't being recorded, check:

1. The SessionStart hook is running (`/evokit-boot` works)
2. The `evokit/.pending/` directory exists
3. You're running a compatible version of Claude Code

### How do I run a knowledge base integrity check?

```
/evokit-boot
```

This performs a deep integrity check on the knowledge base, including directory structure, index format, entry completeness, frontmatter validity, and pending entries. The SessionStart hook automatically runs a quick check at the start of each session.

## Installation

### I get "hooks must be an array of matchers"

This means you're using the old hook format in `settings.json`. Use the template's `settings.json` or check the `INSTALL.md` for the correct format.

### Can I install on Windows?

Yes — via WSL or Git Bash. The template hooks use bash scripts which work in both environments.

### I already have a .claude/ directory, will the installer break it?

The installer backs up your existing configuration first to `~/.claude/backups/`. Existing `CLAUDE.md` and `settings.json` are preserved — only missing items are added.

### How do I migrate from v0.x to v1.0?

Run the `evokit migrate` command. It detects legacy data files (`learned-rules.md`, `corrections.jsonl`, `observations.jsonl`, etc.), converts migratable rules to v1.0 knowledge entry format, and archives legacy files to `evokit/archive/v0/`. Use `--dry-run` to preview migration results.

## Multi-Agent

### Does EvoKit work with Codex?

**Yes!** Codex CLI support is available as of v0.3.0. Install with:

```bash
evokit install --adapter codex
```

This installs EvoKit templates to `~/.codex/`, configuring:

- `AGENTS.md` — cognitive core with thinking framework and knowledge protocol
- `hooks.json` — lifecycle hooks (SessionStart, Stop, PreToolUse)
- `rules/` — Starlark safety rules
- Independent `~/.codex/memory/evokit/` knowledge base directory

### Does EvoKit work with OpenCode?

**Yes!** OpenCode CLI support is available as of v0.5.0. Install with:

```bash
evokit install --adapter opencode
```

This installs EvoKit templates into the project directory, configuring custom tools (`evokit-boot.ts`, `evokit-learn.ts`, etc.) instead of lifecycle hooks. OpenCode has its own independent `~/.config/opencode/memory/evokit/` knowledge base directory.

### Does EvoKit work with Pi CLI?

**Yes!** Pi CLI support is available as of v0.6.0. Install with:

```bash
evokit install --adapter pi
```

This installs EvoKit templates to `~/.pi/agent/`, configuring TypeScript extensions (`evokit-lifecycle.ts`, etc.) for lifecycle events. Pi CLI has its own independent `~/.pi/agent/memory/evokit/` knowledge base directory.

### Do different AI assistants share knowledge?

**No.** Each adapter has its own independent `evokit/` knowledge base directory (e.g. `~/.claude/memory/evokit/`, `~/.codex/memory/evokit/`, `~/.config/opencode/memory/evokit/`). This ensures knowledge from different assistants doesn't interfere. If you need to share specific knowledge across assistants, you can manually declare it in another assistant using `/evokit-learn "content"`.

### How do I check if my installation is healthy?

```bash
evokit doctor --adapter claude
# Or check all adapters:
evokit doctor --adapter all
```

You can also run `/evokit-boot` in Claude Code for a deep knowledge base integrity check.

## Troubleshooting

### SessionStart hook doesn't run

Check `~/.claude/settings.json` — verify the hook command path exists and is correct. Restart Claude Code after changes.

### /evokit-boot shows missing directories

The installer may not have copied all files. Run the installer again or manually check each directory.

### Path not replaced during migration

If you see old paths in hooks or settings, run the path fix step manually:

```bash
grep -r "/home/olduser" ~/.claude/  # Find old paths
sed -i 's|/home/olduser|/home/newuser|g' ~/.claude/settings.json
sed -i 's|/home/olduser|/home/newuser|g' ~/.claude/hooks/*.sh
```

### Permissions issues

```bash
chmod +x ~/.claude/hooks/*.sh
```

### What about legacy data?

If you are upgrading from v0.x, legacy data files (`learned-rules.md`, `corrections.jsonl`, `observations.jsonl`) need to be migrated to v1.0 knowledge entry format via `evokit migrate`. After migration, legacy files are archived to `evokit/archive/v0/` and are not deleted.
