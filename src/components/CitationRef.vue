<script setup lang="ts">
/**
 * CitationRef —— 可点击的引用编号 [n]
 * 点击 → 设置 store.activeRef → RetrievalPanel 对应卡片高亮滚动（引用溯源联动）
 */
import { useChatStore } from '@/stores/chat'

const props = defineProps<{ n: number }>()

const store = useChatStore()

function go() {
  store.activeRef = props.n
}
</script>

<template>
  <span class="citation" :title="`查看来源 #${props.n}`" @click="go">[{{ props.n }}]</span>
</template>

<style scoped>
.citation {
  color: var(--el-color-primary);
  cursor: pointer;
  font-weight: 600;
  margin: 0 1px;
}

.citation:hover {
  text-decoration: underline;
}
</style>
