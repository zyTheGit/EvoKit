/**
 * EvoKit — __HOME__ Placeholder Replacement Utilities
 *
 * Provides two strategies for replacing `__HOME__` placeholders
 * in template content:
 *
 * - `replaceHomeInString` — plain-text replacement for non-JSON files
 *   (shell scripts, markdown, etc.)
 * - `replaceHomeInObject` — recursive replacement inside parsed JSON
 *   objects.  This avoids the Windows-path-backslash bug that occurs
 *   when replacing `__HOME__` in a raw JSON string before parsing
 *   (e.g. `C:\Users\x` produces invalid escape sequences like `\U`).
 *
 * On Windows, both functions convert backslashes to forward slashes
 * in strings that contained `__HOME__`.  This ensures that hook
 * commands like `bash C:/Users/x/.claude/hooks/...` work correctly
 * in Git Bash / MSYS2, where backslashes would be interpreted as
 * escape characters.
 *
 * @packageDocumentation
 */

/**
 * Replace all `__HOME__` placeholders in a plain-text string.
 *
 * On Windows, converts backslashes to forward slashes in the
 * replacement result, since bash treats `\` as an escape character.
 *
 * Safe for shell scripts, markdown, and other non-JSON content.
 * For JSON content, use `replaceHomeInObject` instead to avoid
 * backslash-escaping issues on Windows.
 */
export function replaceHomeInString(content: string, homeDir: string): string {
  const result = content.replace(/__HOME__/g, homeDir);
  // On Windows, convert backslashes to forward slashes in strings
  // that contained __HOME__ — bash interprets \ as escape char.
  if (process.platform === 'win32' && content.includes('__HOME__')) {
    return result.replace(/\\/g, '/');
  }
  return result;
}

/**
 * Recursively replace all `__HOME__` placeholders in string values
 * within a parsed JSON object.
 *
 * This is the correct approach for JSON content because:
 * 1. The template is parsed as JSON *before* replacement (no raw-string
 *    backslash issues on Windows).
 * 2. `JSON.stringify` will automatically escape backslashes in the
 *    final output, producing valid JSON regardless of platform.
 * 3. On Windows, backslashes in replaced strings are converted to
 *    forward slashes, ensuring hook commands work in Git Bash.
 *
 * Only strings that originally contained `__HOME__` are converted —
 * other string values (e.g. glob patterns in permissions) are left
 * untouched.
 *
 * @param obj - A value parsed from JSON (object, array, string, etc.)
 * @param homeDir - The path to substitute for `__HOME__`
 * @returns A new value with all `__HOME__` placeholders replaced
 */
export function replaceHomeInObject<T>(obj: T, homeDir: string): T {
  if (typeof obj === 'string') {
    if (!obj.includes('__HOME__')) return obj;
    const replaced = obj.replace(/__HOME__/g, homeDir);
    // On Windows, convert backslashes to forward slashes in strings
    // that contained __HOME__ — bash interprets \ as escape char.
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

  // Primitives (number, boolean, null) — return as-is
  return obj;
}
