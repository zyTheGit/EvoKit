/**
 * EvoKit — __HOME__ 占位符替换工具
 *
 * 提供两种策略来替换模板内容中的 `__HOME__` 占位符：
 *
 * - `replaceHomeInString` — 纯文本替换，用于非 JSON 文件
 *   （shell 脚本、markdown 等）
 * - `replaceHomeInObject` — 在已解析的 JSON 对象中递归替换。
 *   这避免了在解析原始 JSON 字符串之前替换 `__HOME__` 时
 *   出现的 Windows 反斜杠路径 bug（例如 `C:\Users\x` 会产生
 *   `\U` 等无效转义序列）。
 *
 * 在 Windows 上，两个函数都会将包含 `__HOME__` 的字符串中的
 * 反斜杠转换为正斜杠。这确保了 hook 命令如
 * `bash C:/Users/x/.claude/hooks/...` 在 Git Bash / MSYS2 中
 * 正常工作，因为反斜杠会被解释为转义字符。
 *
 * @packageDocumentation
 */

/**
 * 替换纯文本字符串中所有 `__HOME__` 占位符。
 *
 * 在 Windows 上，将替换结果中的反斜杠转换为正斜杠，
 * 因为 bash 将 `\` 视为转义字符。
 *
 * 适用于 shell 脚本、markdown 及其他非 JSON 内容。
 * 对于 JSON 内容，请使用 `replaceHomeInObject` 以避免
 * Windows 上的反斜杠转义问题。
 */
export function replaceHomeInString(content: string, homeDir: string): string {
  const result = content.replace(/__HOME__/g, homeDir);
  // 在 Windows 上，将包含 __HOME__ 的字符串中的反斜杠转换为正斜杠
  // — bash 将 \ 视为转义字符
  if (process.platform === 'win32' && content.includes('__HOME__')) {
    return result.replace(/\\/g, '/');
  }
  return result;
}

/**
 * 在已解析的 JSON 对象的字符串值中递归替换所有 `__HOME__` 占位符。
 *
 * 这是处理 JSON 内容的正确方式，因为：
 * 1. 模板在替换之前先解析为 JSON（避免 Windows 上的原始字符串反斜杠问题）。
 * 2. `JSON.stringify` 会自动转义最终输出中的反斜杠，无论平台如何都能生成有效 JSON。
 * 3. 在 Windows 上，替换后字符串中的反斜杠会转换为正斜杠，确保 hook 命令在 Git Bash 中正常工作。
 *
 * 仅转换原本包含 `__HOME__` 的字符串 — 其他字符串值（如权限中的 glob 模式）保持不变。
 *
 * @param obj - 从 JSON 解析的值（对象、数组、字符串等）
 * @param homeDir - 用于替换 `__HOME__` 的路径
 * @returns 替换所有 `__HOME__` 占位符后的新值
 */
export function replaceHomeInObject<T>(obj: T, homeDir: string): T {
  if (typeof obj === 'string') {
    if (!obj.includes('__HOME__')) return obj;
    const replaced = obj.replace(/__HOME__/g, homeDir);
    // 在 Windows 上，将包含 __HOME__ 的字符串中的反斜杠转换为正斜杠
    // — bash 将 \ 视为转义字符
    if (process.platform === 'win32') {
      return replaced.replace(/\\/g, '/') as T;
    }
    return replaced as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((v) => replaceHomeInObject(v, homeDir)) as T;
  }

  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = replaceHomeInObject(v, homeDir);
    }
    return result as T;
  }

  // 原始类型（number、boolean、null）— 原样返回
  return obj;
}
