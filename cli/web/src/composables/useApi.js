// API 访问层（D8 composables 层）：统一 fetch 封装 + 列表加载三件套
// 错误形态约定（契约 §8）：非 2xx 返回 {error:{code,message}}，此处解析后统一抛 Error
import { ref } from 'vue';
import { ElMessage } from 'element-plus';

/** GET JSON；非 2xx 抛 Error（message 取自 error.message） */
export async function apiGet(path) {
  const res = await fetch(path);
  let body = null;
  try { body = await res.json(); } catch { /* 非 JSON 响应体 */ }
  if (!res.ok) {
    throw new Error(body?.error?.message ?? `请求失败（HTTP ${res.status}）`);
  }
  return body;
}

/** 通用 JSON 写请求（PUT/POST）；非 2xx 抛 Error（message 取自 error.message） */
export async function apiSend(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  let data = null;
  try { data = await res.json(); } catch { /* 非 JSON 响应体 */ }
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `请求失败（HTTP ${res.status}）`);
  }
  return data;
}

/**
 * 列表/详情加载三件套：data / loading / error + reload。
 * @param {string | () => string} path 静态路径或返回路径的函数（响应式查询用，如 CardsView）
 */
export function useList(path) {
  const data = ref(null);
  const loading = ref(false);
  const error = ref('');

  async function load() {
    loading.value = true;
    error.value = '';
    try {
      data.value = await apiGet(typeof path === 'function' ? path() : path);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      ElMessage.error(error.value);
    } finally {
      loading.value = false;
    }
  }

  load();
  return { data, loading, error, reload: load };
}

/** ISO 时间 → 本地可读格式（'YYYY-MM-DD HH:mm:ss'）；无效输入原样返回 */
export function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 字节数 → 可读体积 */
export function formatSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n)) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

// ── 命令执行（FR-13）──

// 需要二次确认的命令：镜像自 cli/src/web/exec.js EXEC_WHITELIST 的 confirm 分级（改动需两侧同步）
export const CONFIRM_CMDS = ['sync', 'review', 'knowledge', 'harvest', 'learn', 'forge', 'inventory', 'schedule', 'uninstall'];

/**
 * 执行一条白名单命令（POST /api/exec，流式响应实时回传输出）。
 * @param {{ onChunk?: (text: string) => void }} [options] onChunk：每收到一块输出即回调（实时进度）
 * @returns {Promise<{output: string, exitCode: number, timedOut: boolean, durationMs: number, tier: string, cmd: string, args: string[]}>}
 *   output 为剥离了结果元数据行的完整输出文本
 */
export async function execCommand(cmd, args = [], options = {}) {
  const res = await fetch('/api/exec', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cmd, args }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(errBody?.error?.message ?? `执行失败（HTTP ${res.status}）`);
  }
  const MARK = '---evokit-exit---';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let output = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    output += text;
    if (options.onChunk) options.onChunk(text);
  }
  output += decoder.decode(); // flush 残留多字节字符
  // 分离末尾元数据行：---evokit-exit---{json}
  const idx = output.lastIndexOf(MARK);
  let meta = { cmd, args, exitCode: -1, timedOut: false, durationMs: 0, tier: '' };
  if (idx !== -1) {
    const metaPart = output.slice(idx + MARK.length).trim();
    output = output.slice(0, idx).replace(/\n$/, '');
    try { meta = { ...meta, ...JSON.parse(metaPart) }; } catch { /* 元数据损坏保持默认 */ }
  }
  return { output, ...meta };
}
