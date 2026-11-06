# ADR 0007 — 钩子层 Node 化：以 `evokit hook` 子命令取代 bash 脚本

## 状态

**已被取代（Superseded，2026-10-27）**——v2.0 转向后仓库不再有任何钩子层（`template/`、`bin/` 已随提交 `7f78090` 删除），`evokit hook` 子命令不再实施。保留作历史决策记录，其中「逻辑只实现一次、放在跨平台的 Node 层、失败永不阻断宿主」这三条仍适用：v2.0 整体已是纯 Node、零依赖、跨平台（`README.md:14,18`）。逐条复核见 `docs/DIAGNOSIS-2026-10-v1.2-recall-loop.md` §9。

~~已接受（2026-10 方向复盘；依据 `docs/DIAGNOSIS-2026-10-v1.2-recall-loop.md` 诊断 D）~~

## 背景

现有钩子层是四个 bash 文件（`template/claude/hooks/{session-start,stop}.sh`、`template/codex/hooks-scripts/{session-start,stop}.sh`），实现的是 ADR 0001:36 承诺的"5 钩子精简为 2"。核对后发现三处结构性问题：

1. **GNU 专属依赖 + 静默吞掉**：`template/claude/hooks/session-start.sh:28` 与 `template/codex/hooks-scripts/session-start.sh:29` 用 `grep -oP`（PCRE，macOS BSD grep 不支持 `-P`），并尾接 `2>/dev/null || true`——在不支持的平台上**既不报错也无输出**，检查项 2 整体空转。作者与用户都不会发现钩子少跑了一项。
2. **Windows 原生无钩子层**：`README.md:42` 的前置条件是"bash 4.0+（Linux / macOS / WSL / Git Bash）"。Windows 上离开 Git Bash 即无钩子，而 EvoKit 的产品前提恰恰是"会话启动即注入"（ADR 0006 的 L1）。
3. **逻辑重复四份、与 `src/` 脱节**：同样的存在性/frontmatter/pending 计数检查在 4 个 shell 里各写一遍，而 `src/commands/boot.ts` 的 `runBootChecks` 与 `src/core/health.ts` 的 `inspectKnowledgeHealth` 已有更完整的同一套检查。**钩子不会随 CLI 的诊断能力演进**（v1.1 的索引漂移、v1.2 的归一化全等重复都没进钩子），这正是 ADR 0005 事后诊断"依赖有人跑 CLI"的盲区。

## 决策

新增 `evokit hook session-start` 与 `evokit hook stop` 两个子命令，作为钩子层的**唯一逻辑实现**；bash 壳降级为单行转发。

### 1. 命令契约

- `evokit hook session-start [--json]`：输出要进上下文的文本（ADR 0006 的 L1 索引块 + 完整性摘要）。
- `evokit hook stop [--json]`：输出待确认提示（`.pending/` 非空时）。
- **复用既有能力，不新写检查逻辑**：`runBootChecks`（`src/commands/boot.ts`）+ `inspectKnowledgeHealth`（`src/core/health.ts`）+ `readKnowledgeIndex`（`src/core/knowledge.ts`）。
- **纯只读**：hook 命令不写任何文件、不迁移条目、不改索引。
- **扫双根**：个人根 `~/.evokit/knowledge/` + 项目根 `<cwd>/.evokit/`（与诊断 B 的修法一致，见 ADR 0008）。

### 2. 永不阻断会话：exit 0 是无条件纪律

钩子失败会让助手会话报错或卡住。故**任何路径都必须 exit 0**，包括索引损坏、目录缺失、未知异常。异常信息进 stderr，不进 stdout。

### 3. `--json` 的 stdout 必须是单个合法 JSON

非 `--json` 模式输出人类/模型可读文本；`--json` 模式：

- stdout **有且只有一个** JSON 文档；错误与降级信息一律走 stderr 或 JSON 内的 `error` 字段；
- **异常堆栈禁止进 stdout**——钩子 stdout 整段进模型上下文，堆栈会污染会话；
- 必须可区分"0 条条目"与"出错了所以没输出"：前者是合法数据（`entries: []`），后者带 `error` 字段。二者都 exit 0，靠字段区分而非退出码。

### 4. 同步 `bin/evokit.cjs` 命令白名单（硬前提）

`bin/evokit.cjs:49-61` 的 `knownCommands` 数组是加载 dist 前的快速失败闸门，**不含 `hook`**。若只加 commander 子命令而不改白名单，`evokit hook` 会在 launcher 层打印"未知命令"并 `process.exit(1)`——**恰好违反本 ADR 第 2 条**。因此白名单同步与命令实现属同一个改动，不得分两个 PR。

### 5. 命令串的生成机制

现模板写的是 `bash __HOME__/.claude/hooks/session-start.sh`（`template/claude/settings.json:10,21`），`__HOME__` 由 `src/core/replace-home.ts` 在安装时替换。新命令串需要指向 `evokit` 可执行文件的**绝对路径**，而该路径不在 `$HOME` 下（npm 全局 bin 目录），故：

- 不能只靠 `__HOME__` 占位符，需要新增一个安装期占位符（如 `__EVOKIT_BIN__`）并在 `replace-home.ts` 同层机制里解析替换；
- 替换值取安装时记录的 `process.execPath` 与解析到的 `evokit` 入口，**不取运行期 PATH 上的 `node`**（见第 7 条）。

### 6. bash 壳保留一个版本，但只剩一行转发

存量用户的 `settings.json` 里写的是 `bash ~/.claude/hooks/session-start.sh`（`src/core/merge-settings.ts:152-162` 的 hook 合并按 **JSON 全等去重**），因此升级期若模板同时改成 node 直调，旧组与新组 JSON 不等 → **两份 hook 并跑**（同一会话两次检查、两次提示）。过渡策略：

- 本版本：模板 shell 文件保留，内容改为一行 `node <evokit> hook …`，`settings.json` 命令串**不变**——这样旧用户的 shell 路径仍然有效，且因为 JSON 全等而不产生重复组；
- 下一个版本再把命令串切到直接 node 调用并移除 shell 文件（该动作按行注记登记在 ROADMAP v1.3 段，不在本 ADR 范围内实施）。

### 7. 明确处理 Node 解析问题（本机已复现）

Windows + fnm 环境下，**非交互 shell 里 `node` 不可用**（fnm shim 报 `We can't find the necessary environment variables…` 并退出）。钩子正是在非交互 shell 里被调起的，因此"命令串写 `node …`"在真实用户环境可能直接失败。要求：命令串使用**安装期解析出的绝对 `node`/入口路径**，并让 SP-3 验证其在 PowerShell / cmd / Git Bash / WSL 四种调起方式下均可执行。

### 8. 否掉的方案

- 再写一份 PowerShell 脚本：把四份 bash 变八份，诊断 D 的根因（逻辑与 `src/` 脱节）一点没解决。
- 继续 bash 但改 `grep -E`：只修 `-P` 兼容性，Windows 原生与逻辑重复两个问题原样保留。
- 引入外部任务调度常驻跑诊断：违反 ADR 0001 隐私优先与 ADR 0005"不引入 daemon"。

## 取舍

### 选 Node 单实现，而非"各助手各一份 shell"

- **放弃**：零依赖（钩子不再只依赖 bash）、模板层"改文案即生效"的廉价感
- **获得**：检查逻辑与 `boot`/`doctor` 同源，随 CLI 演进；跨 Windows/macOS/Linux 一致；`-oP` 类平台陷阱消失
- **代价**：钩子开始依赖 Node 与 npm 全局安装的可用性——这代价正是第 5/7 条要专门处理的原因，不是可忽略的脚注

### 选"保留一行 bash 壳一个版本"，而非一步切到 node 直调

- **放弃**：改动面的整洁（一次换干净）
- **获得**：避开 `merge-settings.ts` 全等去重导致的**双 hook 并跑**，存量用户无感升级
- **代价**：一个版本内同时存在壳与实现两层，需在下版本收口

### 选"永远 exit 0"，而非"失败即报错以便发现"

- **放弃**：钩子自身的故障可见性
- **获得**：绝不因知识库状态阻断用户会话（钩子属便利层，不是正确性关口）
- **代价**：静默失败风险回归——由第 3 条的 `error` 字段 + E2 的异常用例测试兜住，而非由退出码兜

## 前置依赖与验收

**前置**：`evokit hook` 的实现属 v1.3 代码工作；本 ADR 只定契约。SP-3（Windows node 解析）是其生效前提。

**验收**：

- E2：`hook session-start --json` 在 fixture 下 `entries` 数 ≥1 且 stdout 是单个合法 JSON；`hook stop` 在项目根 `.pending/` 非空时给出提示；**索引损坏 / 目录缺失 / 抛异常三种情况下仍 exit 0 且 stdout 无堆栈**。
- E4 防回退：模板与 `src/` 全仓不得再出现 `grep -oP`；bash 壳文件断言仅剩转发行。
- 白名单：断言 `bin/evokit.cjs` 的 `knownCommands` 含 `hook`（防第 4 条被回退）。
- 首颗示踪弹范围：先只打通 **Claude 一条通道**（含白名单同步），Codex 侧对接随 ADR 0006 的 SP-2 结论。
