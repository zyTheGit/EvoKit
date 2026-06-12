/**
 * EvoKit — Claude Code Adapter
 *
 * Implements the AgentAdapter interface for Claude Code.
 * Claude Code uses the .claude/ directory structure with:
 * - settings.json hooks for lifecycle management
 * - .claude/commands/ for slash commands
 * - .claude/agents/ for sub-agents
 * - .claude/memory/ for learning data
 *
 * @packageDocumentation
 */

// Adapter implementation for Claude Code
// Status: ✅ Complete (via template/ directory and hooks)
//
// Unlike other adapters that require runtime code,
// Claude Code integration is entirely file-based:
//
// 1. Template files → ~/.claude/
// 2. Hooks configured in settings.json
// 3. Commands as markdown files
// 4. Memory as JSONL files
//
// No runtime adapter code needed for basic functionality.
// Future versions may add:
// - Programmatic memory injection
// - Cross-session state management
// - Advanced analytics

export const CLAUDE_ADAPTER_VERSION = '0.2.0';
