# 迁移指南

EvoKit 包含内置的导出/导入系统，用于在不同机器之间迁移你的学习数据。

## 从旧机器导出

```bash
# 运行导出脚本
bash ~/.claude/hooks/export-system.sh

# 这将创建：~/claude-evolution-YYYYMMDD_HHMMSS.tar.gz
```

导出包包含以下内容：
- ✅ 所有 `.claude/` 配置（规则、代理、命令、钩子）
- ✅ 所有学习数据（纠正、观察、已学习规则、会话）
- ✅ 你的 `CLAUDE.md`
- ✅ 包含钩子配置的设置文件
- ✅ 跨平台安装脚本

## 导入到新机器

```bash
# 1. 传输包
scp claude-evolution-*.tar.gz new-machine:~/

# 2. 解压并安装
cd ~/
tar xzf claude-evolution-*.tar.gz
bash install.sh
```

### 路径自动检测

安装程序会自动检测正确的主目录路径：

| 平台 | 检测方式 |
|----------|-----------|
| Linux | `$HOME` → `/home/username` |
| macOS | `$HOME` → `/Users/username` |
| WSL | `$USERPROFILE` + `wslpath -u` → `/c/Users/username` |

### 自定义路径

```bash
# 显式指定目标路径
bash install.sh /home/myuser
bash install.sh /c/Users/MyUser
bash install.sh ~  # 与自动检测相同
```

## 迁移内容

| 组件 | 包含 | 说明 |
|-----------|----------|-------|
| `settings.json` | ✅ | 钩子与现有配置合并 |
| `settings.local.json` | ✅ | 权限去重 |
| `CLAUDE.md` | ✅（不存在时） | 如果已存在则保留现有 |
| `rules/` | ✅ | 所有路径作用域规则 |
| `agents/` | ✅ | 所有子代理定义 |
| `commands/` | ✅ | 所有斜杠命令 |
| `hooks/` | ✅ | 会话生命周期脚本 |
| `memory/` - 数据 | ✅ | corrections、observations、sessions |
| `memory/` - 规则 | ✅ | learned-rules、evolution-log |
| 插件配置 | ❌ | 必须重新安装 |

## 备份

安装程序在修改前会自动创建备份：

```bash
~/.claude/backups/migration-import-YYYYMMDD-HHMMSS/
```

从备份恢复：

```bash
cp -r ~/.claude/backups/migration-import-*/* ~/.claude/
```

## 迁移后操作

在新机器上导入后：

1. **启动 Claude Code** — SessionStart 钩子会自动运行 `/boot`
2. **手动运行 `/boot`** — 验证一切完好
3. **检查路径** — 确保没有残留的旧路径：
   ```bash
   grep -r "old-path" ~/.claude/settings.json ~/.claude/hooks/
   ```

## 多机同步

EvoKit 不提供云同步功能（隐私优先）。要在多台机器间使用：

1. **选项 A：** 每次会话前从机器 A 导出，在机器 B 上导入
2. **选项 B：** 将 `.claude/` 目录保存在私有 git 仓库中（排除 `memory/*.jsonl`）
3. **选项 C：** 使用同步工具（rsync、Syncthing）— 注意不要覆盖较新的数据
