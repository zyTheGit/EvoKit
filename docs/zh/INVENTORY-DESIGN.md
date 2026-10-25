# EvoKit 知识库冗余体检（inventory）设计方案

> 状态：方案已与用户对齐，待实现。
> 核心思想：EvoKit 做「通用」的事（扫描 + 生成通用 prompt + 调 CLI + 回显），把「判断冗余」这个需要语义理解的重活，交给 agent 自己。

## 一、定位

`evokit inventory` 是一个**只读的提示词知识库体检工具**，目标是：

1. 通用扫描各 agent（Claude Code / Pi / Codex / Cursor）留存的知识库
2. 生成一份**通用整理 prompt**（不绑定具体 agent 的判定逻辑）
3. 直接调用 agents cli，让 agent 自己找出冗余/冲突/过期/断链
4. 把 agent 返回的结构化报告回显给用户参考

**EvoKit 不做「冗余判定」** —— 判定冗余/冲突需要语义理解，这恰恰是 agent 擅长的。EvoKit 只负责通用的扫描、prompt 模板、进程调用、结果回显。

## 二、扫描范围（知识库形态）

| 分类 | 全局 | 项目级 |
| --- | --- | --- |
| agents（子代理） | `~/.claude/agents/*.md`、`~/.cursor/agents/*` | `.claude/agents/` |
| skills | `~/.claude/skills/*`、`~/.codex/skills/*` | `.claude/skills/` |
| rules | `~/.codex/rules/*`、`~/.cursor/rules/*` | `.cursor/rules/`、`.claude/rules/`、`.codex/rules/` |
| commands（斜杠命令） | `~/.claude/commands/*`、`~/.cursor/skills-cursor/*` | `.claude/commands/` |
| 全局提示词 | `~/.claude/CLAUDE.md`、`~/.codex/AGENTS.md`、`~/.pi/agent/APPEND_SYSTEM.md` | 项目级 CLAUDE.md / AGENTS.md |
| MCP 配置 | `~/.codex/config.toml`、`~/.claude/settings.json`、`~/.pi/agent/mcp.json` | `.pi/mcp.json` |
| 缓存/记忆 | `~/.claude/agent-memory/`、`history.jsonl`、`~/.pi/models-store.json`、sessions 等 | — |
| skill 源仓库 | `~/.agents/skills/`（大量软链接的真实源） | — |

扫描输出：每个文件记录 `路径 + 大小 + 修改时间 + 软链接指向`，作为喂给 agent 的「清单」。

## 三、通用 prompt 模板

EvoKit 生成一份 prompt，对每个 agent 骨架相同，只有「清单数据」和「agent 名」不同：

```
你是 {agent 名}，正在做一次自己留存知识库的冗余体检。

下面是你当前留存的知识库清单（含路径、大小、修改时间、软链接指向）：

{清单数据}

请帮我找出并整理以下冗余，输出一份结构化 Markdown 报告：
1. 【重复项】同名或内容高度相似的 skill/规则，散在多处（列出位置与差异）
2. 【冲突项】对同一件事给出不同/矛盾规则的提示词
3. 【过期/断链】软链接指向不存在的源、长期未更新的项
4. 【可清理缓存】体积大或明显冗余的历史/缓存/会话文件
5. 【整理建议】按优先级给出具体的合并/删除/统一建议

要求：
- 只读分析，不要修改任何文件
- 输出格式固定为上面 5 个区块
- 每条冗余标注：涉及路径 + 问题说明 + 建议动作
```

## 四、agents cli 调用映射

| agent | CLI | 非交互调用 | 备注 |
| --- | --- | --- | --- |
| Claude Code | `claude` | `claude -p "<prompt>"` | print mode，写 stdout 后退出 |
| Pi | `pi` | `pi --print "<prompt>"`（`-p` 短别名） | 支持 `--append-system-prompt`、`@path` |
| Codex | `codex` | `codex exec "<prompt>"` | 需确认本机命令 |

**关键约束**：调用前必须探测 CLI 是否存在（`which`/`--version`）。不可用的 agent 明确提示「未检测到 xxx CLI，跳过」，不让整个流程崩。

## 五、命令形态

```
evokit inventory                    # 扫描 + 生成 prompt + 调所有可用 agent + 回显
evokit inventory --agent claude     # 只让 claude 整理
evokit inventory --agent claude,pi  # 让多个 agent 并行/串行整理
evokit inventory --prompt           # 只生成通用 prompt 并打印/存文件，不调 CLI（调试用）
evokit inventory --project          # 只看项目级
```

## 六、与现有功能的边界（不重复）

- `sync`：同步文件（写托管块）
- `check`：一致性检查
- `status`：同步状态
- `inventory`：**只读体检 + 委托 agent 整理**（全新能力，不碰文件，不改 sync 逻辑）

## 七、实现步骤

1. 通用扫描器：扫出知识库清单（路径/大小/mtime/软链接）
2. 通用 prompt 生成器：把清单填进模板
3. CLI 调用器：探测可用 CLI → 调 `-p`/`--print`/`exec` → 捕获 stdout
4. 回显器：展示每个 agent 的返回报告
5. 优雅降级：CLI 缺失、超时、无输出时的友好提示
6. 测试：隔离环境下验证扫描/prompt/回显逻辑（CLI 调用用 mock 或跳过）

## 八、待用户确认的遗留点

- [ ] Codex CLI 的命令名与参数（当前本机未安装，`codex exec` 为推测）
- [ ] 调用超时时间（建议 120s）
- [ ] 多个 agent 是串行还是并行（建议串行，避免并发冲突）
