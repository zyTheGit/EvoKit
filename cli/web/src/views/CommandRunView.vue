<script setup>
// 命令执行（FR-13）：白名单命令在网页上直接执行
// ① 执行器：实时流式输出 + ANSI 着色 + 自动滚动；② 命令文档：每条命令的用途/语法/参数/示例/注意事项
// 安全设计：confirm 类命令执行前弹二次确认；参数空格分词（不支持含空格参数）；服务端另有互斥/超时
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useList, execCommand, CONFIRM_CMDS, formatDate } from '../composables/useApi';
import { ansiToHtml } from '../utils/ansi';
import CommandDocCard from '../components/CommandDocCard.vue';

// 安全命令（直接执行）：镜像自 cli/src/web/exec.js EXEC_WHITELIST safe 分级
const SAFE_CMDS = ['check', 'status', 'agents', 'resources', 'recall', 'help'];
const ALL_CMDS = [...SAFE_CMDS, ...CONFIRM_CMDS];

const activeTab = ref('run');
const form = reactive({ cmd: 'check', argsText: '' });
const running = ref(false);
const liveOutput = ref('');       // 执行中的实时输出（onChunk 逐块累积）
const result = ref(null);         // 最近一次执行结果（含剥离元数据后的干净 output）
const history = ref([]);          // 本次会话内的执行历史（内存）
const terminalRef = ref(null);

// ── 命令文档：一次拉取全部（数据源 cli/src/web/command-docs.js）──
const { data: docsData } = useList('/api/exec/docs');
const docsById = computed(() => docsData.value?.docs ?? {});
const currentDoc = computed(() => docsById.value[form.cmd] ?? null);

// ── 终端：执行中显示实时流，完成后显示干净结果（剥离 ---evokit-exit--- 元数据行）──
const displayText = computed(() => (result.value ? result.value.output : liveOutput.value));
const rendered = computed(() => ansiToHtml(displayText.value));

// 输出增长时自动滚动到底部
watch(rendered, () => {
  nextTick(() => {
    const el = terminalRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
});

function parseArgs(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean);
}

async function run() {
  const args = parseArgs(form.argsText);
  const doRun = async () => {
    running.value = true;
    liveOutput.value = '';
    result.value = null;
    try {
      const r = await execCommand(form.cmd, args, {
        onChunk: (text) => { liveOutput.value += text; }, // 实时进度：watch(rendered) 负责滚动
      });
      result.value = r;
      history.value.unshift({ cmd: form.cmd, args, at: new Date().toISOString(), exitCode: r.exitCode });
      if (history.value.length > 8) history.value.pop();
      if (r.timedOut) ElMessage.error('命令超时被终止（5 分钟上限）');
      else if (r.exitCode === 0) ElMessage.success(`执行完成（${(r.durationMs / 1000).toFixed(1)}s）`);
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
  activeTab.value = 'run';
}

function fillArgs(argsText) {
  form.argsText = argsText;
}
</script>

<template>
  <el-tabs v-model="activeTab">
    <!-- ── Tab 1：执行器 ── -->
    <el-tab-pane label="执行器" name="run">
      <el-card shadow="never" class="box">
        <div class="bar">
          <el-select v-model="form.cmd" style="width: 200px" :disabled="running" filterable>
            <el-option-group label="安全命令（直接执行）">
              <el-option v-for="c in SAFE_CMDS" :key="c" :label="c" :value="c" />
            </el-option-group>
            <el-option-group label="会产生改动（需确认）">
              <el-option v-for="c in CONFIRM_CMDS" :key="c" :label="c" :value="c" />
            </el-option-group>
          </el-select>
          <el-input
            v-model="form.argsText"
            placeholder="参数（空格分隔，可点下方示例直接回填）"
            style="flex: 1"
            :disabled="running"
            @keyup.enter="run"
          />
          <el-button type="primary" :loading="running" @click="run">{{ running ? '执行中…' : '执行' }}</el-button>
        </div>
        <div class="hint">
          命令在本机以 evokit CLI 身份执行（白名单 + 互斥 + 5 分钟超时）；<code>web</code> / <code>hook</code> 永久禁止。learn / inventory / forge 会产生真实 LLM 调用费用。参数含义见下方用法文档。
        </div>
      </el-card>

      <!-- 选中命令的用法文档（选即显） -->
      <el-card v-if="currentDoc" shadow="never" class="block doc-panel">
        <template #header>用法文档：{{ form.cmd }}</template>
        <CommandDocCard :cmd="form.cmd" :doc="currentDoc" @fill="fillArgs" />
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

      <!-- 终端：执行中实时显示流式输出，完成后显示干净结果 + 元数据 -->
      <el-card shadow="never" class="block">
        <template #header>
          <div class="result-head">
            <span class="cmdline">$ evokit {{ form.cmd }} {{ form.argsText }}</span>
            <span class="result-meta">
              <el-tag v-if="result" :type="result.exitCode === 0 ? 'success' : 'danger'" size="small">exit {{ result.exitCode }}</el-tag>
              <el-tag v-if="result?.timedOut" type="danger" size="small">超时终止</el-tag>
              <span v-if="result" class="muted">{{ (result.durationMs / 1000).toFixed(1) }}s</span>
              <span v-else-if="running" class="muted">运行中…（输出实时滚动）</span>
            </span>
          </div>
        </template>
        <pre ref="terminalRef" class="terminal" v-html="rendered || '（等待输出…）'" />
      </el-card>
    </el-tab-pane>

    <!-- ── Tab 2：全部命令文档（详细执行文档）── -->
    <el-tab-pane label="全部命令文档" name="docs">
      <el-alert
        type="info"
        :closable="false"
        class="doc-tip"
        title="全部白名单命令的详细执行文档：用途 / 语法 / 逐个参数说明 / 示例 / 注意事项。文档与 CLI help、cli/README 同源维护；示例可在「执行器」里点击回填执行。"
      />
      <el-skeleton v-if="!docsData" :rows="6" animated />
      <el-collapse v-else class="doc-collapse">
        <el-collapse-item v-for="(doc, cmd) in docsById" :key="cmd" :name="cmd">
          <template #title>
            <span class="collapse-title">
              <code class="collapse-cmd">{{ cmd }}</code>
              <el-tag :type="doc.tier === 'safe' ? 'success' : 'warning'" size="small">{{ doc.tier === 'safe' ? '安全' : '需确认' }}</el-tag>
              <span class="collapse-summary">{{ doc.summary }}</span>
            </span>
          </template>
          <CommandDocCard :cmd="cmd" :doc="doc" @fill="(a) => { form.cmd = cmd; form.argsText = a; activeTab = 'run'; }" />
        </el-collapse-item>
      </el-collapse>
    </el-tab-pane>
  </el-tabs>
</template>

<style scoped>
.box { margin-bottom: 16px; }
.bar { display: flex; gap: 8px; }
.hint { margin-top: 8px; font-size: 12px; color: var(--el-text-color-secondary); }
.hint code { background: var(--el-fill-color); padding: 1px 5px; border-radius: 4px; }
.block { margin-bottom: 16px; }
.doc-panel { margin-bottom: 16px; }
.history { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.hist-tag { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.result-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.cmdline { font-family: Consolas, 'Courier New', monospace; font-size: 12.5px; }
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
  max-height: 480px;
  overflow: auto;
  margin: 0;
}
.terminal :deep(.ansi-bold) { font-weight: 700; }
.doc-tip { margin-bottom: 16px; }
.doc-collapse :deep(.el-collapse-item__header) { height: auto; padding: 8px 0; }
.collapse-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.collapse-cmd { background: var(--el-fill-color); padding: 1px 6px; border-radius: 4px; font-size: 12.5px; }
.collapse-summary { font-size: 13px; color: var(--el-text-color-secondary); }
.muted { color: var(--el-text-color-secondary); font-size: 12px; }
</style>
