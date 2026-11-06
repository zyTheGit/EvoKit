// 统一调试日志：默认关闭，所有输出仅写 stderr，不记录敏感配置或完整 prompt。

let enabled = false;
let source = 'default';
let priority = 0; // default=0, settings=1, env=2, cli=3
let deferredStart = null;

/** 解析环境变量中的布尔值；未设置或无法识别时返回 undefined。 */
function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true') return true;
  if (normalized === '0' || normalized === 'false') return false;
  return undefined;
}

/** 在命令分派前初始化 CLI/环境变量优先级。 */
export function initDebug(args = [], env = process.env) {
  if (args.includes('--debug')) {
    enabled = true;
    source = 'cli';
    priority = 3;
    return;
  }
  const envValue = parseBoolean(env.EVOKIT_DEBUG);
  if (envValue !== undefined) {
    enabled = envValue;
    source = 'env';
    priority = 2;
  }
}

/** 应用 settings.json 的 debug；CLI 和环境变量优先。 */
export function applyDebugConfig(value) {
  if (priority > 1 || value === undefined) return;
  const configured = typeof value === 'object' && value !== null
    ? value.enabled
    : value;
  if (typeof configured !== 'boolean') return;
  enabled = configured;
  source = 'settings';
  priority = 1;
  if (enabled && deferredStart) {
    const start = deferredStart;
    deferredStart = null;
    writeLog(start.scope, start.message, { ...start.fields, debug: true, source });
  }
}

export function isDebugEnabled() {
  return enabled;
}

export function getDebugSource() {
  return source;
}

/**
 * 输出一条统一前缀的调试日志。调用方只传安全元数据，不传完整配置/密钥。
 * @param {string} scope 模块或命令名
 * @param {string} message 事件说明
 * @param {object} fields 可序列化的安全元数据
 */
export function debug(scope, message, fields = {}) {
  if (!enabled) {
    // settings.json 尚未读取时暂存入口 start；若最终未开启则永不输出。
    if (scope === 'cli' && message === 'start') deferredStart = { scope, message, fields };
    return;
  }
  writeLog(scope, message, fields);
}

function writeLog(scope, message, fields) {
  const suffix = Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : '';
  process.stderr.write(`[evokit:debug] [${scope}] ${message}${suffix}\n`);
}

/** 返回文本的字符数和 UTF-8 字节数，避免记录正文。 */
export function textMeta(value) {
  const text = value || '';
  return { chars: text.length, bytes: Buffer.byteLength(text, 'utf8') };
}
