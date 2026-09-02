<script setup lang="ts">
/**
 * FeedbackBar —— 赞/踩 + 点踩原因分类 + 纠错输入
 * 另含：拒答时「提交为待补充知识」按钮（POST /api/suggestions，source='refused'）
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'

import http, { errMessage } from '@/api/http'
import { useChatStore } from '@/stores/chat'
import type { FeedbackRequest } from '@/types'

const store = useChatStore()

const REASONS = [
  { value: 'not_relevant', label: '与问题无关' },
  { value: 'wrong_answer', label: '答案错误' },
  { value: 'incomplete', label: '信息不完整' },
  { value: 'outdated', label: '内容过时' },
  { value: 'no_source', label: '没有引用来源' },
  { value: 'other', label: '其他' },
]

const submitted = ref<1 | -1 | null>(null)
const panelOpen = ref(false)
const reason = ref<string>('')
const correction = ref('')

async function submitThumbsUp() {
  if (!store.traceId) return
  const ok = await postFeedback(1, {})
  if (ok) {
    submitted.value = 1
    panelOpen.value = false
    ElMessage.success('已记录 👍 对你有用')
  }
}

function openDown() {
  if (!store.traceId) return
  panelOpen.value = true
  reason.value = ''
  correction.value = ''
}

async function submitDown() {
  if (!store.traceId) return
  const body: { reason?: string; correction?: string } = {}
  if (reason.value) body.reason = reason.value
  if (correction.value.trim()) body.correction = correction.value.trim()
  const ok = await postFeedback(-1, body)
  if (ok) {
    submitted.value = -1
    panelOpen.value = false
    ElMessage.success('已记录，将进入待补充知识清单')
  }
}

async function postFeedback(verdict: 1 | -1, extra: { reason?: string; correction?: string }) {
  const body: FeedbackRequest = {
    trace_id: store.traceId!,
    verdict,
    user_code: store.userCode,
    ...extra,
  }
  try {
    const resp = await http.post<{ id: number }>('/feedback', body)
    return resp.data.id != null
  } catch (e) {
    ElMessage.error(errMessage(e))
    return false
  }
}

// ===== 拒答 → 提交为待补充知识 =====

const submitting = ref(false)
async function submitSuggestion() {
  if (!store.traceId) return
  submitting.value = true
  try {
    await http.post('/suggestions', {
      trace_id: store.traceId,
      source: 'refused',
      draft_content: store.analysis?.summary || store.rawAnswer.slice(0, 200) || undefined,
    })
    ElMessage.success('已加入待补充知识清单')
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="feedback">
    <el-button-group v-if="store.traceId">
      <el-button
        size="small"
        :type="submitted === 1 ? 'success' : 'default'"
        :disabled="panelOpen || store.streaming"
        @click="submitThumbsUp"
      >
        👍 有用
      </el-button>
      <el-button
        size="small"
        :type="submitted === -1 ? 'danger' : 'default'"
        :disabled="store.streaming"
        @click="openDown"
      >
        👎 不准
      </el-button>
    </el-button-group>
    <span v-else class="empty-hint">提交问题后，可对回答进行 👍 / 👎 评价</span>

    <el-button
      v-if="store.refused"
      size="small"
      type="warning"
      plain
      :loading="submitting"
      @click="submitSuggestion"
    >
      提交为待补充知识
    </el-button>

    <el-collapse-transition>
      <div v-if="panelOpen" class="down-panel">
        <el-select v-model="reason" placeholder="选择点踩原因" size="small" clearable class="reason-select">
          <el-option v-for="r in REASONS" :key="r.value" :label="r.label" :value="r.value" />
        </el-select>
        <el-input
          v-model="correction"
          type="textarea"
          :rows="2"
          placeholder="正确答案应该是…（可留空）"
          maxlength="1000"
          show-word-limit
        />
        <div class="down-actions">
          <el-button size="small" type="primary" @click="submitDown">提交</el-button>
          <el-button size="small" @click="panelOpen = false">取消</el-button>
        </div>
      </div>
    </el-collapse-transition>
  </div>
</template>

<style scoped>
.feedback {
  padding: 10px 14px;
  border-top: 1px solid var(--el-border-color-lighter);
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.empty-hint {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}

.down-panel {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
}

.reason-select {
  width: 200px;
}

.down-actions {
  display: flex;
  gap: 8px;
}
</style>
