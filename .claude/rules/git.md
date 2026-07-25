---
paths: "*"
---

# Git 协作规范

## 提交原则

- Commit message 使用中文，遵循 conventional commits：
  - `feat: 新增卸载命令`
  - `fix: 修复路径替换遗漏`
  - `refactor: 提取共享编排逻辑`
  - `docs: 更新架构文档`
  - `chore: 发布 v0.6.6`
- 每次提交只做一件事，不混合不相关变更
- 提交前运行 lint + test

## 分支管理

- 独立功能新建分支开发，完成后合并到 main 并删除分支
- 分支命名：`feature/xxx`、`fix/xxx`、`refactor/xxx`
- 不在 main 上直接开发复杂功能

## 提交前检查

- ✅ `npm run lint` 通过
- ✅ `npm test` 通过
- ✅ 无调试代码残留
- ✅ Commit message 符合规范
- ✅ 不包含不相关变更
