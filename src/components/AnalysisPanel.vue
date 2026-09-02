<script setup lang="ts">
/**
 * AnalysisPanel —— 右栏：AI 结构化分析 / 流式渲染
 * - 引用 [n] 用 CitationRef（点击 → 左栏高亮）
 * - 组装 ToolTrace + FeedbackBar
 */
import { computed } from 'vue'
import { ElMessage } from 'element-plus'

import { useChatStore } from '@/stores/chat'
import CitationRef from '@/components/CitationRef.vue'
import FeedbackBar from '@/components/FeedbackBar.vue'
import ToolTrace from '@/components/ToolTrace.vue'

const store = useChatStore()

const hasAnalysis = computed(() => store.analysis !== null)

async function copyAnswer() {
  const text = store.rawAnswer || store.analysis?.summary || ''
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}
</script>

<template>
  <section class="panel-right">
    <div class="panel-title">🤖 AI 智能分析</div>

    <el-scrollbar class="scroll">
      <!-- 结构化分析（done 后） -->
      <template v-if="hasAnalysis">
        <div class="analysis-summary">{{ store.analysis!.summary }}</div>

        <div v-if="store.analysis!.possible_causes.length" class="section">
          <div class="section-title">🔍 可能原因</div>
          <ul class="cause-list">
            <li v-for="(c, i) in store.analysis!.possible_causes" :key="i">
              <span :class="['conf', `conf-${c.confidence}`]">{{ c.confidence }}</span>
              <span class="cause-text">{{ c.cause }}</span>
              <span class="refs">
                <CitationRef v-for="n in c.refs" :key="n" :n="n" />
              </span>
            </li>
          </ul>
        </div>

        <div v-if="store.analysis!.troubleshooting_steps.length" class="section">
          <div class="section-title">🛠 排查步骤</div>
          <ol class="step-list">
            <li v-for="s in store.analysis!.troubleshooting_steps" :key="s.step">
              <span class="step-text">{{ s.action }}</span>
              <span class="refs">
                <CitationRef v-for="n in s.refs" :key="n" :n="n" />
              </span>
            </li>
          </ol>
        </div>

        <div v-if="store.analysis!.required_tools.length" class="section">
          <div class="section-title">🧰 所需工具</div>
          <el-tag v-for="t in store.analysis!.required_tools" :key="t" size="small" class="tool-tag">
            {{ t }}
          </el-tag>
        </div>

        <el-alert
          v-if="store.analysis!.safety_note"
          type="error"
          :closable="false"
          class="safety-note"
          show-icon
          :title="store.analysis!.safety_note"
        />
        <el-alert
          v-if="store.analysis!.need_expert"
          type="info"
          :closable="false"
          show-icon
          title="资料有限，建议联系设备工程师确认"
        />
      </template>

      <!-- 流式渲染（done 前：原始 JSON 逐字 + 光标） -->
      <div v-else-if="store.rawAnswer || store.streaming" class="stream-text">
        <pre>{{ store.rawAnswer }}</pre>
        <span v-if="store.streaming" class="stream-cursor">▍</span>
        <div v-if="!store.rawAnswer && store.streaming" class="stream-wait">AI 正在分析…</div>
      </div>

      <div v-else class="stream-wait empty">
        提交查询后，这里会显示 AI 结构化分析
      </div>

      <div v-if="store.error" class="error-text">⚠️ {{ store.error }}</div>

      <ToolTrace />

      <div v-if="store.traceId" class="footer-actions">
        <el-button size="small" text type="primary" @click="copyAnswer">复制</el-button>
        <RouterLink :to="`/trace/${store.traceId}`">
          <el-button size="small" text type="primary">🔍 查看检索过程</el-button>
        </RouterLink>
      </div>
    </el-scrollbar>

    <!-- 反馈栏固定在底部 -->
    <FeedbackBar />
  </section>
</template>

<style scoped>
.panel-right {
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

.analysis-summary {
  padding: 14px 14px 0;
  line-height: 1.6;
  font-size: 15px;
}

.section {
  padding: 4px 14px;
}

.section-title {
  font-weight: 600;
  margin: 10px 0 6px;
}

.cause-list,
.step-list {
  padding-left: 20px;
  margin: 0;
  line-height: 1.7;
}

.cause-text,
.step-text {
  margin-right: 6px;
}

.conf {
  font-size: 12px;
  border-radius: 4px;
  padding: 0 4px;
  margin-right: 6px;
}

.conf-high {
  color: #d4380d;
  background: #fff1e8;
}

.conf-medium {
  color: #d48806;
  background: #fffbe6;
}

.conf-low {
  color: #8c8c8c;
  background: #f5f5f5;
}

.refs {
  margin-left: 4px;
}

.tool-tag {
  margin-right: 6px;
  margin-bottom: 4px;
}

.safety-note {
  margin: 10px 14px;
}

.stream-text {
  padding: 14px;
  line-height: 1.6;
}

.stream-text pre {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 13px;
  margin: 0;
  color: var(--el-text-color-regular);
}

.stream-cursor {
  color: var(--el-color-primary);
  animation: blink 1s step-start infinite;
}

.stream-wait {
  padding: 24px 16px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.empty {
  text-align: center;
}

.error-text {
  padding: 12px 14px;
  color: var(--el-color-danger);
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 14px;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}
</style>
