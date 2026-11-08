<script setup>
// 命令执行（FR-13）：白名单命令在网页上直接执行，输出回显
// 安全设计：confirm 类命令执行前弹二次确认；参数空格分词（不支持含空格参数）；服务端另有互斥/超时/输出截断
import { reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { execCommand, CONFIRM_CMDS } from '../composables/useApi';
import { formatDate } from '../composables/useApi';

// 安全命令（直接执行）：镜像自 cli/src/web/exec.js EXEC_WHITELIST safe 分级
const SAFE_CMDS = ['check', 'status', 'agents', 'resources', 'recall', 'help'];

const form = reactive({ cmd: 'check', argsText: '' });
const running = ref(false);
const result = ref(null);   // 最近一次执行结果
const history = ref([]);    // 本次会话内的执行历史（内存）

function parseArgs(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean);
}

async function run() {
  const args = parseArgs(form.argsText);
  const doRun = async () => {
    running.value = true;
    try {
      const r = await execCommand(form.cmd, args);
      result.value = r;
      history.value.unshift({ cmd: form.cmd, args, at: new Date().toISOString(), exitCode: r.exitCode });
      if (history.value.length > 8) history.value.pop();
      if (r.exitCode === 0) ElMessage.success(`执行完成（${(r.durationMs / 1000).toFixed(1)}s）`);
      else ElMessage.warning(`命令退出码 ${r.exitCode}，详见输出`);
    } catch (e) {
      ElMessage.error(e instanceof Error ? e.message : String(e));
    } finally {
      running.value = false;
    }
  };

  if (CONFIRM_CMDS.includes(form.cmd)) {
    try {
      await ElMessageBox.confirm(
        `「${form.cmd}」会产生实际改动（写托管块/裁决/调用 LLM 等），确认执行？`,
        '需要确认的命令',
        { confirmButtonText: '执行', cancelButtonText: '取消', type: 'warning' },
      );
    } catch {
      return; // 用户取消
    }
  }
  await doRun();
}

function useHistory(item) {
  form.cmd = item.cmd;
  form.argsText = item.args.join(' ');
}
</script>

<template>
  <el-card shadow="never" class="box">
    <div class="bar">
      <el-select v-model="form.cmd" style="width: 200px">
        <el-option-group label="安全命令（直接执行）">
          <el-option v-for="c in SAFE_CMDS" :key="c" :label="c" :value="c" />
        </el-option-group>
        <el-option-group label="会产生改动（需确认）">
          <el-option v-for="c in CONFIRM_CMDS" :key="c" :label="c" :value="c" />
        </el-option-group>
      </el-select>
      <el-input
        v-model="form.argsText"
        placeholder="参数（空格分隔，如：--accept <草稿id> 或 软链接 --json）"
        style="flex: 1"
        @keyup.enter="run"
      />
      <el-button type="primary" :loading="running" @click="run">执行</el-button>
    </div>
    <div class="hint">
      命令在本机以 evokit CLI 身份执行（白名单 + 互斥 + 5 分钟超时）；<code>web</code> / <code>hook</code> 永久禁止。learn / inventory / forge 会产生真实 LLM 调用费用。
    </div>
  </el-card>

  <el-card v-if="history.length" shadow="never" class="block">
    <div class="history">
      <span class="muted">最近执行：</span>
      <el-tag
        v-for="(item, i) in history"
        :key="i"
        :type="item.exitCode === 0 ? 'success' : 'danger'"
        effect="plain"
        class="hist-tag"
        style="cursor: pointer"
        @click="useHistory(item)"
      >
        {{ item.cmd }} {{ item.args.join(' ') }} · {{ formatDate(item.at).slice(11) }}
      </el-tag>
    </div>
  </el-card>

  <el-card v-if="result" shadow="never" class="block">
    <template #header>
      <div class="result-head">
        <span>$ evokit {{ result.cmd }} {{ result.args.join(' ') }}</span>
        <span class="result-meta">
          <el-tag :type="result.exitCode === 0 ? 'success' : 'danger'" size="small">exit {{ result.exitCode }}</el-tag>
          <el-tag v-if="result.timedOut" type="danger" size="small">超时终止</el-tag>
          <span class="muted">{{ (result.durationMs / 1000).toFixed(1) }}s</span>
        </span>
      </div>
    </template>
    <pre class="terminal">{{ result.stdout || '（无 stdout）' }}</pre>
    <pre v-if="result.stderr" class="terminal stderr">{{ result.stderr }}</pre>
    <div v-if="result.truncated" class="muted">⚠ 输出过长已截断（512KB 上限）</div>
  </el-card>
</template>

<style scoped>
.box { margin-bottom: 16px; }
.bar { display: flex; gap: 8px; }
.hint { margin-top: 8px; font-size: 12px; color: var(--el-text-color-secondary); }
.hint code { background: var(--el-fill-color); padding: 1px 5px; border-radius: 4px; }
.block { margin-bottom: 16px; }
.history { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.hist-tag { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.result-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.result-meta { display: flex; align-items: center; gap: 8px; }
.terminal {
  background: #1e1e1e;
  color: #d4d4d4;
  border-radius: 6px;
  padding: 12px;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 420px;
  overflow: auto;
  margin: 0;
}
.terminal.stderr { margin-top: 8px; color: #f48771; }
.muted { color: var(--el-text-color-secondary); font-size: 12px; }
</style>
