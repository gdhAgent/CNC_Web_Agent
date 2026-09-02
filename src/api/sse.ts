/**
 * SSE 客户端 —— @microsoft/fetch-event-source（支持 POST + 命名事件）
 *
 * 后端 SSE 事件序列：
 *   retrieval（左栏先渲染）→ tool* → delta*（右栏打字机）→ done（完整结果）
 *   异常 → error（统一错误 JSON）
 *
 * 事件名与 data 直接透传给回调；onopen 非 2xx 时读统一错误并终止连接（不自动重连）。
 */
import { fetchEventSource } from '@microsoft/fetch-event-source'
import type {
  DeltaEvent,
  DoneEvent,
  ErrorEvent,
  QueryRequest,
  RetrievalEvent,
  ToolEvent,
} from '@/types'

export interface StreamCallbacks {
  onOpen?: () => void
  onRetrieval?: (data: RetrievalEvent) => void
  onTool?: (data: ToolEvent) => void
  onDelta?: (data: DeltaEvent) => void
  onDone?: (data: DoneEvent) => void
  onError?: (data: ErrorEvent) => void
  onClose?: () => void
  onNetworkError?: (err: unknown) => void
}

/** 发起流式查询；返回的 promise 在流结束 / 出错 / 被 abort 时 resolve。 */
export async function streamQuery(
  req: QueryRequest,
  cb: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  await fetchEventSource('/api/cnc/query/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
    openWhenHidden: true,              // 后台 tab 也保持接收
    async onopen(response) {
      if (response.ok) {
        cb.onOpen?.()
        return
      }
      // 非 2xx：读取统一错误 JSON 并终止（onopen 抛错 = 不重连）
      let code = `HTTP_${response.status}`
      let message = `请求失败 (${response.status})`
      try {
        const data = (await response.json()) as { error?: { code?: string; message?: string } }
        if (data.error?.message) message = data.error.message
        if (data.error?.code) code = data.error.code
      } catch {
        /* 非 JSON body，用兜底文案 */
      }
      cb.onError?.({ code, message })
      throw new Error(message)
    },
    onmessage(ev) {
      if (!ev.data) return
      switch (ev.event) {
        case 'retrieval':
          cb.onRetrieval?.(JSON.parse(ev.data) as RetrievalEvent)
          break
        case 'tool':
          cb.onTool?.(JSON.parse(ev.data) as ToolEvent)
          break
        case 'delta':
          cb.onDelta?.(JSON.parse(ev.data) as DeltaEvent)
          break
        case 'done':
          cb.onDone?.(JSON.parse(ev.data) as DoneEvent)
          break
        case 'error':
          cb.onError?.(JSON.parse(ev.data) as ErrorEvent)
          break
        default:
          break
      }
    },
    onerror(err) {
      // 不自动重连：查询流是一次性的，抛错终止
      cb.onNetworkError?.(err)
      throw err
    },
    onclose() {
      cb.onClose?.()
    },
  })
}
