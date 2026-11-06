# Windows 夜间自动学习 · 任务计划模板（T-M5.2）

`register-nightly-learn.ps1` 把 `evokit learn` 注册为 Windows 计划任务，每天固定时间自动执行「收割 → 提纯 → 按档位入库」的夜间学习。脚本只是模板，**不会自动注册**——按下面的命令手动安装/管理，任务名为 `EvoKit Learn`。

## 与 evokit learn 的关系

- 计划任务每天到点执行，等价于手动敲: `node <仓库绝对路径>\cli\evokit.mjs learn --auto`（或 `--assist`）。
- `learn` 单次运行的行为、三档位（manual/assist/auto）与知识根结构见 `cli/README.md`；本脚本只负责「每天到点替你敲一次」。
- 夜间学习会写知识根并产生 git 提交；早上用 `evokit review` 处理留审草稿即可。

## 四条命令

在仓库根目录执行。**无需管理员权限**：schtasks 为当前用户创建自身任务即可。

```powershell
# 安装：注册每日 02:00 的任务（默认 auto 档）
powershell -ExecutionPolicy Bypass -File scripts\schedule\register-nightly-learn.ps1

# 卸载：删除任务（任务不存在时提示「无需删除」，幂等，退出码 0）
powershell -ExecutionPolicy Bypass -File scripts\schedule\register-nightly-learn.ps1 -Uninstall

# 查询：任务不存在时友好提示「尚未注册」（退出码 0，不抛异常）
powershell -ExecutionPolicy Bypass -File scripts\schedule\register-nightly-learn.ps1 -Query

# 手动触发一次：等价于到点跑一遍，用于验证整条链路
powershell -ExecutionPolicy Bypass -File scripts\schedule\register-nightly-learn.ps1 -Run
```

## 参数说明

| 参数 | 说明 |
| --- | --- |
| （无参数） | 注册计划任务（默认动作） |
| `-DryRun` | 校验模式：解析路径、校验参数后只打印将执行的 schtasks 命令，不执行；可与任一动作叠加 |
| `-Uninstall` | 删除任务（`schtasks /Delete /TN "EvoKit Learn" /F`） |
| `-Query` | 查询任务状态（`schtasks /Query /TN "EvoKit Learn" /V /FO LIST`） |
| `-Run` | 立即触发一次（`schtasks /Run /TN "EvoKit Learn"`） |
| `-Mode auto/assist` | `learn` 的临时档位覆盖，默认 `auto`（取舍见下文「注意点」） |
| `-Time HH:mm` | 每日触发时间（24 小时制），默认 `02:00` |

`-Query` / `-Run` / `-Uninstall` 一次只能选一个；脚本位于仓库 `scripts\schedule\` 下，路径靠 `$PSScriptRoot` 反推，不要把脚本单独拷出去用。

## 验证方法

1. 注册前先校验（不落任何系统状态）: 加 `-DryRun` 运行，应退出码 0 并打印将执行的注册命令。
2. 注册后从系统侧确认: `schtasks /Query /TN "EvoKit Learn" /V /FO LIST`，或脚本 `-Query`。
3. 实测整条链路: `-Run` 立即触发一次，然后看知识根的 git log 是否新增学习提交、`evokit review` 里是否有留审草稿。

## 卸载方法

```powershell
powershell -ExecutionPolicy Bypass -File scripts\schedule\register-nightly-learn.ps1 -Uninstall
```

等价于 `schtasks /Delete /TN "EvoKit Learn" /F`；只删计划任务，不动知识根与已入库数据。重新安装直接再跑一次无参数命令（`/F` 覆盖同名任务）。

## 注意点

- **node 来自 PATH**: 任务运行时用的是任务环境的 PATH 上的 `node`，不是你交互 shell 的 PATH。若 node 由 fnm 管理，建议把 node.exe 绝对路径写死进 `/TR`——脚本头部注释③有整行示例，可用 `(Get-Command node).Source` 查当前绝对路径。
- **misfire 语义**: 错过触发窗口（关机/睡眠）不补跑，第二天同一时间照常执行。确需「错过后尽快补跑」请到任务计划程序 GUI 手工配置，本模板刻意不做。
- **登录要求**: 任务默认「仅当用户登录时运行」（锁屏不算注销）；需注销后运行请到任务计划程序 GUI 调整。
- **auto 与 assist 的取舍**: `--auto` 全部草稿自动入库，无人值守最省事，但低置信/可疑草稿也会直接入库，噪音风险自担；`--assist` 只把高置信草稿自动入库、其余留审，夜里更稳，代价是早上多一次 review。注意: `--assist` 需要 CLI 支持该参数（属 T-M5.1/M5 范围）；若当前版本 `evokit learn` 未识别，参数会被忽略、按 `knowledge.automation` 默认档位执行，此时请先用 `--auto`。
- **路径写死**: 任务里保存的是注册时的仓库绝对路径；仓库挪动/改名后需 `-Uninstall` 再重新注册。
