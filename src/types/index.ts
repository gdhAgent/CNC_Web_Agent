/**
 * 与后端 app/schemas/* 对齐的 TS 类型 * 后端一改这里就要同步 —— 前后端契约的唯一事实源。
 */

// ==================== 查询 ====================

export interface QueryRequest {
  query: string
  session_id?: string | null
  user_code?: string | null
  brand?: string | null
  machine_model?: string | null
  top_n?: number
}

export interface TopKItem {
  ref: number                          // 引用编号，与 analysis 的 [n] 对应
  type: 'alarm' | 'chunk' | 'maintenance_log'
  id: number
  score: number
  channel: string[]                    // 命中通道标签（精确/向量/全文/重排）
  title: string
  source: string
  content: string
  code_norm?: string | null            // 仅 alarm
}

export interface TimingInfo {
  embed: number
  code_extract: number
  exact_match: number
  vector_recall: number
  fulltext_recall: number
  rrf_fusion: number
  rerank: number
  threshold_gate: number
  total: number
}

export interface QueryResponse {
  trace_id: string
  route: string                        // exact_code | hybrid | refused
  detected_codes: string[]
  refused: boolean
  refused_reason: string | null
  topk: TopKItem[]
  suggest_hits: TopKItem[]             // "您是否想问 XXXX"
  tool_calls: ToolCallInfo[]
  timing: TimingInfo
}

// ==================== SSE 事件 ====================

export interface RetrievalEvent {
  topk: TopKItem[]
  route: string
  detected_codes?: string[]
  timing?: Partial<TimingInfo>
}

export interface ToolEvent {
  name: string
  args?: unknown
  ok?: boolean
  ms?: number
}

export interface DeltaEvent {
  text: string
}

export interface DoneEvent {
  trace_id: string
  route: string
  refused?: boolean
  refused_reason?: string | null
  answer?: string
  analysis?: StructuredAnalysis | null
  tool_calls?: ToolCallInfo[]
}

export interface ErrorEvent {
  code: string
  message: string
}

// ==================== 结构化分析 ====================

export interface PossibleCause {
  cause: string
  confidence: 'high' | 'medium' | 'low'
  refs: number[]
}

export interface TroubleshootingStep {
  step: number
  action: string
  refs: number[]
}

export interface StructuredAnalysis {
  summary: string
  possible_causes: PossibleCause[]
  troubleshooting_steps: TroubleshootingStep[]
  required_tools: string[]
  safety_note: string
  need_expert: boolean
}

export interface ToolCallInfo {
  name: string
  args: unknown
  output?: string
  ok?: boolean
  ms?: number
}

// ==================== 追踪排查（/api/trace） ====================

export interface TraceStepItem {
  seq: number
  step: string                         // normalize / code_extract / … / post_check
  status: string                       // ok | skipped | failed | timeout
  started_at?: string | null
  ms: number
  input: Record<string, unknown>
  output: Record<string, unknown>
  note?: string | null
}

export interface RankingRow {
  type: string
  id: number
  title: string
  vector_rank?: number | null
  fulltext_rank?: number | null
  rrf_rank?: number | null
  rerank_rank?: number | null
  final: boolean
}

export interface TraceResponse {
  trace_id: string
  question: string
  route: string
  refused: boolean
  detected_codes: string[]
  answer?: string | null
  latency_ms?: number | null
  latency_breakdown: Record<string, number>
  tool_calls: ToolCallInfo[]
  feedback?: number | null
  created_at?: string | null
  steps: TraceStepItem[]               // 时间轴
  ranking_comparison: RankingRow[]     // 三路排名对比表
}

export interface LogItem {
  id: number
  trace_id: string
  raw_query: string
  route: string
  refused: boolean
  feedback?: number | null
  latency_ms?: number | null
  user_code?: string | null
  created_at?: string | null
}

export interface LogListResponse {
  items: LogItem[]
  total: number
  limit: number
  offset: number
}

// ==================== 知识录入 / 文档 ====================

export interface AlarmEntryRequest {
  type: 'alarm'
  brand: string
  code: string
  name: string
  controller?: string | null
  category?: string | null
  severity?: string | null
  description?: string | null
  cause?: string | string[] | null
  action?: string | string[] | null
  safety_note?: string | null
  model_scope?: string[] | null
  created_by?: string | null
}

export interface FAQEntryRequest {
  type: 'faq'
  title: string
  body: string
  brand?: string | null
  model_scope?: string[] | null
  source?: string | null
  created_by?: string | null
}

export interface EntryResponse {
  id: number
  type: 'alarm' | 'faq'
  code_norm?: string | null
  doc_id?: number | null
  vectorized: boolean
}

export interface DocumentItem {
  id: number
  title: string
  doc_type: string
  brand?: string | null
  model_scope?: string[]
  source_file?: string | null
  page_count?: number | null
  status: string                        // pending | parsing | ready | failed
  error_msg?: string | null
  created_at?: string | null
  updated_at?: string | null
  chunk_count: number
}

export interface ChunkItem {
  id: number
  level: number                          // 1=父块 2=子块
  seq: number
  heading_path?: string | null
  content: string
  content_len: number
  page_from?: number | null
  page_to?: number | null
  has_tsv: boolean
  has_embedding: boolean
}

export interface DocumentChunksResponse {
  doc_id: number
  title: string
  total: number
  items: ChunkItem[]
  limit: number
  offset: number
}

export interface DocumentListResponse {
  total: number
  items: DocumentItem[]
}

// ==================== 反馈 / 建议 ====================

export interface FeedbackRequest {
  trace_id: string
  verdict: 1 | -1
  user_code?: string | null
  reason?: string | null
  bad_refs?: number[]
  comment?: string | null
  correction?: string | null
}

export interface FeedbackResponse {
  id: number
  suggestion_id?: number | null
  message?: string
}

export interface SuggestionItem {
  id: number
  source: string                        // refused | negative_feedback | manual | low_score
  trace_id?: string | null
  question: string
  suggested_type: string                // alarm | faq | manual_chunk | maintenance_tip
  draft_content?: string | null
  status: string                        // open | in_progress | resolved | rejected
  resolved_ref?: Record<string, unknown> | null
  handler?: string | null
  created_at?: string | null
}

// ==================== 统一错误 ====================

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    detail?: unknown
  }
}

// ==================== 高频故障看板 ====================

export interface TopFaultItem {
  code_norm: string
  count: number
  name?: string | null
  severity?: string | null
  brand?: string | null
  last_seen_at?: string | null
}

export interface TopFaultsWindow {
  from_time?: string | null
  to_time: string
  days?: number | null
}

export interface TopFaultsResponse {
  window: TopFaultsWindow
  total_query_logs: number
  total_maintenance_logs: number
  by_query: TopFaultItem[]
  by_maintenance: TopFaultItem[]
}

// ==================== 工单管理 ====================

export interface WorkOrderItem {
  id: number
  order_no: string | null
  machine_id: number
  asset_no: string | null
  brand: string | null
  model: string | null
  alarm_code: string | null
  alarm_name?: string | null
  alarm_severity?: string | null
  fault_type: string | null
  symptom: string
  root_cause: string | null
  action_taken: string | null
  engineer: string | null
  downtime_min: number | null
  started_at: string | null
  finished_at: string | null
  is_demo: boolean
}

export interface WorkOrderListResponse {
  total: number
  items: WorkOrderItem[]
  limit: number
  offset: number
}

export interface MachineItem {
  id: number
  asset_no: string
  name: string
  brand: string
  model: string | null
  controller: string | null
  workshop: string | null
  line_no: string | null
  status: string
  is_demo: boolean
  workorder_count: number
}

// ==================== 基础数据 ====================

export type BaseItemKind = 'brand' | 'category' | 'severity' | 'fault_type'

export interface BaseItem {
  id: number
  kind: BaseItemKind
  code: string
  label_zh: string
  label_en: string
  sort_order: number
  is_active: boolean
  created_at?: string | null
  updated_at?: string | null
}

// ==================== 设备台账（含设备维护） ====================

export interface DeviceItem {
  id: number
  asset_no: string
  name: string
  brand: string
  model: string | null
  controller: string | null
  workshop: string | null
  line_no: string | null
  install_date: string | null
  status: string          // running | idle | repair | scrapped
  is_demo: boolean
  spec: Record<string, unknown>
  created_at?: string | null
  updated_at?: string | null
}

// ==================== V1.5 用户与权限 ====================

export type RoleType = 'admin' | 'operator' | 'viewer'

export interface AuthUser {
  id: number
  username: string
  display_name: string
  role: RoleType
  is_active: boolean
  last_login_at?: string | null
  created_at: string
  updated_at: string
  created_by?: string | null
}

export interface LoginResponse {
  token: string
  expires_in: number
  user: AuthUser
}

export interface MeResponse {
  user: AuthUser
  visible_pages: string[]
  actions_by_page: Record<string, string[]>
}

export interface UserListResponse {
  items: AuthUser[]
  total: number
  limit: number
  offset: number
}

export interface UserCreateRequest {
  username: string
  display_name: string
  password: string
  role: RoleType
  is_active: boolean
}

export interface UserUpdateRequest {
  display_name?: string | null
  role?: RoleType | null
  is_active?: boolean | null
}

export interface RolePermissionItem {
  page_code: string
  can_access: boolean
  actions: string[]
}

export interface RolePermissionsResponse {
  role: RoleType
  items: RolePermissionItem[]
}

// ==================== 知识条目管理（V1.5 删除/重录闭环） ====================

export interface EntryListItem {
  type: 'alarm' | 'faq'
  id: number
  doc_id?: number | null
  title: string
  origin: string          // ingest | manual | feedback
  created_by?: string | null
  created_at?: string | null
  vectorized: boolean
}

export interface EntryListResponse {
  total: number
  items: EntryListItem[]
  limit: number
  offset: number
}
