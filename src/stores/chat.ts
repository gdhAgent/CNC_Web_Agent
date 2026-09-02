/**
 * chat store —— 驱动 /api/cnc/query/stream 的流式状态机
 *
 * 状态：
 *   topk（左栏召回卡片）在 retrieval 事件到达即填充（目标 <800ms 出左栏）
 *   rawAnswer 在 delta 逐字累积；analysis（结构化 JSON）在 done 事件拿到
 *   refused / traceId / toolCalls 在 done 时回填
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { streamQuery } from '@/api/sse'
import type {
  QueryRequest,
  StructuredAnalysis,
  ToolCallInfo,
  TopKItem,
} from '@/types'

export const useChatStore = defineStore('chat', () => {
  const sessionId = ref<string | undefined>(undefined)
  const userCode = ref('E1024')

  const route = ref<string | undefined>(undefined)
  const traceId = ref<string | undefined>(undefined)
  const detectedCodes = ref<string[]>([])
  const topk = ref<TopKItem[]>([])
  const suggestHits = ref<TopKItem[]>([])
  const toolCalls = ref<ToolCallInfo[]>([])
  const analysis = ref<StructuredAnalysis | null>(null)
  const rawAnswer = ref('')
  const refused = ref(false)
  const refusedReason = ref<string | null>(null)
  const streaming = ref(false)
  const error = ref<string | null>(null)
  const timing = ref<Record<string, number>>({})
  const activeRef = ref<number | null>(null)   // 引用 [n] 点击 → 左栏高亮

  let aborter: AbortController | null = null

  function reset() {
    route.value = undefined
    traceId.value = undefined
    detectedCodes.value = []
    topk.value = []
    suggestHits.value = []
    toolCalls.value = []
    analysis.value = null
    rawAnswer.value = ''
    refused.value = false
    refusedReason.value = null
    error.value = null
    timing.value = {}
    activeRef.value = null
  }

  async function send(query: string, opts: Partial<QueryRequest> = {}) {
    abort()
    reset()
    streaming.value = true

    const controller = new AbortController()
    aborter = controller
    const req: QueryRequest = {
      query,
      user_code: userCode.value,
      session_id: sessionId.value,
      ...opts,
    }

    await streamQuery(
      req,
      {
        onRetrieval(data) {
          topk.value = data.topk ?? []
          route.value = data.route
          detectedCodes.value = data.detected_codes ?? []
          timing.value = data.timing ?? {}
        },
        onTool(data) {
          toolCalls.value.push({
            name: data.name,
            args: data.args,
            ms: data.ms,
            ok: data.ok,
          })
        },
        onDelta(data) {
          rawAnswer.value += data.text
        },
        onDone(data) {
          traceId.value = data.trace_id
          route.value = data.route
          refused.value = data.refused ?? false
          refusedReason.value = data.refused_reason ?? null
          if (data.analysis) analysis.value = data.analysis
          if (data.tool_calls && data.tool_calls.length) toolCalls.value = data.tool_calls
          if (data.answer) rawAnswer.value = data.answer
          streaming.value = false
        },
        onError(data) {
          error.value = data.message
          streaming.value = false
        },
        onNetworkError() {
          error.value = '网络连接中断，请检查后端服务'
          streaming.value = false
        },
      },
      controller.signal,
    )
      .catch(() => {
        /* abort 触发会抛 AbortError，忽略 */
      })
      .finally(() => {
        streaming.value = false
      })
  }

  function abort() {
    aborter?.abort()
    aborter = null
  }

  return {
    sessionId,
    userCode,
    route,
    traceId,
    detectedCodes,
    topk,
    suggestHits,
    toolCalls,
    analysis,
    rawAnswer,
    refused,
    refusedReason,
    streaming,
    error,
    timing,
    activeRef,
    send,
    abort,
    reset,
  }
})
