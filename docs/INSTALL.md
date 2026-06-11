# EvoKit Installation Guide

## Prerequisites

- **Supported AI coding assistant:** Claude Code (others coming in future versions)
- **OS:** Linux, macOS, or Windows (WSL/Git Bash)
- **Shell:** bash 4.0+

## Quick Install (Recommended)

```bash
# Clone the repository
git clone https://github.com/your-username/EvoKit.git
cd EvoKit

# Run the installer
bash bin/evokit-install.sh

# Or install directly from template
bash bin/evokit-install.sh --template template
```

## Manual Install

If you prefer to install manually:

```bash
# 1. Create .claude directory structure
mkdir -p ~/.claude/{rules,agents,commands,memory,hooks}

# 2. Copy template files
cp template/CLAUDE.md ~/
cp template/MEMORY.md ~/.claude/
cp template/settings.json ~/.claude/
cp template/hooks/* ~/.claude/hooks/
cp template/rules/* ~/.claude/rules/
cp template/agents/* ~/.claude/agents/
cp template/commands/* ~/.claude/commands/
cp template/memory/* ~/.claude/memory/

# 3. Replace path placeholders
sed -i 's|__HOME__|'"$HOME"'|g' ~/.claude/settings.json
sed -i 's|__HOME__|'"$HOME"'|g' ~/.claude/hooks/*.sh

# 4. Set permissions
chmod +x ~/.claude/hooks/*.sh
chmod 600 ~/.claude/memory/*.jsonl

# 5. Done! Start Claude Code and run /boot
```

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

## Platform-Specific Notes

### Linux
Everything works out of the box.

### macOS
Everything works out of the box.

### Windows (WSL)
1. Install WSL: `wsl --install` (Admin PowerShell)
2. Install Claude Code in WSL
3. Run installer inside WSL

### Windows (Git Bash)
1. Install Git Bash from https://git-scm.com
2. Open Git Bash
3. Run installer

## Troubleshooting

### "hooks must be an array of matchers"
**Problem:** Old format hooks in settings.json.
**Fix:** Use the template's settings.json or run the installer which handles format conversion.

### "Permission denied" on hooks
**Problem:** Hooks not executable.
**Fix:** `chmod +x ~/.claude/hooks/*.sh`

### /boot command not found
**Problem:** Commands not installed correctly.
**Fix:** Ensure `.claude/commands/boot.md` exists and restart Claude Code.

### SessionStart hook not running
**Problem:** Hook path incorrect.
**Fix:** Check `~/.claude/settings.json` — the hook command path must point to the actual file location.
