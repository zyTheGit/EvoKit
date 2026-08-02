#!/bin/bash
# Stop 钩子 — 检查 .pending/ 是否有待确认知识
# 会话结束时执行，非空时输出提示，空时静默跳过

EVOKIT_DIR="__HOME__/.evokit/knowledge"
PENDING_DIR="${EVOKIT_DIR}/.pending"

if [ -d "$PENDING_DIR" ]; then
  PENDING_COUNT=$(find "$PENDING_DIR" -maxdepth 1 -type f 2>/dev/null | wc -l)
  if [ "$PENDING_COUNT" -gt 0 ]; then
    echo "📋 有 ${PENDING_COUNT} 条待确认知识，下次运行 /evokit-learn 确认"
  fi
fi

exit 0
