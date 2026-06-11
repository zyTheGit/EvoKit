# Frequently Asked Questions

## General

### What is EvoKit?
EvoKit is an open-source framework that gives AI coding assistants (Claude Code, Codex, etc.) the ability to learn from corrections across sessions. It persists knowledge in files so the AI gets better over time.

### Is this an official Anthropic product?
No. EvoKit is a community project that extends Claude Code's capabilities via its hooks and configuration system. It is not affiliated with Anthropic.

### Does EvoKit send my data anywhere?
**No.** All data stays in your `~/.claude/memory/` directory. No cloud, no telemetry, no external API calls from the evolution system.

## Learning System

### How does the AI learn?
Every time you correct the AI, the correction is recorded in `corrections.jsonl`. The same pattern appearing 2+ times gets promoted to `learned-rules.md`. After 10+ sessions of verification, it can graduate to permanent rules.

### I corrected the AI but nothing happened
EvoKit provides the **infrastructure** for learning. The actual recording of corrections depends on Claude following the CLAUDE.md protocol. If corrections aren't being recorded, check:

1. The SessionStart hook is running (`/boot` works)
2. `corrections.jsonl` exists in `~/.claude/memory/`
3. You're running a compatible version of Claude Code

### How do I run an evolution audit?
```
/evolve
```

Run this every ~10 sessions to promote patterns and prune stale rules.

### My learned-rules.md is full
Run `/evolve`. It will suggest which rules to prune or graduate.

## Installation

### I get "hooks must be an array of matchers"
This means you're using the old hook format in `settings.json`. Use the template's `settings.json` or check the `INSTALL.md` for the correct format.

### Can I install on Windows?
Yes — via WSL or Git Bash. The template hooks use bash scripts which work in both environments.

### I already have a .claude/ directory, will the installer break it?
The installer backs up your existing configuration first to `~/.claude/backups/`. Existing `CLAUDE.md` and `settings.json` are preserved — only missing items are added.

## Multi-Agent

### Does EvoKit work with Codex?
Not yet. Codex adapter is planned for v0.3.0.

### Does EvoKit work with OpenCode?
Not yet. OpenCode adapter is planned for v0.4.0.

### Can I use the same learning data across different AI assistants?
In future versions, yes. The adapter architecture is designed to share the same learning data across different assistants.

## Troubleshooting

### SessionStart hook doesn't run
Check `~/.claude/settings.json` — verify the hook command path exists and is correct. Restart Claude Code after changes.

### /boot shows missing directories
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
chmod 600 ~/.claude/memory/*.jsonl
```
