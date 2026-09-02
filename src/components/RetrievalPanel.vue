<script setup lang="ts">
/**
 * RetrievalPanel —— 左栏：召回 TopK 卡片
 * - 卡片显示 ref / score / 通道标签 / 报警码 / 来源 / 原文
 * - activeRef（引用 [n] 点击）→ 高亮对应卡片并滚动到可视区
 */
import { nextTick, ref, watch } from 'vue'

import { useChatStore } from '@/stores/chat'
import type { TopKItem } from '@/types'

const store = useChatStore()

const cardEls = ref<Record<number, HTMLElement | null>>({})

const channelLabel: Record<string, string> = {
  exact: '精确',
  vector: '向量',
  fulltext: '全文',
  rrf: '融合',
  rerank: '重排',
}

function setCardRef(ref: number, el: unknown) {
  cardEls.value[ref] = el as HTMLElement | null
}

watch(
  () => store.activeRef,
  async (n) => {
    if (n == null) return
    await nextTick()
    const el = cardEls.value[n]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  },
)

function cardKey(item: TopKItem) {
  return `${item.type}-${item.id}`
}
</script>

<template>
  <section class="panel-left">
    <div class="panel-title">📚 知识库召回 Top-{{ store.topk.length || 5 }}</div>

    <el-scrollbar class="scroll">
      <div v-if="!store.topk.length && !store.streaming" class="empty">
        提交查询后，这里会展示可溯源的原文片段
      </div>

      <div
        v-for="item in store.topk"
        :key="cardKey(item)"
        :ref="(el) => setCardRef(item.ref, el)"
        :class="['hit-card', { active: store.activeRef === item.ref }]"
      >
        <div class="hit-head">
          <span class="hit-ref">[{{ item.ref }}]</span>
          <el-tag size="small" type="info" class="hit-score">
            {{ item.score.toFixed(2) }}
          </el-tag>
          <el-tag
            v-for="ch in item.channel"
            :key="ch"
            size="small"
            :type="ch === 'exact' ? 'success' : 'primary'"
          >
            {{ channelLabel[ch] ?? ch }}
          </el-tag>
          <el-tag v-if="item.type === 'alarm' && item.code_norm" size="small" type="warning">
            {{ item.code_norm }}
          </el-tag>
        </div>
        <div class="hit-title">{{ item.title }}</div>
        <div class="hit-source">📄 {{ item.source }}</div>
        <div class="hit-content">{{ item.content }}</div>
      </div>

      <div v-if="store.suggestHits.length" class="suggest">
        <div class="suggest-title">您是否想问：</div>
        <el-tag
          v-for="s in store.suggestHits"
          :key="`${s.type}-${s.id}`"
          size="small"
          class="suggest-tag"
        >
          {{ s.code_norm || s.title }}
        </el-tag>
      </div>
    </el-scrollbar>
  </section>
</template>

<style scoped>
.panel-left {
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.panel-title {
  padding: 10px 14px;
  font-weight: 600;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.scroll {
  flex: 1;
}

.empty {
  color: var(--el-text-color-secondary);
  padding: 24px 16px;
  text-align: center;
  font-size: 13px;
}

.hit-card {
  margin: 8px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}

.hit-card.active {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-7);
  background: var(--el-color-primary-light-9);
}

.hit-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.hit-ref {
  font-weight: 700;
  color: var(--el-color-primary);
}

.hit-title {
  font-weight: 600;
  margin-bottom: 2px;
}

.hit-source {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-bottom: 4px;
}

.hit-content {
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.5;
  max-height: 90px;
  overflow: hidden;
}

.suggest {
  margin: 8px;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
}

.suggest-title {
  font-size: 13px;
  margin-bottom: 6px;
}

.suggest-tag {
  margin-right: 6px;
  margin-bottom: 4px;
}
</style>
