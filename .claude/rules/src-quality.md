# 源码质量（编辑 src/** 与 tests/** 时强制）

完整版见 `docs/zh/DEV_STANDARDS.md` §1–2：

- **测试门禁** — 改动 `src/` 必须 `npm test`（vitest，测试位于 `tests/**/*.test.ts`）通过后方可提交；新功能必须附带测试
- **提交前检查** — `npm run lint`（ESLint）与 `npm run format`（Prettier）
- **Shell 脚本** — `.sh` 改动必须通过 `shellcheck bin/*.sh template/claude/hooks/*.sh`
- **关键 lint 规则** — `eqeqeq` 为 error 级；`no-explicit-any` 为 warn 级（新代码避免）
