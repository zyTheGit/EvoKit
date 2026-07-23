# EvoKit Installation Guide

## Prerequisites

- **Supported AI coding assistants:**
  - **Claude Code** (via `~/.claude/`) — ✅ v0.4+
  - **Codex CLI** (via `~/.codex/`) — ✅ v0.3.0+
  - **OpenCode** (via `~/.config/opencode/` + `.opencode/`) — ✅ v0.5.0+
  - **Pi CLI** (via `~/.pi/agent/` + `.pi/`) — ✅ v0.6.0+
- **OS:** Linux, macOS, or Windows (WSL/Git Bash)
- **Shell:** bash 4.0+
- **Tools:** `curl` or `wget` (for remote install)

## Quick Install (Recommended)

### npm (Node.js 20.12+)

```bash
# Install globally via npm
npm install -g @zythegit/evokit

# Interactive selection — choose which assistants to configure
evokit install

# Or specify assistants directly
evokit install --adapter claude
evokit install --adapter claude,codex
evokit install --adapter claude,opencode
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

> **Note:** When installing via pipe (`curl | bash`), stdin is not a terminal so the
> interactive adapter menu cannot be shown. Use `--adapter` to specify assistants:

```bash
# Install for Claude Code only (pipe-safe)
curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash -s -- --adapter claude

# Install for multiple assistants
curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash -s -- --adapter claude,codex,opencode
```

Install a specific version:

```bash
curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash -s -- --branch v0.1.0 --adapter claude
```

### From a local clone

```bash
git clone https://github.com/zyTheGit/EvoKit.git
cd EvoKit

# Interactive selection (terminal required)
bash bin/install.sh

# Or specify assistants directly
bash bin/install.sh --adapter claude,codex,opencode
```

## Adapter-Specific Installation

### Claude Code

Installs to `~/.claude/` with settings.json hooks, markdown rules, and slash commands:

```bash
evokit install --adapter claude
```

After installation, start Claude Code and run `/boot`.

**Files installed:**

```
~/.claude/
├── MEMORY.md              # Memory index
├── settings.json          # Hook configuration
├── rules/                 # Path-scoped rules (coding, security, invariants)
├── agents/                # Sub-agent definitions (architect, reviewer)
├── commands/              # Slash commands (/boot, /evolve, /review)
├── hooks/                 # Lifecycle hooks (session-start, stop, export-system)
├── skills/                # Reusable skills
└── memory/                # Learning data (corrections, observations, rules)
~/CLAUDE.md                # L1 cognitive core
```

### Codex CLI

Installs to `~/.codex/` with hooks.json lifecycle hooks, Starlark rules, and AGENTS.md:

```bash
evokit install --adapter codex
```

After installation, start Codex CLI — the boot verification runs automatically on every session start via the PreToolUse hook. Run `evokit doctor` to verify health.

**Files installed:**

```
~/.codex/
├── AGENTS.md              # L1 cognitive core
├── hooks.json             # Hook configuration
├── rules/                 # Starlark rules
├── hooks-scripts/         # Lifecycle shell hooks
└── memory/                # Learning data
```

Codex CLI specific options:

```bash
# With verification
evokit install --adapter codex --verify

# Dry run to preview
evokit install --adapter codex --dry-run
```

**Note:** Codex CLI support requires Codex v0.1+ with hooks feature enabled (default).

### OpenCode CLI

Installs global config to `~/.config/opencode/` and project-level tools to `.opencode/`:

```bash
evokit install --adapter opencode

# Specify a project directory (defaults to cwd)
evokit install --adapter opencode --project-dir /path/to/project
```

**Global config (`~/.config/opencode/`):**

```
~/.config/opencode/
├── AGENTS.md              # L1 cognitive core (combined with project-level)
├── opencode.json          # Global configuration
├── agent/                 # Sub-agent definitions (architect, reviewer)
├── memory/                # Learning data (corrections, observations, rules)
└── skills/                # Reusable skills
```

**Project-level (`.opencode/`):**

```
.opencode/
├── tools/                 # Custom EvoKit tools (evokit-boot, evokit-evolve, etc.)
├── agent/                 # Project-level agent overrides
└── memory/                # Project-level memory overrides
```

After installation, start OpenCode and call the `evokit-boot` tool to verify.

## Installer Options

| Flag                   | Description                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `--adapter <names>`    | Comma-separated adapter names: `claude`, `codex`, `opencode`. Omit for interactive selection. |
| `--dry-run`            | Preview what would be installed without modifying any files                                   |
| `--template <path>`    | Install from a local template directory instead of GitHub                                     |
| `--branch <name>`      | Download from a specific branch or tag (e.g. `main`, `v0.1.0`)                                |
| `--verify`             | Run boot verification after installation                                                      |
| `--project-dir <path>` | Project directory (used by OpenCode for `.opencode/`)                                         |

### Interactive vs Non-Interactive

- **Terminal (interactive):** Run `evokit install` or `bash bin/install.sh` directly.
  You'll see a multi-select menu to choose which AI assistants to configure.
- **Pipe / CI (non-interactive):** Use `--adapter` flag to specify assistants.
  The installer will configure them without prompting.

```bash
# Interactive (requires terminal)
bash bin/install.sh

# Non-interactive (pipe-safe, CI-safe)
curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash -s -- --adapter claude
```

### Dry-run mode

Preview the installation before committing:

```bash
bash bin/install.sh --dry-run --adapter claude
```

Useful for CI validation or to inspect what a new version would change.

## Manual Install

If you prefer to install manually or want to understand what the installer does:

### Claude Code

```bash
# 1. Create .claude directory structure
mkdir -p ~/.claude/{rules,agents,commands,memory,hooks,skills}

# 2. Copy template files
cp template/CLAUDE.md ~/
cp template/MEMORY.md ~/.claude/
cp template/settings.json ~/.claude/
cp template/hooks/*.sh ~/.claude/hooks/
cp template/rules/*.md ~/.claude/rules/
cp template/agents/*.md ~/.claude/agents/
cp template/commands/*.md ~/.claude/commands/
cp -r template/skills/* ~/.claude/skills/
cp template/memory/* ~/.claude/memory/

# 3. Replace path placeholders in settings.json
sed -i 's|__HOME__|'"$HOME"'|g' ~/.claude/settings.json

# 4. Set permissions
chmod +x ~/.claude/hooks/*.sh
chmod 600 ~/.claude/memory/*.jsonl

# 5. Done! Start Claude Code and run /boot
```

> **Note:** The `__HOME__` placeholder is only used in `settings.json` (for hook command paths). The hook scripts themselves use `$HOME` natively and don't need substitution.

### OpenCode

```bash
# 1. Create global config directory
mkdir -p ~/.config/opencode/{agent,memory,skills}

# 2. Copy global config files
cp template/opencode/AGENTS.md ~/.config/opencode/
cp template/opencode/opencode.json ~/.config/opencode/
cp template/opencode/agent/*.md ~/.config/opencode/agent/
cp template/opencode/memory/* ~/.config/opencode/memory/

# 3. Replace path placeholders
sed -i 's|__HOME__|'"$HOME"'|g' ~/.config/opencode/opencode.json

# 4. Create project-level directories
mkdir -p .opencode/{tools,agent,memory}

# 5. Copy project-level tools
cp template/opencode/tools/*.ts .opencode/tools/

# 6. Copy project root files
cp template/opencode/AGENTS.md ./
cp template/opencode/opencode.json ./
sed -i 's|__HOME__|'"$HOME"'|g' opencode.json
```

## Verify Installation

### Claude Code

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

### OpenCode

Start OpenCode and call the `evokit-boot` tool. Expected output shows
the status of global config, project files, and memory data.

## Platform-Specific Notes

### Linux

Everything works out of the box.

### macOS

Everything works out of the box.

### Windows (WSL)

1. Install WSL: `wsl --install` (Admin PowerShell)
2. Install Node.js and the AI coding assistant inside WSL
3. Run the installer inside WSL

**Pipe install note:** The one-liner `curl ... | bash` works on WSL but
cannot show interactive menus because stdin is piped. Use `--adapter`:

```bash
curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash -s -- --adapter claude
```

For interactive selection, download the script first:

```bash
wget -qO- https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh > /tmp/evokit.sh
bash /tmp/evokit.sh
```

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
bash bin/install.sh --template template --adapter claude
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

### `evokit: command not found` after npm install

**Problem:** The `evokit` binary is installed but not on your system PATH.

**Fix:** Check your install type:

```bash
# Scenario 1: Local install (without -g) — use npx
npx evokit install

# Scenario 2: Global install but PATH missing
# Find your npm global bin directory and add it to PATH
npm root -g
# Then add to ~/.bashrc or ~/.zshrc:
export PATH="$(npm root -g)/../bin:$PATH"
```

## Upgrading

To upgrade an existing installation, simply re-run the installer — it will:

- **Preserve** your existing config and memory data (they won't be overwritten)
- **Update** hooks, rules, agents, and commands to the latest versions
- **Create** any newly added files

```bash
# Upgrade from GitHub
curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash -s -- --adapter claude

# Upgrade from a local repository
cd EvoKit && git pull && bash bin/install.sh
```

After upgrading, run `/boot` (Claude Code) or `evokit-boot` (OpenCode) to verify.
