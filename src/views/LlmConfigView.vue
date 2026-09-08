<script setup lang="ts">
/**
 * LlmConfigView —— 模型 / 服务配置容器
 * - 三个 Tab 各自管理一类服务的供应商：
 *   · Chat      —— 对话模型（/api/llm-providers）
 *   · Embedding —— 向量嵌入（/api/embedding-providers）
 *   · Rerank    —— 重排模型（/api/rerank-providers）
 * - 各 Tab 写路径后由后端 Invalidate 缓存 → 免重启热生效
 * - Tab 仅 UI 切换；URL 路由不带 tab 参数（简单优先）
 */
import { ref } from 'vue'
import LlmProvidersTab from '@/components/LlmProvidersTab.vue'
import EmbeddingProvidersTab from '@/components/EmbeddingProvidersTab.vue'
import RerankProvidersTab from '@/components/RerankProvidersTab.vue'

const activeTab = ref<'chat' | 'embedding' | 'rerank'>('chat')
</script>

<template>
  <div class="llm-config">
    <div class="page-header">
      <h2>⚙ 模型 / 服务配置</h2>
      <p class="hint">管理三类服务的供应商：对话（chat）、向量嵌入（embedding）、重排（rerank）。主用切换后立即热生效，无需重启</p>
    </div>

    <el-alert type="info" :closable="false" class="guide-alert">
      <template #title>
        <strong>💡 说明</strong>
      </template>
      <ul class="guide-list">
        <li><strong>Chat</strong>：智能问答（Agent 路由）用的对话模型；切换主用后下次提问立即生效。</li>
        <li><strong>Embedding</strong>：知识录入、检索、反馈建议的向量化；切换后影响 <code>/api/query</code> 召回与所有新增向量化任务。</li>
        <li><strong>Rerank</strong>：对融合后的候选做精排；切换后下次重排立即生效。</li>
        <li>每类服务仅允许一条主用；无主用时回落 <code>appsettings</code> 默认配置。</li>
        <li>本地模型（如 vLLM / Ollama）常免 API Key —— 留空即可；云端模型需填真实 Key。</li>
        <li>新增前可先用「测试」确认 Base URL 与模型名可达；<code>embedding</code> 还会校验返回向量维度。</li>
      </ul>
    </el-alert>

    <div class="section">
      <el-tabs v-model="activeTab" class="provider-tabs">
        <el-tab-pane label="Chat 对话模型" name="chat">
          <LlmProvidersTab />
        </el-tab-pane>
        <el-tab-pane label="Embedding 向量嵌入" name="embedding">
          <EmbeddingProvidersTab />
        </el-tab-pane>
        <el-tab-pane label="Rerank 重排模型" name="rerank">
          <RerankProvidersTab />
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<style scoped>
.llm-config {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.page-header h2 {
  margin: 0 0 4px;
}
.page-header .hint {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.guide-alert {
  line-height: 1.7;
}

.guide-list {
  margin: 4px 0 0;
  padding-left: 18px;
}

.section {
  background: #fff;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 12px 14px;
}

.provider-tabs :deep(.el-tabs__content) {
  padding-top: 8px;
}
</style>
