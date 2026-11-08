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
