# EvoKit Installation Guide

## Prerequisites

- **Supported AI coding assistant:** Claude Code (others coming in future versions)
- **OS:** Linux, macOS, or Windows (WSL/Git Bash)
- **Shell:** bash 4.0+
- **Tools:** `curl` or `wget` (for remote install)

## Quick Install (Recommended)

### npm (Node.js 18+)

```bash
# Install globally via npm
npm install -g @zythegit/evokit

# Initialize EvoKit
evokit init
```

### Homebrew

```bash
# Add the tap and install
brew tap zyTheGit/homebrew-evokit
brew install evokit
```

### One-liner (curl | bash) — classic

```bash
curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash
```

Install a specific version:

```bash
curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash -s -- --branch v0.1.0
```

### From a local clone

```bash
git clone https://github.com/zyTheGit/EvoKit.git
cd EvoKit

# Run the installer (auto-detects the local template/)
bash bin/install.sh

# Or point to a specific template directory
bash bin/install.sh --template /path/to/template
```

## Installer Options

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview what would be installed without modifying any files |
| `--template <path>` | Install from a local template directory instead of GitHub |
| `--branch <name>` | Download from a specific branch or tag (e.g. `main`, `v0.1.0`, `develop`) |
| `--prefix <path>` | Install to a custom prefix instead of `~/.claude/` |

### Dry-run mode

Preview the installation before committing:

```bash
bash bin/install.sh --dry-run
```

Useful for CI validation or to inspect what a new version would change.

## Manual Install

If you prefer to install manually or want to understand what the installer does:

```bash
# 1. Create .claude directory structure
mkdir -p ~/.claude/{rules,agents,commands,memory,hooks}

# 2. Copy template files
cp template/CLAUDE.md ~/
cp template/MEMORY.md ~/.claude/
cp template/settings.json ~/.claude/
cp template/hooks/*.sh ~/.claude/hooks/
cp template/rules/*.md ~/.claude/rules/
cp template/agents/*.md ~/.claude/agents/
cp template/commands/*.md ~/.claude/commands/
cp template/memory/* ~/.claude/memory/

# 3. Replace path placeholders in settings.json
sed -i 's|__HOME__|'"$HOME"'|g' ~/.claude/settings.json

# 4. Set permissions
chmod +x ~/.claude/hooks/*.sh
chmod 600 ~/.claude/memory/*.jsonl

# 5. Done! Start Claude Code and run /boot
```

> **Note:** The `__HOME__` placeholder is only used in `settings.json` (for hook command paths). The hook scripts themselves use `$HOME` natively and don't need substitution.

## Verify Installation

Start Claude Code and run:

```
/boot
```

Expected output:
```
[EVOLUTION BOOT] ═══════════════════════
  ✓ .claude/rules/
  ✓ .claude/agents/
  ✓ .claude/commands/
  ✓ .claude/memory/
  ✓ .claude/hooks/
  ✓ CLAUDE.md: N lines (limit 150)
  ✓ learned-rules.md: N lines (limit 50)
═══════════════════════════════════════
```

## What Gets Installed

After installation, your `~/.claude/` will contain:

```
~/.claude/
├── MEMORY.md              # Memory index (read-only for Claude)
├── settings.json          # Hook configuration (with paths resolved)
├── rules/
│   ├── coding.md          # Coding standards
│   ├── core-invariants.md # Immutable system invariants
│   └── security.md        # Security rules
├── agents/
│   ├── architect.md       # Planning agent definition
│   └── reviewer.md        # Code review agent definition
├── commands/
│   ├── boot.md            # /boot — system integrity verification
│   ├── evolve.md          # /evolve — rule promotion audit
│   └── review.md          # /review — code review runner
├── hooks/
│   ├── session-start.sh   # Runs at session start (boot verification)
│   ├── stop.sh            # Runs at session end (metrics recording)
│   └── export-system.sh   # Exports system state for debugging
└── memory/
    ├── README.md          # Memory system documentation
    ├── learned-rules.md   # Promoted permanent rules (≤50 lines)
    ├── evolution-log.md   # /evolve audit trail
    ├── corrections.jsonl  # User corrections (append-only)
    ├── observations.jsonl # Auto-detected patterns (append-only)
    ├── violations.jsonl   # Rule violations from /boot
    └── sessions.jsonl     # Session metrics from Stop hook
```

And `~/CLAUDE.md` will contain the L1 cognitive core.

## Platform-Specific Notes

### Linux
Everything works out of the box.

### macOS
Everything works out of the box.

### Windows (WSL)
1. Install WSL: `wsl --install` (Admin PowerShell)
2. Install Claude Code inside WSL
3. Run the installer inside WSL
4. **Note:** The one-liner via `curl` works in WSL; avoid using the Windows host Claude Code with this installer

### Windows (Git Bash)
1. Install Git Bash from https://git-scm.com
2. Open Git Bash
3. Run the installer
4. **Note:** Ensure `bash` is available at `/bin/bash` (it is by default in Git Bash)

## Troubleshooting

### "hooks must be an array of matchers"
**Problem:** Old format hooks in `settings.json` (pre-v0.1.0 format).
**Fix:** Use the template's `settings.json` or re-run the installer:

```bash
bash bin/install.sh --template template
```

### "Permission denied" on hooks
**Problem:** Hook scripts not executable.
**Fix:**

```bash
chmod +x ~/.claude/hooks/*.sh
```

### /boot command not found
**Problem:** Commands not installed correctly.
**Fix:** Verify the command file exists, then restart Claude Code:

```bash
ls -la ~/.claude/commands/boot.md   # should exist
```

### SessionStart hook not running
**Problem:** Hook path in `settings.json` doesn't match the actual file location.
**Fix:** Check that `~/.claude/settings.json` has the correct `__HOME__` resolved to your actual home directory:

```bash
grep hooks ~/.claude/settings.json
```

The command path should look like `/home/user/.claude/hooks/session-start.sh`, not `__HOME__/.claude/hooks/...`.

### Hooks use `uv` but it's not installed
**Problem:** The `stop.sh` hook tries `uv run --isolated python3` first for JSON processing, falling back to `python3`.
**Fix:** Either install `uv` (recommended) or ensure `python3` is available:

```bash
# Install uv (recommended)
curl -LsSf https://astral.sh/uv/install.sh | sh
```

## Upgrading

To upgrade an existing installation, simply re-run the installer — it will:

- **Preserve** your existing `CLAUDE.md`, `settings.json`, and memory data (they won't be overwritten)
- **Update** hooks, rules, agents, and commands to the latest versions
- **Create** any newly added files

```bash
# Upgrade from GitHub
curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash

# Upgrade from a local repository
cd EvoKit && git pull && bash bin/install.sh
```

After upgrading, run `/boot` to verify everything is healthy.
