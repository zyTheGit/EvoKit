#!/bin/bash
# SessionStart 钩子 — 快速检查知识库完整性
# 每次会话启动时执行，静默通过，有问题时输出警告
# 详细检查留给 /evokit-boot

EVOKIT_DIR="__HOME__/.claude/memory/evokit"
INDEX_FILE="${EVOKIT_DIR}/knowledge-index.md"
KNOWLEDGE_DIR="${EVOKIT_DIR}/knowledge"
PENDING_DIR="${EVOKIT_DIR}/.pending"

WARN=0

# ── 1. knowledge-index.md 是否存在 ──
if [ ! -f "$INDEX_FILE" ]; then
  echo "⚠ knowledge-index.md 不存在，知识库尚未初始化"
  WARN=$((WARN + 1))
fi

# ── 2. 索引引用的条目文件是否存在 ──
if [ -f "$INDEX_FILE" ] && [ -d "$KNOWLEDGE_DIR" ]; then
  # 提取索引中引用的条目文件名（匹配 [标题](knowledge/xxx.md) 格式）
  MISSING=0
  while IFS= read -r entry; do
    if [ -n "$entry" ] && [ ! -f "${KNOWLEDGE_DIR}/${entry}" ]; then
      echo "⚠ 知识条目缺失: knowledge/${entry}"
      MISSING=$((MISSING + 1))
    fi
  done < <(grep -oP '\(knowledge/\K[^)]+' "$INDEX_FILE" 2>/dev/null || true)
  if [ "$MISSING" -gt 0 ]; then
    WARN=$((WARN + 1))
  fi
fi

# ── 3. 条目文件 YAML frontmatter 可解析（检查 --- 分隔符）──
if [ -d "$KNOWLEDGE_DIR" ]; then
  BAD_FRONTMATTER=0
  for entry_file in "${KNOWLEDGE_DIR}"/*.md; do
    [ -f "$entry_file" ] || continue
    BASENAME=$(basename "$entry_file")
    # 检查文件以 --- 开头，且在后续行中找到第二个 ---
    if ! head -1 "$entry_file" | grep -q '^---'; then
      echo "⚠ ${BASENAME}: YAML frontmatter 缺少起始 ---"
      BAD_FRONTMATTER=$((BAD_FRONTMATTER + 1))
    else
      # 检查第二个 --- 是否存在（至少在第 2 行到第 20 行之间）
      if ! sed -n '2,20p' "$entry_file" | grep -q '^---'; then
        echo "⚠ ${BASENAME}: YAML frontmatter 缺少结束 ---"
        BAD_FRONTMATTER=$((BAD_FRONTMATTER + 1))
      fi
    fi
  done
  if [ "$BAD_FRONTMATTER" -gt 0 ]; then
    WARN=$((WARN + 1))
  fi
fi

# ── 4. .pending/ 是否有待确认知识 ──
if [ -d "$PENDING_DIR" ]; then
  PENDING_COUNT=$(find "$PENDING_DIR" -maxdepth 1 -type f 2>/dev/null | wc -l)
  if [ "$PENDING_COUNT" -gt 0 ]; then
    echo "⚠ 有 ${PENDING_COUNT} 条待确认知识，运行 /evokit-learn 确认"
    WARN=$((WARN + 1))
  fi
fi

# ── 汇总 ──
if [ "$WARN" -gt 0 ]; then
  echo "⚠ 知识库检查发现 ${WARN} 类问题，运行 /evokit-boot 获取详细诊断"
fi

exit 0
