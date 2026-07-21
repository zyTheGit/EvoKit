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
 * @packageDocumentation
 */

/**
 * Replace all `__HOME__` placeholders in a plain-text string.
 *
 * Safe for shell scripts, markdown, and other non-JSON content.
 * For JSON content, use `replaceHomeInObject` instead to avoid
 * backslash-escaping issues on Windows.
 */
export function replaceHomeInString(content: string, homeDir: string): string {
  return content.replace(/__HOME__/g, homeDir);
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
 *
 * @param obj - A value parsed from JSON (object, array, string, etc.)
 * @param homeDir - The path to substitute for `__HOME__`
 * @returns A new value with all `__HOME__` placeholders replaced
 */
export function replaceHomeInObject<T>(obj: T, homeDir: string): T {
  if (typeof obj === 'string') {
    return obj.replace(/__HOME__/g, homeDir) as T;
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
