<script setup>
// 设置编辑（FR-14）：~/.evokit/settings.json 全文编辑器
// 安全链：客户端 JSON 预检 → 服务端结构校验（400 带全部错误）→ 自动备份 → 原子替换
// 纪律：仅全局 settings.json；保存后提示运行 sync/check 使改动生效
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useList, apiSend, formatDate } from '../composables/useApi';

const { data, loading, error, reload } = useList('/api/settings');
const editorText = ref('');
const saving = ref(false);
const lastResult = ref(null); // { backup, bytes } 或 { error }

// 加载完成后初始化编辑器内容
watch(data, (d) => { if (d && editorText.value === '') editorText.value = d.raw; });

const dirty = computed(() => data.value !== null && editorText.value !== data.value.raw);

function formatJson() {
  try {
    editorText.value = JSON.stringify(JSON.parse(editorText.value), null, 2) + '\n';
    ElMessage.success('已格式化');
  } catch (e) {
    ElMessage.error(`JSON 语法错误：${e instanceof Error ? e.message : String(e)}`);
  }
}

async function save() {
  // 客户端预检：语法错误直接拦下（服务端还有结构校验兜底）
  try {
    JSON.parse(editorText.value);
  } catch (e) {
    ElMessage.error(`JSON 语法错误：${e instanceof Error ? e.message : String(e)}（未保存）`);
    return;
  }
  try {
    await ElMessageBox.confirm(
      '修改 settings.json 会影响同步目标与执行者行为；保存前会自动备份当前文件。确认保存？',
      '保存配置',
      { confirmButtonText: '保存', cancelButtonText: '取消', type: 'warning' },
    );
  } catch {
    return;
  }
  saving.value = true;
  lastResult.value = null;
  try {
    const r = await apiSend('PUT', '/api/settings', { raw: editorText.value });
    lastResult.value = r;
    ElMessage.success(`已保存（${r.bytes} 字节${r.backup ? '，已备份原文件' : ''}）`);
    await reload();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    lastResult.value = { error: msg };
    ElMessage.error(msg);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <el-card v-loading="loading" shadow="never" class="box">
    <template #header>
      <div class="head">
        <span>settings.json 编辑器</span>
        <span class="meta">
          <code>{{ data?.file ?? '' }}</code>
          <span v-if="data"> · 更新于 {{ formatDate(data.mtime) }}</span>
          <el-tag v-if="dirty" type="warning" size="small">未保存改动</el-tag>
        </span>
      </div>
    </template>

    <el-alert
      type="warning"
      :closable="false"
      class="tip"
      title="仅编辑全局配置（项目级 settings.json 请走 CLI）。保存时服务端会做结构校验并自动备份；保存后建议到「命令执行」页运行 sync / check 使改动生效。"
    />

    <el-input
      v-model="editorText"
      type="textarea"
      :rows="20"
      class="editor"
      spellcheck="false"
      placeholder="加载中…"
    />

    <div class="bar">
      <el-button :disabled="!editorText" @click="formatJson">格式化 JSON</el-button>
      <el-button type="primary" :loading="saving" :disabled="!dirty" @click="save">{{ saving ? '保存中…' : '保存' }}</el-button>
      <span class="count">{{ editorText.length }} 字符</span>
    </div>

    <el-alert
      v-if="lastResult?.error"
      type="error"
      :closable="true"
      class="block"
      :title="'保存被拒绝'"
      :description="lastResult.error"
      show-icon
    />
    <el-alert
      v-else-if="lastResult?.saved"
      type="success"
      :closable="true"
      class="block"
      :title="`已写入 ${lastResult.bytes} 字节`"
      :description="lastResult.backup ? `原文件已备份：${lastResult.backup}。建议运行 evokit sync / check 验证同步。` : '建议运行 evokit sync / check 验证同步。'"
      show-icon
    />
  </el-card>
</template>

<style scoped>
.box { margin-bottom: 16px; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.meta { font-size: 12px; color: var(--el-text-color-secondary); display: inline-flex; gap: 6px; align-items: center; }
.meta code { background: var(--el-fill-color); padding: 1px 6px; border-radius: 4px; }
.tip { margin-bottom: 12px; }
.editor :deep(textarea) { font-family: Consolas, 'Courier New', monospace; font-size: 12.5px; line-height: 1.6; }
.bar { margin-top: 10px; display: flex; gap: 8px; align-items: center; }
.count { font-size: 12px; color: var(--el-text-color-secondary); }
.block { margin-top: 12px; }
</style>
