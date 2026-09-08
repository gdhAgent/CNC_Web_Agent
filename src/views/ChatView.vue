<script setup lang="ts">
/**
 * 主界面：左右分栏 + 流式渲染 * 顶部 QueryBar（输入 + 品牌筛选 + 示例）→ 左栏 RetrievalPanel / 右栏 AnalysisPanel
 * 引用 [n] 点击 → 左栏卡片高亮滚动（activeRef 联动）
 */
import { onMounted, ref } from 'vue'
import { Cpu } from '@element-plus/icons-vue'
import { useChatStore } from '@/stores/chat'
import http from '@/api/http'
import AnalysisPanel from '@/components/AnalysisPanel.vue'
import QueryBar from '@/components/QueryBar.vue'
import RetrievalPanel from '@/components/RetrievalPanel.vue'

const store = useChatStore()

// 当前 chat 主用模型（名称 + 模型 id），如「本地千问 qwen3.5-397b」
const currentModel = ref<{ name: string; model: string } | null>(null)

async function loadModel() {
  try {
    const resp = await http.get<{ name: string; model: string }>('/cnc/model')
    currentModel.value = resp.data
  } catch {
    currentModel.value = null   // 未登录/接口失败 → 不显示，不影响提问
  }
}

onMounted(loadModel)
</script>

<template>
  <div class="chat">
    <div class="model-bar">
      <el-tag v-if="currentModel" size="small" type="info" effect="plain" :icon="Cpu">
        回答模型：{{ currentModel.name }} · {{ currentModel.model }}
      </el-tag>
    </div>

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

.model-bar {
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
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
