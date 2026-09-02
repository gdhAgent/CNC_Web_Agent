<script setup lang="ts">
/**
 * 主界面：左右分栏 + 流式渲染 * 顶部 QueryBar（输入 + 品牌筛选 + 示例）→ 左栏 RetrievalPanel / 右栏 AnalysisPanel
 * 引用 [n] 点击 → 左栏卡片高亮滚动（activeRef 联动）
 */
import { useChatStore } from '@/stores/chat'
import AnalysisPanel from '@/components/AnalysisPanel.vue'
import QueryBar from '@/components/QueryBar.vue'
import RetrievalPanel from '@/components/RetrievalPanel.vue'

const store = useChatStore()
</script>

<template>
  <div class="chat">
    <QueryBar />

    <!-- 拒答提示 -->
    <el-alert
      v-if="store.refused"
      type="warning"
      :closable="false"
      class="refused-alert"
      show-icon
    >
      <template #title>
        知识库中未找到相关内容（{{ store.refusedReason }}）。
        <RouterLink to="/suggestions">去「待补充知识」查看</RouterLink>
      </template>
    </el-alert>

    <!-- 左右分栏 -->
    <div class="panels">
      <RetrievalPanel class="panel" />
      <AnalysisPanel class="panel" />
    </div>
  </div>
</template>

<style scoped>
.chat {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 12px;
}

.refused-alert {
  flex-shrink: 0;
}

.panels {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 12px;
  min-height: 0;
}

.panel {
  min-width: 0;
  min-height: 0;
}
</style>
