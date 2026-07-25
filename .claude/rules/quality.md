---
paths: "src/**,tests/**"
---

# 软件质量要求

## 可维护性

- 函数单一职责，长度不超过 50 行（复杂逻辑除外）
- 优先 early return，避免深层嵌套
- 魔法数字/字符串提取为命名常量
- 复杂逻辑添加注释说明意图

## 可读性

- 命名自解释：`userCount` > `x`，`isAuthenticated` > `flag`
- 类型明确：TypeScript 严格类型，避免 `any`
-`（warn 级，新代码避免）
- 代码结构清晰：相关代码就近放置，不跨文件跳跃

## 稳定性

- 错误显式处理，不吞异常（无空 catch）
- 边界条件必须处理：null/undefined/空数组/空字符串
- 异步操作必须处理失败路径
- 不依赖隐式类型转换（`===` 严格比较，`eqeqeq` 为 error 级）

## 自检清单

- ✅ 无 `console.log`/`debugger`/`print()` 残留
- ✅ 无 `TODO`/`FIXME`/`HACK` 残留
- ✅ 所有 catch 块有实际处理
- ✅ 使用 `===` 而非 `==`
