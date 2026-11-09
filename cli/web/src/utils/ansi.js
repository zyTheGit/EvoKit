// ANSI SGR → HTML 转换（终端风输出着色）
// 背景：CLI 子进程输出可能残留 ANSI 转义（服务端已注入 NO_COLOR/FORCE_COLOR=0 减量，
// 但部分第三方 CLI 仍会输出）。本转换器把常用 SGR 子集渲染为带色 span，其余转义序列剥离。
// 安全：先 HTML 转义原文，再注入受控 span —— 无 XSS 面。

// SGR 前景色码 → 终端配色（深底 #1e1e1e 上可读）
const FG = {
  30: '#6a9955', 31: '#f48771', 32: '#73c991', 33: '#cca700',
  34: '#569cd6', 35: '#c586c0', 36: '#4ec9b0', 37: '#d4d4d4',
  90: '#8c8c8c', 91: '#f48771', 92: '#73c991', 93: '#cca700',
  94: '#569cd6', 95: '#c586c0', 96: '#4ec9b0', 97: '#ffffff',
};

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * ANSI 文本 → HTML（SGR 着色；非 SGR 转义序列（光标移动等）直接剥离）。
 * @param {string} text
 * @returns {string} HTML 片段（调用方用 v-html 渲染）
 */
export function ansiToHtml(text) {
  if (!text) return '';
  let out = '';
  let last = 0;
  let color = null;
  let bold = false;
  let dim = false;
  let open = false;

  const styleAttr = () => {
    const parts = [];
    if (color) parts.push(`color:${color}`);
    if (bold) parts.push('font-weight:700');
    if (dim) parts.push('opacity:.65');
    return parts.join(';');
  };
  const close = () => {
    if (open) { out += '</span>'; open = false; }
  };
  const reopen = () => {
    close();
    const attr = styleAttr();
    if (attr) { out += `<span style="${attr}">`; open = true; }
  };

  // SGR 序列：ESC[ ... m；其余 CSI 序列与单字符转义一并剥离
  const re = /\x1b\[([0-9;]*)m|\x1b\[[0-9;?]*[A-LN-Za-ln]|\x1b\][^\x07]*(?:\x07|\x1b\\)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    out += esc(text.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1] === undefined) continue; // 非 SGR 转义：已剥离
    const codes = m[1].split(';').filter((s) => s !== '').map(Number);
    if (codes.length === 0) codes.push(0);
    let dirty = false;
    for (const c of codes) {
      if (c === 0) { color = null; bold = false; dim = false; dirty = true; }
      else if (c === 1) { bold = true; dirty = true; }
      else if (c === 2 || c === 3) { dim = true; dirty = true; }
      else if (c === 22) { bold = false; dim = false; dirty = true; }
      else if (c === 39) { color = null; dirty = true; }
      else if (FG[c]) { color = FG[c]; dirty = true; }
      // 其余 SGR（背景色/下划线等）当前终端不使用，忽略
    }
    if (dirty) reopen();
  }
  out += esc(text.slice(last));
  close();
  return out;
}
