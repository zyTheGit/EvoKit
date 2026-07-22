# 模板红线（编辑 template/** 时强制）

`template/` 是安装到用户机器的产品本身。编辑其下任何文件时强制遵守（完整版见 `docs/zh/DEV_STANDARDS.md` §7）：

- **禁止个人路径** — 一律使用 `__HOME__` 占位符（含 `settings.json`），安装时由 `sed` 替换；禁止硬编码 `/home/...`（CI grep 校验）
- **行数限制** — `template/claude/CLAUDE.md` ≤ 150 行；`learned-rules.md` ≤ 50 行
- **append-only** — `corrections.jsonl` / `observations.jsonl` 条目永不删除
- **内嵌 Python** — 优先 `uv run --isolated python3`，不可用时回退 `python3`
