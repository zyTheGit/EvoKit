# EvoKit Development Standards

> **This document is the authoritative development standard for the EvoKit repository.**
> Other entry files (`CLAUDE.md`, `.claude/rules/`, `CONTRIBUTING.md`) keep summaries only and point to the relevant section here.
> When rules conflict, this document wins. To change a rule, update this document first, then sync the summaries.
>
> 中文版：[docs/zh/DEV_STANDARDS.md](../zh/DEV_STANDARDS.md)

## Table of Contents

1. [Code Style](#1-code-style)
2. [Testing Requirements](#2-testing-requirements)
3. [Commit Conventions](#3-commit-conventions)
4. [Branches & PRs](#4-branches--prs)
5. [Versioning & Releases](#5-versioning--releases)
6. [Documentation Sync](#6-documentation-sync)
7. [Template Red Lines](#7-template-red-lines)
8. [AI Collaboration Rules](#8-ai-collaboration-rules)
9. [Appendix: Command Cheat Sheet](#9-appendix-command-cheat-sheet)

---

## 1. Code Style

- **Language & runtime**: TypeScript (ESM), Node.js ≥ 20.12.0 (see `engines` in `package.json`).
- **Identifiers in English**: variable, function, class, and file names follow English naming conventions.
- **Lint**: ESLint = `@eslint/js` recommended + `typescript-eslint` recommended + `eslint-config-prettier`. Key rules:

  | Rule                                 | Level | Notes                                               |
  | ------------------------------------ | ----- | --------------------------------------------------- |
  | `eqeqeq`                             | error | Enforce `===`/`!==` (except `null` comparisons)     |
  | `@typescript-eslint/no-explicit-any` | warn  | Allowed in migration/legacy code; avoid in new code |
  | `@typescript-eslint/no-unused-vars`  | warn  | Except `_`-prefixed args/destructuring              |
  | `prefer-const`                       | warn  | Use `const` for never-reassigned variables          |
  | `no-console`                         | off   | Console output allowed in CLI tools                 |

- **Formatting**: Prettier (aligned with ESLint via `eslint-config-prettier`). Run `npm run format` before committing; `npm run format:fix` when needed.
- **Comments prefer Chinese**: comments explaining intent and design decisions are written in Chinese (see `.claude/rules/chinese-output.md`).

## 2. Testing Requirements

- **Framework**: vitest; tests live in `tests/**/*.test.ts`.
- **Hard requirements**:
  - Any change under `src/` must pass `npm test` before commit.
  - New features must ship with tests; bug fixes should add a regression test first.
- **Coverage**: `npm run test:coverage` (v8 provider over `src/**/*.ts`). No hard threshold yet, but new core modules should cover their main paths.
- **Shell scripts**: every `.sh` must pass shellcheck:

  ```bash
  shellcheck bin/*.sh template/claude/hooks/*.sh
  ```

## 3. Commit Conventions

- Follow [Conventional Commits](https://www.conventionalcommits.org/) with **Chinese descriptions**:

  ```
  type(scope): 中文描述 (Chinese description)

  feat: 新增卸载命令
  fix(installer): 修复交互菜单回车符问题
  docs: 更新架构文档
  ```

- **Common types**: `feat` (feature), `fix` (bug fix), `docs` (documentation), `refactor`, `chore` (housekeeping/versioning), `test`.
- **Scope is optional**: recommended for modules like adapters and commands (e.g. `feat(uninstall): …`).
- One concern per commit; version bumps get their own commit (`chore: 版本升级至 x.y.z`).

## 4. Branches & PRs

- **Branch naming**: `feat/<name>`, `fix/<name>`, `docs/<name>`.
- **Pre-PR local validation** (CI-equivalent; steps defined in `.github/workflows/ci.yml`):

  ```bash
  npm run build && npm test          # build + tests
  npm run lint                       # ESLint
  shellcheck bin/*.sh template/claude/hooks/*.sh
  bash bin/install.sh --dry-run      # template dry-run validation
  grep -rn "/home/" template/ || echo "OK: no personal paths"
  ```

- **CI checks** (`ci.yml`): template structure integrity, no personal paths in templates, shellcheck, build, dry-run install, docs existence, tests.
- Issues use the repo templates: `bug-report.md` / `feature-request.md` (in `.github/ISSUE_TEMPLATE/`).

## 5. Versioning & Releases

- **Semantic Versioning (SemVer)**:

  | Bump      | Applies to                                                              |
  | --------- | ----------------------------------------------------------------------- |
  | **patch** | dev iterations, bug fixes, docs, refactors, comment changes             |
  | **minor** | feature milestones (e.g. a completed command, full adapter integration) |
  | **major** | breaking changes                                                        |

- **Release flow**:

  1. Bump the version in `package.json` (the CLI reads it dynamically — no hardcoded versions).
  2. Dedicated commit: `chore: 版本升级至 x.y.z`.
  3. Annotated tag: `git tag -a vx.y.z -m "vx.y.z: one-line summary"`.
  4. Push: `git push origin main && git push origin vx.y.z`.
  5. Create the release (**Chinese release notes**): `gh release create vx.y.z --title "vx.y.z" --notes "…"`.
  6. Update `CHANGELOG.md` (Chinese; grouped by Major/Documentation/Internal/Fix).

- **npm publishing**: handled by the `publish.yml` workflow; a local `npm publish` triggers `prepublishOnly` (build + test).

## 6. Documentation Sync

- **Chinese-first output**: git commits, release notes, code comments, CLI help, and docs prefer Chinese (full rule in `.claude/rules/chinese-output.md`).
- **Bilingual parallel**: same-named `.md` files in `docs/zh/` and `docs/en/` must stay parallel — a change on either side must be mirrored on the other.
- **README sync**: `README.md` (Chinese) and `README.en.md` (English) must stay in sync.
- **Chinese-only exception list** (intentionally no English version; new exceptions must be registered here and in `.claude/rules/docs-sync.md`):
  - `docs/zh/AI-DEVELOPMENT-STANDARDS.md` — an AI Agent development-standards practice guide written natively for the Chinese developer community.

## 7. Template Red Lines

`template/` **is the product** — it gets installed onto users' machines. Violating these red lines breaks user installs directly. CI enforces them.

- **No personal paths**: template files use the `__HOME__` placeholder, replaced by `sed` at install time. Never hardcode `/home/...` or similar (CI greps for this).
- **`settings.json`** also uses the `__HOME__` placeholder (replaced via `sed -i` during install).
- **Line limits**:
  - `template/claude/CLAUDE.md` ≤ **150 lines** (cognitive core, not a dumping ground).
- **Knowledge roots (v1.0)**: templates point to agent-agnostic shared roots — personal `~/.evokit/knowledge/`, project `<project>/.evokit/`; never bound to any assistant-private `memory/`.
- **No deprecated concepts**: templates must not reference v0 files (corrections.jsonl / observations.jsonl / learned-rules.md / evolution-log.md / sessions.jsonl / violations.jsonl / evokit-evolve / evokit-memory record-*). Knowledge uses conversation extraction + endorsement.
- **Embedded Python**: hooks like `stop.sh` prefer `uv run --isolated python3` for JSON processing (falling back to `python3` when unavailable).

## 8. AI Collaboration Rules

- **Chinese first**: all conversation, explanations, comments, and documentation output prefer Chinese; **sub agents (architect, reviewer, etc.) follow the same rule** — review feedback and architecture plans are written in Chinese.
- **Thinking framework** (see `CLAUDE.md`):
  1. **Understand** — read before editing; never edit a file you haven't read.
  2. **Plan** — outline an approach for complex tasks (>3 steps) before acting.
  3. **Verify** — confirm changes work (run tests, check output).
  4. **Learn** — corrected patterns are recorded to memory.
- **Completion standard**: a task is "done" only when — changes are tested/verifiable; no leftover `TODO`/`FIXME`/`console.log`/`debugger`; no files deleted without an explicit user request; `/evokit-boot` passes without violations.
- **Knowledge identification & endorsement**: when you recognize project/personal knowledge, silently write `.pending/` (do not guess scope); endorse happens at confirmation. Explicit declaration = `evokit learn "…"` (immediate endorsement).

  ```
  AI recognizes knowledge → write <project>/.evokit/.pending/{type}-{slug}.md
  → user runs evokit learn to endorse (single human-endorsement gate) → move into knowledge/ + update index
  ```

- **Knowledge commands**: `/evokit-boot` (knowledge integrity), `/evokit-learn` (endorse/declare), `/evokit-review` (revisit stale knowledge, confidence ≤ 0.5).

## 9. Appendix: Command Cheat Sheet

| Command                                                              | Purpose                               |
| -------------------------------------------------------------------- | ------------------------------------- |
| `npm run build`                                                      | Compile TypeScript (tsc)              |
| `npm run dev`                                                        | Run the CLI via tsx (development)     |
| `npm test`                                                           | Run vitest tests                      |
| `npm run test:coverage`                                              | Tests + coverage                      |
| `npm run lint` / `lint:fix`                                          | ESLint check / auto-fix               |
| `npm run format` / `format:fix`                                      | Prettier check / format               |
| `shellcheck bin/*.sh template/claude/hooks/*.sh`                     | Shell script static analysis          |
| `bash bin/install.sh --dry-run`                                      | Template structure dry-run validation |
| `HOME=/tmp/evokit-test-home bash bin/install.sh --template template` | Install into a test home directory    |
