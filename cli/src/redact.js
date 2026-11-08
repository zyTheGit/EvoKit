// 记忆引擎 M1 脱敏引擎（T-M1.2）：收割时对 RawEvent 文本执行默认 7 类规则 + 用户扩充规则
// 设计见 docs/zh/MEMORY-ENGINE-DESIGN.md §4.3：会话历史出现过真实密钥，这一步不可省。

/** 命中后的统一占位符 */
const REDACTED = '[REDACTED]';

/**
 * 默认 7 类规则（数组顺序即执行顺序，前一条的替换结果作为后一条的输入）：
 *   1 openai-key   sk- 开头的 API Key
 *   2 aws-key      AWS AccessKeyId
 *   3 bearer-token Bearer <token>
 *   4 secret-kv    password/token/secret/api-key/access-key 的键值形态——只匹配 : / = 赋值，
 *                  普通句子里出现的 "token" 一词不会被误伤（后面没有 : 或 = 就不命中）
 *   5 private-ip   私网 IPv4（10.x / 172.16-31.x / 192.168.x）可带端口；127.0.0.1 不在私网段，天然保留
 *   6 auth-header  Authorization 请求头
 *   7 jdbc-url     jdbc:mysql|postgres 连接串
 */
export const DEFAULT_REDACT_RULES = [
  { name: 'openai-key', pattern: /\bsk-[A-Za-z0-9]{8,}/g },
  { name: 'aws-key', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'bearer-token', pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi },
  { name: 'secret-kv', pattern: /(?<![A-Za-z])(?:password|passwd|token|secret|api[_-]?key|access[_-]?key)\s*[:=]\s*["'\x60]?[^\s"',;)}\]]+/gi },
  { name: 'private-ip', pattern: /(?<![\d.])(?:10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])|192\.168)(?:\.\d{1,3}){2}(?::\d{1,5})?(?![\d.])/g },
  { name: 'auth-header', pattern: /\bauthorization\s*[:=]\s*[^,\r\n"']+/gi },
  { name: 'jdbc-url', pattern: /\bjdbc:(?:mysql|postgres(?:ql)?)\s*:\s*\/\/[^\s'"<>]+/gi },
];

/**
 * 对文本执行脱敏：默认 7 类 + extraPatterns（用户自定义正则字符串数组）。
 * 返回 { text, hits: [{rule, count}] }，hits 只含实际命中的规则；
 * extraPatterns 里坏的正则（new RegExp 抛错）静默跳过，不中断。
 */
export function redact(text, extraPatterns = []) {
  if (typeof text !== 'string' || text === '') return { text, hits: [] };
  const rules = DEFAULT_REDACT_RULES.map(r => ({ name: r.name, re: new RegExp(r.pattern.source, r.pattern.flags) }));
  const extras = Array.isArray(extraPatterns) ? extraPatterns : [];
  extras.forEach((p, i) => {
    if (typeof p !== 'string' || p === '') return; // 非字符串/空串跳过
    try {
      rules.push({ name: `custom-${i + 1}`, re: new RegExp(p, 'g') }); // 强制 g：全文替换
    } catch { /* 坏正则跳过 */ }
  });
  const hits = [];
  let out = text;
  for (const { name, re } of rules) {
    // g 标志下 match/replace 各自会重置 lastIndex，同一正则可先计数再替换
    const count = (out.match(re) || []).length;
    if (count > 0) {
      out = out.replace(re, REDACTED);
      hits.push({ rule: name, count });
    }
  }
  return { text: out, hits };
}
