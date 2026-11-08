// web 响应助手：统一错误 JSON 形态 {error:{code,message}}
// 背景：h3 v2 默认错误体为 {status,statusText,message}，不满足技术设计契约（§8），
// 因此全部端点错误统一经本模块构造 Response；成功响应由 h3 自动序列化对象。

/** 构造统一错误响应：{ error: { code, message } } + 对应状态码 */
export function jsonError(status, code, message) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** 从异常提取状态码：带 statusCode 属性（400-599）用之，否则 500 */
export function errorStatusCode(err) {
  const n = Number(err?.statusCode);
  return Number.isInteger(n) && n >= 400 && n <= 599 ? n : 500;
}

/** 状态码 → 稳定错误码（前端按 code 区分展示） */
export function errorCode(status) {
  if (status === 404) return 'not_found';
  if (status === 400) return 'bad_request';
  if (status === 503) return 'unavailable';
  return 'internal';
}

/** 便捷构造带 statusCode 的业务错误（api 纯函数里 throw 用） */
export function httpError(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}
