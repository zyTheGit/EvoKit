# Migration Guide

EvoKit includes a built-in export/import system for migrating your learning data between machines.

## Export from Old Machine

```bash
# Run the export script
bash ~/.claude/hooks/export-system.sh

# This creates: ~/claude-evolution-YYYYMMDD_HHMMSS.tar.gz
```

The export package includes:
- ✅ All `.claude/` configuration (rules, agents, commands, hooks)
- ✅ All learning data (corrections, observations, learned rules, sessions)
- ✅ Your `CLAUDE.md`
- ✅ Settings with hooks configuration
- ✅ Cross-platform install script

## Import on New Machine

```bash
# 1. Transfer the package
scp claude-evolution-*.tar.gz new-machine:~/

# 2. Extract and install
cd ~/
tar xzf claude-evolution-*.tar.gz
bash install.sh
```

### Path Auto-Detection

The installer automatically detects the correct home path:

| Platform | Detection |
|----------|-----------|
| Linux | `$HOME` → `/home/username` |
| macOS | `$HOME` → `/Users/username` |
| WSL | `$USERPROFILE` + `wslpath -u` → `/c/Users/username` |

### Custom Path

```bash
# Specify target path explicitly
bash install.sh /home/myuser
bash install.sh /c/Users/MyUser
bash install.sh ~  # Same as auto-detect
```

## What Gets Migrated

| Component | Included | Notes |
|-----------|----------|-------|
| `settings.json` | ✅ | Hooks merged with existing |
| `settings.local.json` | ✅ | Permissions deduplicated |
| `CLAUDE.md` | ✅ (if not exists) | Existing kept if present |
| `rules/` | ✅ | All path-scoped rules |
| `agents/` | ✅ | All sub-agent definitions |
| `commands/` | ✅ | All slash commands |
| `hooks/` | ✅ | Session lifecycle scripts |
| `memory/` - data | ✅ | corrections, observations, sessions |
| `memory/` - rules | ✅ | learned-rules, evolution-log |
| Plugin configs | ❌ | Must be reinstalled |

## Backup

The installer automatically creates a backup before making changes:

```bash
~/.claude/backups/migration-import-YYYYMMDD-HHMMSS/
```

To restore from backup:

```bash
cp -r ~/.claude/backups/migration-import-*/* ~/.claude/
```

## Post-Migration

After importing on the new machine:

1. **Start Claude Code** — SessionStart hook runs `/boot` automatically
2. **Run `/boot` manually** — Verify everything is intact
3. **Check paths** — Ensure no old paths remain:
   ```bash
   grep -r "old-path" ~/.claude/settings.json ~/.claude/hooks/
   ```

## Sync Across Machines

EvoKit does not provide cloud sync (privacy first). To use across multiple machines:

1. **Option A:** Export from machine A, import on machine B before each session
2. **Option B:** Keep the `.claude/` directory in a private git repo (exclude `memory/*.jsonl`)
3. **Option C:** Use a sync tool (rsync, Syncthing) — be careful not to overwrite newer data
