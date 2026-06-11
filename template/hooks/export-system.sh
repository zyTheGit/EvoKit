#!/bin/bash
# ════════════════════════════════════════════
# EvoKit — One-click migration export script
# Usage: bash ~/.claude/hooks/export-system.sh
# ════════════════════════════════════════════

set -e
DATE=$(date +%Y%m%d_%H%M%S)
OUTPUT_DIR="/tmp/claude-evolution-migration"
OUTPUT_TGZ="$HOME/claude-evolution-${DATE}.tar.gz"
CLAUDE_DIR="$HOME/.claude"

# Python runner — prefer uv
PY_RUN="python3"
if command -v uv &>/dev/null; then
  PY_RUN="uv run --isolated python3"
fi

echo "╔═══════════════════════════════════════════╗"
echo "║   EvoKit — One-click Migration Export     ║"
echo "╚═══════════════════════════════════════════╝"

# ──────────────────────────────────────────
# Step 1: Extract old path from settings.json
# ──────────────────────────────────────────
# Supports /home/xxx, /c/Users/xxx, /Users/xxx etc.
OLD_PATH=$(grep -oP 'bash\s+\K/.+?/\.claude/hooks/' "$CLAUDE_DIR/settings.json" 2>/dev/null | head -1 || echo "")
OLD_PATH="${OLD_PATH%/.claude/hooks/}"
echo ""
echo "🔍 Detected path: ${OLD_PATH:-no hardcoded path}"
echo "   Current user: $(whoami)"
echo "  \$HOME: $HOME"

# ──────────────────────────────────────────
# Step 2: Create staging area
# ──────────────────────────────────────────
echo ""
echo "📦 Creating migration package..."
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/system"
mkdir -p "$OUTPUT_DIR/system/hooks"

# ──────────────────────────────────────────
# Step 3: Copy system files
# ──────────────────────────────────────────
echo "   Copying system files..."
cp "$CLAUDE_DIR/settings.json" "$OUTPUT_DIR/system/" 2>/dev/null || true
cp "$CLAUDE_DIR/settings.local.json" "$OUTPUT_DIR/system/" 2>/dev/null || true
cp "$CLAUDE_DIR/MEMORY.md" "$OUTPUT_DIR/system/" 2>/dev/null || true

for dir in rules agents commands memory hooks; do
  [ -d "$CLAUDE_DIR/$dir" ] && cp -r "$CLAUDE_DIR/$dir" "$OUTPUT_DIR/system/"
done

[ -f "$HOME/CLAUDE.md" ] && cp "$HOME/CLAUDE.md" "$OUTPUT_DIR/"

# ──────────────────────────────────────────
# Step 4: Data summary
# ──────────────────────────────────────────
echo ""
echo "📊 Migration data overview:"
for f in corrections observations violations sessions; do
  C=$(wc -l < "$CLAUDE_DIR/memory/${f}.jsonl" 2>/dev/null || echo 0)
  printf "  %-14s %s entries\n" "${f}:" "$C"
done
RL=$(wc -l < "$CLAUDE_DIR/memory/learned-rules.md" 2>/dev/null || echo 0)
echo "  learned-rules: ${RL} lines"

# ──────────────────────────────────────────
# Step 4.5: Rotation — archive large learning files
# ──────────────────────────────────────────
# Operates on the staging copy, originals are untouched
echo ""
echo "🗜️  Rotating learning data (operating on staging copy only)..."

export OUTPUT_DIR
$PY_RUN << 'PYEOF'
import json, os, time, gzip

memory_dir = os.path.join(os.environ.get('OUTPUT_DIR', ''), 'system', 'memory')
archive_dir = os.path.join(memory_dir, 'archive')
if not os.path.isdir(memory_dir):
    exit(0)
os.makedirs(archive_dir, exist_ok=True)
NOW = time.time()
DAY = 86400

def parse_ts(entry):
    try:
        ts = entry.get("timestamp", "")
        return time.mktime(time.strptime(ts[:10], "%Y-%m-%d")) if ts else 0
    except:
        return 0

def rotate(fname, max_lines=500, max_days=30):
    path = os.path.join(memory_dir, fname)
    if not os.path.isfile(path):
        return
    with open(path, 'r') as f:
        lines = f.readlines()
    total = len(lines)
    if total <= max_lines:
        print(f"  ✓ {fname}: {total} lines, no rotation needed")
        return
    recent, old = [], []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
            ts = parse_ts(entry)
            age = (NOW - ts) / DAY if ts else 999
            (old if age > max_days else recent).append(line)
        except:
            recent.append(line)
    with open(path, 'w') as f:
        for l in recent:
            f.write(l + '\n')
    if old:
        aname = fname.replace('.jsonl', f'-{time.strftime("%Y-%m")}.jsonl')
        apath = os.path.join(archive_dir, aname)
        with open(apath, 'a') as f:
            for l in old:
                f.write(l + '\n')
        if len(old) > 1000:
            gz_path = apath + '.gz'
            with open(apath, 'rb') as fin:
                with gzip.open(gz_path, 'wb') as fout:
                    fout.write(fin.read())
            os.remove(apath)
            print(f"  ✓ {fname}: {len(recent)} kept, {len(old)} archived -> archive/{aname}.gz")
        else:
            print(f"  ✓ {fname}: {len(recent)} kept, {len(old)} archived -> archive/{aname}")

def confidence_decay(fname, max_days=60, threshold=0.3):
    path = os.path.join(memory_dir, fname)
    if not os.path.isfile(path):
        return
    with open(path, 'r') as f:
        lines = f.readlines()
    if not lines:
        return
    keep, archived = [], []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
            ts = parse_ts(entry)
            age = (NOW - ts) / DAY if ts else 0
            if age > max_days:
                conf = entry.get("confidence", 0.5)
                conf /= 2
                entry["confidence"] = round(conf, 2)
                if conf < threshold:
                    archived.append(json.dumps(entry, ensure_ascii=False))
                    continue
            keep.append(json.dumps(entry, ensure_ascii=False))
        except:
            keep.append(line)
    with open(path, 'w') as f:
        for l in keep:
            f.write(l + '\n')
    if archived:
        aname = fname.replace('.jsonl', f'-decayed-{time.strftime("%Y-%m")}.jsonl')
        apath = os.path.join(archive_dir, aname)
        with open(apath, 'a') as f:
            for l in archived:
                f.write(l + '\n')
        print(f"  ✓ {fname}: {len(keep)} kept, {len(archived)} confidence-decayed")

rotate('corrections.jsonl')
rotate('observations.jsonl')
confidence_decay('observations.jsonl')
PYEOF


# ──────────────────────────────────────────
# Step 5: Generate install script
# ──────────────────────────────────────────
echo ""
echo "🔧 Generating install script..."

cat > "$OUTPUT_DIR/install.sh" << 'INSTALLMARKER'
#!/bin/bash
# ════════════════════════════════════════════
# EvoKit — One-click migration install script
# Usage:
#   bash install.sh                    # Auto-detect using $HOME
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="$HOME/.claude/backups/migration-import-$(date +%Y%m%d-%H%M%S)"

# TARGET_PATH: arg1 takes priority; "~" or empty = auto-detect
if [ -n "${1:-}" ] && [ "$1" != "~" ] && [ "$1" != "--home" ]; then
    TARGET_PATH="$1"
elif [ -n "$USERPROFILE" ] && command -v wslpath &>/dev/null 2>&1; then
    # WSL: convert C:\Users\xxx to /c/Users/xxx
    TARGET_PATH="$(wslpath -u "$USERPROFILE")"
else
    TARGET_PATH="$HOME"
fi
OLD_PATH="__OLD_PATH__"    # Replaced at export time

echo "╔═══════════════════════════════════════════╗"
echo "║   EvoKit — One-click Migration Install    ║"
echo "╚═══════════════════════════════════════════╝"
echo "  Old path: ${OLD_PATH:-none}"
echo "  Target path: $TARGET_PATH"
echo ""
echo "  Usage: bash install.sh [target-path/--home]"
echo "  Examples:"
echo "    bash install.sh               # Auto-detect (recommended)"
echo "    bash install.sh ~             # User home directory"
echo "    bash install.sh /c/Users/xxx  # Windows path"
echo "    bash install.sh /home/xxx     # Linux path"
echo "    bash install.sh --home        # Same as no argument"
echo ""

# Python runner — prefer uv
PY_RUN="python3"
if command -v uv &>/dev/null; then
  PY_RUN="uv run --isolated python3"
fi

# ──────────────────────────────────────────
# 1. Backup current configuration
# ──────────────────────────────────────────
if [ -d "$HOME/.claude" ]; then
  echo "📂 Backing up existing configuration..."
  mkdir -p "$BACKUP_DIR"
  for item in settings.json settings.local.json hooks rules agents commands memory MEMORY.md; do
    [ -e "$HOME/.claude/$item" ] && cp -r "$HOME/.claude/$item" "$BACKUP_DIR/"
  done
  [ -f "$HOME/CLAUDE.md" ] && cp "$HOME/CLAUDE.md" "$BACKUP_DIR/"
  echo "  ✓ Backup saved to: $BACKUP_DIR"
fi

# ──────────────────────────────────────────
# 2. Install system directories
# ──────────────────────────────────────────
echo ""
echo "📁 Installing system directories..."
mkdir -p "$HOME/.claude"

for dir in rules agents commands memory hooks; do
  src="$SCRIPT_DIR/system/$dir"
  if [ -d "$src" ] && [ "$(ls -A "$src" 2>/dev/null)" ]; then
    mkdir -p "$HOME/.claude/$dir"
    cp -r "$src/"* "$HOME/.claude/$dir/"
    echo "  ✓ .claude/$dir/"
  fi
done

[ -f "$SCRIPT_DIR/system/MEMORY.md" ] && cp "$SCRIPT_DIR/system/MEMORY.md" "$HOME/.claude/" && echo "  ✓ MEMORY.md"

if [ ! -f "$HOME/CLAUDE.md" ] && [ -f "$SCRIPT_DIR/CLAUDE.md" ]; then
  cp "$SCRIPT_DIR/CLAUDE.md" "$HOME/" && echo "  ✓ CLAUDE.md"
elif [ -f "$HOME/CLAUDE.md" ]; then
  echo "  - CLAUDE.md already exists, keeping existing"
fi

# ──────────────────────────────────────────
# 3. Fix paths (Python, no sed)
# ──────────────────────────────────────────
export OLD_PATH
export TARGET_PATH

if [ -n "$OLD_PATH" ] && [ "$OLD_PATH" != "$TARGET_PATH" ]; then
  echo ""
  echo "🔧 Fixing paths: $OLD_PATH → $TARGET_PATH"

  $PY_RUN << 'PYEOF'
import os, glob

old = os.environ.get('OLD_PATH', '')
new = os.environ.get('TARGET_PATH', '')

if not old or not new or old == new:
    exit(0)

home = os.environ.get('HOME', '')
files = []

sf = os.path.join(home, '.claude', 'settings.json')
if os.path.isfile(sf):
    files.append(sf)

for subdir, ext in [('hooks', '.sh'), ('commands', '.md'), ('rules', '.md'), ('agents', '.md')]:
    pattern = os.path.join(home, '.claude', subdir, f'*{ext}')
    files.extend(glob.glob(pattern))

count = 0
for fp in files:
    try:
        with open(fp, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
        if old in content:
            content = content.replace(old, new)
            with open(fp, 'w', encoding='utf-8') as f:
                f.write(content)
            count += 1
    except Exception:
        pass

print(f"  ✓ Fixed paths in {count} files")
PYEOF
fi

# ──────────────────────────────────────────
# 4. Merge settings.json
# ──────────────────────────────────────────
echo ""
echo "⚙️  Merging settings.json..."
export SCRIPT_DIR

$PY_RUN << 'PYEOF'
import json, os

home = os.environ.get('HOME', '')
script_dir = os.environ.get('SCRIPT_DIR', '')

settings_path = os.path.join(home, '.claude', 'settings.json')
sys_settings = os.path.join(script_dir, 'system', 'settings.json')

# Read existing config
existing = {}
if os.path.isfile(settings_path):
    try:
        with open(settings_path, 'r') as f:
            existing = json.load(f)
    except Exception:
        existing = {}

# Read imported config
imported = {}
if os.path.isfile(sys_settings):
    with open(sys_settings, 'r') as f:
        imported = json.load(f)

if not imported:
    print("  - No settings.json in package, skipping")
else:
    changed = False
    old_path = os.environ.get('OLD_PATH', '')
    target_path = os.environ.get('TARGET_PATH', '')

    # hooks - normalize both old (string) and new (array) formats, then merge
    if "hooks" in imported:
        existing.setdefault("hooks", {})
        def _normalize_hooks(hooks):
            """Convert old format (string) to new format (array), keep array as-is."""
            result = {}
            for ev, val in hooks.items():
                if isinstance(val, str):
                    result[ev] = [{
                        "matcher": "*",
                        "hooks": [{"type": "command", "command": val}]
                    }]
                elif isinstance(val, list):
                    result[ev] = val
                else:
                    result[ev] = [{"matcher": "*", "hooks": [{"type": "command", "command": str(val)}]}]
            return result
        def _fix_hook_paths(hooks):
            """Replace old_path with target_path in all hook commands."""
            if not old_path or not target_path:
                return
            for matchers in hooks.values():
                for m in matchers:
                    for h in m.get("hooks", []):
                        if h.get("type") == "command" and old_path in h["command"]:
                            h["command"] = h["command"].replace(old_path, target_path)
        # Normalize both sides to new format
        existing_hooks = _normalize_hooks(existing["hooks"])
        imported_hooks = _normalize_hooks(imported["hooks"])
        # Fix paths
        _fix_hook_paths(existing_hooks)
        _fix_hook_paths(imported_hooks)
        # Merge: add missing events, update changed commands
        for ev, matchers in imported_hooks.items():
            if ev not in existing_hooks:
                existing_hooks[ev] = matchers
                print(f"  ✓ hooks.{ev} added")
                changed = True
            else:
                def _get_cmds(hooks_dict):
                    cmds = set()
                    for matchers in hooks_dict.values():
                        for m in matchers:
                            for h in m.get("hooks", []):
                                if h.get("type") == "command":
                                    cmds.add(h["command"])
                    return cmds
                ex_cmds = _get_cmds({ev: existing_hooks[ev]})
                im_cmds = _get_cmds({ev: matchers})
                if ex_cmds != im_cmds:
                    existing_hooks[ev] = matchers
                    print(f"  ✓ hooks.{ev} updated")
                    changed = True
        existing["hooks"] = existing_hooks

    # env — add missing variables
    if "env" in imported:
        existing.setdefault("env", {})
        for k, v in imported["env"].items():
            if k not in existing["env"]:
                existing["env"][k] = v
                changed = True

    # model — import only if user hasn't set one
    if "model" in imported and "model" not in existing:
        existing["model"] = imported["model"]
        changed = True

    if changed:
        with open(settings_path, 'w') as f:
            json.dump(existing, f, indent=2, ensure_ascii=False)
        print("  ✓ settings.json merged successfully")
    else:
        print("  - settings.json unchanged")
PYEOF

# ──────────────────────────────────────────
# 5. Merge settings.local.json
# ──────────────────────────────────────────
echo ""
echo "⚙️  Merging settings.local.json..."

$PY_RUN << 'PYEOF'
import json, os

home = os.environ.get('HOME', '')
script_dir = os.environ.get('SCRIPT_DIR', '')

local_path = os.path.join(home, '.claude', 'settings.local.json')
sys_local = os.path.join(script_dir, 'system', 'settings.local.json')

existing = {}
if os.path.isfile(local_path):
    try:
        with open(local_path, 'r') as f:
            existing = json.load(f)
    except Exception:
        existing = {}

imported = {}
if os.path.isfile(sys_local):
    with open(sys_local, 'r') as f:
        imported = json.load(f)

if not imported:
    print("  - No settings.local.json in package, skipping")
else:
    changed = False

    # Merge permissions.allow (deduplicate)
    if "permissions" in imported and "allow" in imported["permissions"]:
        existing.setdefault("permissions", {})
        existing["permissions"].setdefault("allow", [])
        seen = set(existing["permissions"]["allow"])
        added = 0
        for item in imported["permissions"]["allow"]:
            if item not in seen:
                existing["permissions"]["allow"].append(item)
                seen.add(item)
                added += 1
                changed = True
        if added:
            print(f"  ✓ Added {added} permission rules")

    if changed:
        with open(local_path, 'w') as f:
            json.dump(existing, f, indent=2, ensure_ascii=False)
        print("  ✓ settings.local.json merged")
    else:
        print("  - settings.local.json unchanged")
PYEOF

# ──────────────────────────────────────────
# 6. Set permissions
# ──────────────────────────────────────────
echo ""
echo "🔒 Setting permissions..."
chmod 600 "$HOME/.claude/memory/"*.jsonl 2>/dev/null && echo "  ✓ memory/*.jsonl → 600"
chmod +x "$HOME/.claude/hooks/"*.sh 2>/dev/null && echo "  ✓ hooks/*.sh → executable"

# ──────────────────────────────────────────
# Done
# ──────────────────────────────────────────
echo ""
echo "✅ Migration install complete!"
echo ""
echo "═══════════════════════════════════════════"
echo "  Next steps:"
echo "  1. Start Claude Code"
echo "  2. Run /boot to verify system health"
echo ""
echo "  Backup location:"
echo "  $BACKUP_DIR"
echo "═══════════════════════════════════════════"
INSTALLMARKER

# Replace path placeholder (using environment variable to avoid quoting issues)
export OLD_PATH_PLACEHOLDER="$OLD_PATH"
export OUTPUT_DIR
$PY_RUN << 'PYEOF'
import os
fp = os.path.join(os.environ['OUTPUT_DIR'], 'install.sh')
old_val = os.environ.get('OLD_PATH_PLACEHOLDER', '')
with open(fp, 'r') as f:
    c = f.read()
c = c.replace('__OLD_PATH__', old_val)
with open(fp, 'w') as f:
    f.write(c)
PYEOF

chmod +x "$OUTPUT_DIR/install.sh"

# Generate Windows batch wrapper
cat > "$OUTPUT_DIR/install.bat" << BATMARKER
@echo off
chcp 65001 >nul
echo ═══════════════════════════════════════════
echo   EvoKit — Windows Installation
echo ═══════════════════════════════════════════
echo.
echo   Usage:
echo    install.bat                 Default path
echo    install.bat /c/Users/xxx   Custom path
echo.
echo   Running install.sh ...
echo.

:: Try WSL → Git Bash → Error
where wsl >nul 2>nul
if %errorlevel% equ 0 (
    wsl bash install.sh %*
    goto :end
)

where bash >nul 2>nul
if %errorlevel% equ 0 (
    bash install.sh %*
    goto :end
)

echo ERROR: bash not found. Please install WSL or Git Bash.
echo    WSL:  wsl --install
echo    Git:  https://git-scm.com
pause
:end
pause
BATMARKER

# ──────────────────────────────────────────
# Step 6: Package
# ──────────────────────────────────────────
echo ""
echo "🗜️  Packaging migration files..."
cd "$OUTPUT_DIR"
tar czf "$OUTPUT_TGZ" CLAUDE.md system/ install.sh install.bat
cd "$HOME"
rm -rf "$OUTPUT_DIR"

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║  🎉 Migration package ready!              ║"
echo "╚═══════════════════════════════════════════╝"
echo "  File: $OUTPUT_TGZ"
echo "  Size: $(du -h "$OUTPUT_TGZ" | cut -f1)"
echo ""
echo "═══════════════════════════════════════════"
echo "  Quick migration:"
echo ""
echo "  ① Old machine: bash ~/.claude/hooks/export-system.sh"
echo "  ② Transfer:    scp $(basename "$OUTPUT_TGZ") new-machine:"
echo "  ③ New machine: cd ~ && tar xzf $(basename "$OUTPUT_TGZ") && bash install.sh"
echo "  (Custom path: bash install.sh /c/Users/your-username)"
echo "═══════════════════════════════════════════"
