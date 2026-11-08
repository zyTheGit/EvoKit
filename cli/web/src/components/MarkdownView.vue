<script setup>
// Markdown 渲染组件（技术设计 §10）：markdown-it 安全默认（html:false），渲染异常降级原文
import { computed } from 'vue';
import MarkdownIt from 'markdown-it';

const props = defineProps({
  source: { type: String, default: '' },
});

const md = new MarkdownIt({ html: false, linkify: true });

const html = computed(() => {
  try {
    return md.render(props.source ?? '');
  } catch {
    return null; // 渲染失败 → 模板降级为 <pre> 原文，不丢内容
  }
});
</script>

<template>
  <div v-if="html !== null" class="markdown-body" v-html="html" />
  <pre v-else class="markdown-fallback">{{ source }}</pre>
</template>

<style scoped>
.markdown-body { line-height: 1.75; word-break: break-word; }
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) { margin: 0.7em 0 0.4em; }
.markdown-body :deep(h1) { font-size: 1.4em; }
.markdown-body :deep(h2) { font-size: 1.25em; }
.markdown-body :deep(h3) { font-size: 1.1em; }
.markdown-body :deep(code) {
  background: var(--el-fill-color);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 0.92em;
}
.markdown-body :deep(pre) {
  background: var(--el-fill-color);
  border-radius: 6px;
  padding: 10px 12px;
  overflow: auto;
}
.markdown-body :deep(pre code) { padding: 0; background: none; }
.markdown-body :deep(blockquote) {
  margin: 0.6em 0;
  padding: 4px 12px;
  border-left: 3px solid var(--el-border-color);
  color: var(--el-text-color-secondary);
}
.markdown-body :deep(a) { color: var(--el-color-primary); }
.markdown-fallback {
  background: var(--el-fill-color);
  border-radius: 6px;
  padding: 10px 12px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
