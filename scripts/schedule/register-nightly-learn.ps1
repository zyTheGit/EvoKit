<#
.SYNOPSIS
  把 evokit learn 注册为 Windows 每日计划任务（T-M5.2 模板，不自动注册）。

.DESCRIPTION
  本脚本是「注册模板」：任务名为 "EvoKit Learn"，由你手动执行来创建/管理。
  无参数运行 = 注册；-DryRun = 校验模式（只打印将执行的 schtasks 命令，不执行）。

  用法（在仓库根目录执行）:
    powershell -ExecutionPolicy Bypass -File scripts\schedule\register-nightly-learn.ps1             # 注册（默认动作）
    powershell -ExecutionPolicy Bypass -File scripts\schedule\register-nightly-learn.ps1 -DryRun     # 校验模式：只打印不执行
    powershell -ExecutionPolicy Bypass -File scripts\schedule\register-nightly-learn.ps1 -Query      # 查询任务状态
    powershell -ExecutionPolicy Bypass -File scripts\schedule\register-nightly-learn.ps1 -Run        # 立即触发一次
    powershell -ExecutionPolicy Bypass -File scripts\schedule\register-nightly-learn.ps1 -Uninstall  # 删除任务

  参数:
    -Mode auto|assist   learn 的临时档位覆盖，默认 auto
    -Time HH:mm         每日触发时间（24 小时制），默认 02:00

  权限: schtasks 为「当前用户」创建任务即可，普通用户无需管理员。
  兼容性: 面向 Windows PowerShell 5.1 编写，未使用 PowerShell 7+ 语法。
#>
param(
    [switch]$Uninstall,
    [switch]$Query,
    [switch]$Run,
    [switch]$DryRun,
    [string]$Mode = 'auto',
    [string]$Time = '02:00'
)

$ErrorActionPreference = 'Stop'
$TaskName = 'EvoKit Learn'

function Fail {
    param([string]$Message)
    Write-Host ("[register-nightly-learn] 错误: " + $Message) -ForegroundColor Red
    exit 1
}

# 用 .NET Process 直跑 schtasks：原始命令行逐字符可控（/TR 里的内嵌引号不会被 PowerShell 的
# 原生参数二次改写），stdout/stderr 用 ReadToEndAsync 捕获互不阻塞，stderr 也不会变成未处理异常。
function Invoke-SchTasks {
    param([string]$RawArgs)
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'schtasks.exe'
    $psi.Arguments = $RawArgs
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $proc = [System.Diagnostics.Process]::Start($psi)
    $outTask = $proc.StandardOutput.ReadToEndAsync()
    $errTask = $proc.StandardError.ReadToEndAsync()
    $proc.WaitForExit()
    $outText = ''
    if ($outTask.Result) { $outText = $outTask.Result.TrimEnd() }
    $errText = ''
    if ($errTask.Result) { $errText = $errTask.Result.TrimEnd() }
    return [pscustomobject]@{ ExitCode = $proc.ExitCode; StdOut = $outText; StdErr = $errText }
}

try {
    # ── 仓库根与 CLI 入口解析 ─────────────────────────────────────────────
    # 【① 绝对路径，不依赖运行期工作目录】任务计划程序启动任务时，工作目录固定为
    # %WinDir%\System32，不继承你当前 shell 的工作目录（ADR 0007 §5 的教训：不能依赖
    # 运行期工作目录/会话环境）。因此这里从 $PSScriptRoot（scripts\schedule\）反推仓库根，
    # 把 cli\evokit.mjs 的绝对路径在「注册时」写死进 /TR。注意：仓库挪动/改名后需重新注册。
    $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
    $cliPath = Join-Path $repoRoot 'cli\evokit.mjs'

    # ── 参数校验 ─────────────────────────────────────────────────────────
    if ($Mode -ne 'auto' -and $Mode -ne 'assist') {
        Fail ("-Mode 只能是 auto 或 assist，收到: " + $Mode)
    }
    if ($Time -notmatch '^([01]?[0-9]|2[0-3]):[0-5][0-9]$') {
        Fail ("-Time 需要 HH:mm（24 小时制，如 02:00），收到: " + $Time)
    }
    # 归一化 H:mm -> HH:mm（schtasks /ST 要求 HH:mm）
    if ($Time.Length -eq 4) { $Time = '0' + $Time }

    # ── 动作选择：-Query/-Run/-Uninstall 互斥；都不给 = 注册（默认动作） ──
    $actions = @()
    if ($Query)     { $actions += 'query' }
    if ($Run)       { $actions += 'run' }
    if ($Uninstall) { $actions += 'uninstall' }
    if ($actions.Count -gt 1) {
        Fail "-Query / -Run / -Uninstall 一次只能选一个。"
    }
    if ($actions.Count -eq 1) { $action = $actions[0] } else { $action = 'register' }

    # 【② misfire 语义】/SC DAILY 错过触发窗口（关机/睡眠/正忙）不补跑：当天错过就跳过，
    # 第二天同一时间照常执行。schtasks 命令行不支持「错过后尽快补跑」；确需补跑去任务计划
    # 程序 GUI 手工勾选「错过计划后尽快启动」，本模板刻意不配置，避免开机集中补跑。
    #
    # 【③ node 来自 PATH】/TR 里的 `node` 由「任务运行时的 PATH」解析，不是你交互 shell 的
    # PATH——fnm/nvm 等版本管理器的 PATH 注入只在用户会话生效，计划任务里可能解析不到或
    # 解析到别的版本。若 node 来自 fnm，建议把 node.exe 绝对路径写死进 /TR（用
    # `(Get-Command node).Source` 查当前绝对路径），例如整条命令换成:
    #   schtasks /Create /TN "EvoKit Learn" /SC DAILY /ST 02:00 /TR "\"C:\Users\<you>\AppData\Roaming\fnm\node-versions\v22.20.0\installation\node.exe\" \"C:\<repo>\cli\evokit.mjs\" learn --auto" /F
    #
    # 【④ --auto 与 --assist 取舍】--auto：全部草稿自动入库，夜间无人值守最省事，但低置信、
    # 可疑草稿也会直接入库，噪音风险自担；--assist：只有高置信草稿自动入库，其余留审，夜里
    # 更稳，代价是早上多花几分钟 evokit review。learn 的默认档位由 knowledge.automation 配置
    # 决定（manual/assist/auto），这两个参数是「本次临时覆盖」。注意：--assist 需要 CLI 支持
    # 该参数（属 M5 范围），若当前版本 learn 未识别，参数会被忽略、按 knowledge.automation
    # 默认档位执行，此时请用 --auto。
    #
    # 【权限】schtasks 为当前用户创建自身任务，普通用户即可，无需管理员；任务默认
    # 「仅当用户登录时运行」（锁屏不算注销）。/F 表示同名任务已存在时覆盖。
    $raw = ''
    $needCliCheck = $false
    switch ($action) {
        'register' {
            # /TR 的值本身含空格，外层引号包住整个值；内层路径引号用 \" 转义。
            # 任务里最终保存的命令行: node "C:\...\cli\evokit.mjs" learn --auto
            $raw = '/Create /TN "' + $TaskName + '" /SC DAILY /ST ' + $Time +
                   ' /TR "node \"' + $cliPath + '\" learn --' + $Mode + '" /F'
            $needCliCheck = $true
        }
        'query'     { $raw = '/Query /TN "' + $TaskName + '" /V /FO LIST' }
        'run'       { $raw = '/Run /TN "' + $TaskName + '"' }
        'uninstall' { $raw = '/Delete /TN "' + $TaskName + '" /F' }
    }

    if ($needCliCheck -and -not (Test-Path -LiteralPath $cliPath)) {
        Fail ("未找到 CLI 入口: " + $cliPath + "（请确认本脚本位于仓库 scripts\schedule\ 下）")
    }

    # ── DryRun：校验模式，只打印将执行的命令，不执行 ─────────────────────
    if ($DryRun) {
        Write-Host '[DryRun] 校验通过，以下为将执行的命令（本次未实际执行）:'
        Write-Host ('  schtasks ' + $raw)
        if ($action -eq 'register') {
            Write-Host ('  任务名: ' + $TaskName + ' | 每日 ' + $Time + ' | learn --' + $Mode)
            Write-Host ('  CLI 入口: ' + $cliPath)
            Write-Host '  去掉 -DryRun 重新运行即实际注册。'
        }
        exit 0
    }

    # ── 执行 ─────────────────────────────────────────────────────────────
    $result = Invoke-SchTasks $raw
    switch ($action) {
        'register' {
            if ($result.ExitCode -ne 0) {
                Fail ("schtasks 注册失败（exit " + $result.ExitCode + "）: " + ($result.StdErr + ' ' + $result.StdOut).Trim())
            }
            Write-Host ("已注册计划任务 `"" + $TaskName + "`"（每日 " + $Time + "，执行 learn --" + $Mode + "）。")
            Write-Host "后续: -Query 查看状态 | -Run 立即试跑一次 | -Uninstall 卸载。"
        }
        'query' {
            if ($result.ExitCode -ne 0) {
                # 未注册是正常状态：友好提示即可，不算失败（exit 0），不抛异常。
                Write-Host ("未找到计划任务 `"" + $TaskName + "`"——当前尚未注册。")
                Write-Host "提示: 运行本脚本（无参数）即注册；可先加 -DryRun 预览将执行的命令。"
                exit 0
            }
            Write-Host $result.StdOut
            exit 0
        }
        'run' {
            if ($result.ExitCode -ne 0) {
                Fail ("触发失败（exit " + $result.ExitCode + "）: " + ($result.StdErr + ' ' + $result.StdOut).Trim() + "——若提示找不到任务，请先注册。")
            }
            Write-Host ("已触发计划任务 `"" + $TaskName + "`"。用 -Query 或任务计划程序查看运行结果。")
        }
        'uninstall' {
            if ($result.ExitCode -ne 0) {
                # 幂等卸载：任务不存在时提示即可，不算失败。
                Write-Host ("未找到计划任务 `"" + $TaskName + "`"——无需删除（当前已是未注册状态）。")
                exit 0
            }
            Write-Host ("已删除计划任务 `"" + $TaskName + "`"。")
        }
    }
    exit 0
}
catch {
    # 兜底：任何未预期异常都转成一条友好错误 + exit 1，不向用户抛原始堆栈。
    Write-Host ("[register-nightly-learn] 意外错误: " + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
