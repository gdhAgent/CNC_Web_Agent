<script setup lang="ts">
/**
 * TraceView —— 检索排查页 * /trace/:traceId → GET /api/trace/{traceId}
 * 上：问题 / 路由 / 耗时 / 反馈 概要
 * 中：步骤时间轴（seq / step / status / ms / input / output）
 * 下：三路排名对比表（向量 / 全文 / RRF / Rerank / 最终）—— "Rerank 有用的肉眼证据"
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, QuestionFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

import http, { errMessage } from '@/api/http'
import type { TraceResponse, TraceStepItem } from '@/types'

const router = useRouter()
// 上下文感知返回：从「查询日志 /logs」进入 → router.back() 回到日志列表；直接访问 → 回智能问答
function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/')
  }
}

const route = useRoute()
const traceId = route.params.traceId as string

const trace = ref<TraceResponse | null>(null)
const loading = ref(false)
const notFound = ref(false)

const stepZh: Record<string, string> = {
  normalize: '归一化',
  code_extract: '码抽取',
  exact_match: '精确匹配',
  vector_recall: '向量召回',
  fulltext_recall: '全文召回',
  rrf_fusion: 'RRF 融合',
  rerank: 'Rerank 重排',
  threshold_gate: '阈值闸门',
  tool_call: '工具调用',
  llm_generate: 'LLM 生成',
  post_check: '后校验',
}

const routeZh: Record<string, string> = {
  exact_code: '报警码精确短路',
  hybrid: '混合检索',
  agent: 'Agent 工具路由',
  rag_fallback: '纯 RAG（降级）',
  refused: '拒答',
}

const statusMeta: Record<string, { icon: string; color: string }> = {
  ok: { icon: '✅', color: 'var(--el-color-success)' },
  skipped: { icon: '⏭️', color: 'var(--el-text-color-secondary)' },
  failed: { icon: '❌', color: 'var(--el-color-danger)' },
  timeout: { icon: '⏱️', color: 'var(--el-color-warning)' },
}

const summary = computed(() => {
  if (!trace.value) return null
  const steps = trace.value.steps
  return {
    totalMs: trace.value.latency_ms ?? steps.reduce((a, s) => a + (s.ms || 0), 0),
    llmMs: steps.filter((s) => s.step === 'llm_generate').reduce((a, s) => a + (s.ms || 0), 0),
    toolCount: steps.filter((s) => s.step === 'tool_call').length,
    steps: steps.length,
  }
})

// 检索内部步骤（normalize…threshold_gate）属于某个工具调用，视觉上缩进展示
const RETRIEVAL_INNER_STEPS = new Set([
  'normalize', 'code_extract', 'exact_match', 'vector_recall',
  'fulltext_recall', 'rrf_fusion', 'rerank', 'threshold_gate',
])

// 按 Agent 调用顺序分组：每轮从 llm_generate 开始，到下一个 llm_generate 前结束。
// 最后一轮无工具调用 → "最终生成"；纯检索（无 llm_generate）→ 单个"检索链路"组。
interface Round {
  id: number
  label: string
  isFinal: boolean
  steps: TraceStepItem[]
}

const rounds = computed<Round[]>(() => {
  if (!trace.value) return []
  const steps = trace.value.steps
  const out: Round[] = []
  let cur: Round | null = null
  let sawLlm = false
  for (const s of steps) {
    if (s.step === 'llm_generate') {
      sawLlm = true
      cur = { id: out.length + 1, label: `第 ${out.length + 1} 轮`, isFinal: false, steps: [] }
      out.push(cur)
    }
    if (!cur) {
      out.push({ id: out.length + 1, label: '检索链路', isFinal: false, steps: [s] })
      continue
    }
    cur.steps.push(s)
  }
  if (sawLlm && out.length) {
    const last = out[out.length - 1]
    const hasTool = last.steps.some((s) => s.step === 'tool_call')
    last.isFinal = !hasTool
    last.label = hasTool ? last.label : '最终生成'
  }
  if (!out.length && steps.length) {
    out.push({ id: 1, label: '检索链路', isFinal: false, steps })
  }
  return out
})

function isInner(s: TraceStepItem): boolean {
  return RETRIEVAL_INNER_STEPS.has(s.step)
}

// 每个节点用到的工具 / 技术栈（展示在步骤名之后，让"调了什么"一屏可见）
const stepTech: Record<string, string> = {
  normalize: 'jieba + 术语词典',
  code_extract: '正则识别',
  exact_match: 'PostgreSQL 精确查询',
  vector_recall: 'pgvector + bge-m3',
  fulltext_recall: 'PG 全文检索 (tsvector)',
  rrf_fusion: 'RRF 融合算法',
  rerank: 'bge-reranker-v2-m3',
  threshold_gate: '阈值 ≥ 0.30',
  llm_generate: 'DeepSeek deepseek-chat',
  post_check: '引用越界校验',
}

function techOf(s: TraceStepItem): string {
  if (s.step === 'tool_call') {
    const name = (s.input as Record<string, unknown> | undefined)?.name
    return typeof name === 'string' && name ? `工具：${name}` : ''
  }
  return stepTech[s.step] ?? ''
}

function roundMs(r: Round): number {
  return r.steps.reduce((a, s) => a + (s.ms || 0), 0)
}

function fmtInput(input: Record<string, unknown>): string {
  return JSON.stringify(input)
}

async function load() {
  loading.value = true
  notFound.value = false
  try {
    const resp = await http.get<TraceResponse>(`/trace/${traceId}`)
    trace.value = resp.data
  } catch (e) {
    notFound.value = true
    ElMessage.error(errMessage(e))
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="trace" v-loading="loading">
    <div class="page-header">
      <el-button text :icon="ArrowLeft" @click="goBack" class="back-btn">
        ← 返回
      </el-button>
    </div>

    <el-empty v-if="notFound" description="未找到该次查询的追踪数据">
      <el-button type="primary" @click="goBack">← 返回</el-button>
    </el-empty>

    <template v-else-if="trace">
      <!-- 概要 -->
      <div class="summary">
        <div class="summary-row">
          <span class="label">问题：</span>{{ trace.question }}
          <el-tag v-if="trace.route" size="small" type="info">
            {{ routeZh[trace.route] ?? trace.route }}
          </el-tag>
          <el-tag v-if="trace.refused" size="small" type="danger">拒答</el-tag>
        </div>
        <div class="summary-meta">
          <span>总耗时 {{ summary?.totalMs }}ms</span>
          <span>· 步骤 {{ summary?.steps }}</span>
          <span>· LLM {{ summary?.llmMs }}ms</span>
          <span>· 工具 {{ summary?.toolCount }} 次</span>
          <span v-if="trace.detected_codes.length">
            · 识别码 {{ trace.detected_codes.join(', ') }}
          </span>
          <span v-if="trace.feedback">· 评价 {{ trace.feedback === 1 ? '👍' : '👎' }}</span>
        </div>
      </div>

      <!-- 时间轴（按 Agent 调用顺序分组展示） -->
      <div class="section">
        <div class="section-title">⏱ 处理时间轴（按调用顺序）</div>
        <div v-if="!trace.steps.length" class="timeline">
          <el-empty description="无步骤数据（exact_code / refused 路径可能只有概要）" />
        </div>
        <div v-else class="rounds">
          <div v-for="r in rounds" :key="r.id" class="round">
            <div class="round-title">
              <span class="round-badge">{{ r.isFinal ? '🏁' : '🔄' }}</span>
              <span class="round-label">{{ r.label }}</span>
              <span class="round-meta">
                {{ r.steps.filter((s) => s.step === 'tool_call').length }} 工具 ·
                {{ roundMs(r) }}ms
              </span>
            </div>
            <div class="timeline">
              <div
                v-for="s in r.steps"
                :key="s.seq"
                class="tl-item"
                :class="{ 'tl-inner': isInner(s) }"
              >
                <div class="tl-icon" :style="{ color: statusMeta[s.status]?.color }">
                  {{ statusMeta[s.status]?.icon ?? '•' }}
                </div>
                <div class="tl-body">
                  <div class="tl-head">
                    <span class="tl-step">{{ stepZh[s.step] ?? s.step }}</span>
                    <span class="tl-status">{{ s.status }}</span>
                    <span class="tl-ms">{{ s.ms }}ms</span>
                    <span v-if="techOf(s)" class="tl-tech">{{ techOf(s) }}</span>
                  </div>
                  <div v-if="s.note" class="tl-note">{{ s.note }}</div>
                  <div v-if="s.input && Object.keys(s.input).length" class="tl-io">
                    <span class="io-label">in:</span>
                    <pre>{{ fmtInput(s.input) }}</pre>
                  </div>
                  <div v-if="s.output && Object.keys(s.output).length" class="tl-io">
                    <span class="io-label">out:</span>
                    <pre>{{ fmtInput(s.output) }}</pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 三路排名对比表 -->
      <div v-if="trace.ranking_comparison.length" class="section">
        <div class="section-title">
          📊 三路排名对比（Rerank 价值可视化）
          <el-tooltip placement="top">
            <template #content>
              <div style="max-width: 320px; line-height: 1.7">
                <strong>三路 = 三种召回通道：</strong><br />
                ① <strong>向量</strong>召回（pgvector + bge-m3 语义相似）<br />
                ② <strong>全文</strong>召回（PostgreSQL tsvector 关键词）<br />
                ③ <strong>RRF</strong> 融合（把前两路名次按公式合并成一路）<br /><br />
                每行是同一个候选在三路里的名次；「RRF」= 融合后名次，「Rerank 后」= 用
                bge-reranker-v2-m3 精排后的名次。名次比 RRF 提升（绿色加粗）说明 Rerank
                把它捞上来了；「最终」= Rerank 后是否进入最终 Top5。
              </div>
            </template>
            <el-icon class="rank-help"><QuestionFilled /></el-icon>
          </el-tooltip>
        </div>
        <el-table :data="trace.ranking_comparison" size="small" class="rank-table">
          <el-table-column label="候选" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">{{ row.title }}</template>
          </el-table-column>
          <el-table-column label="向量" width="70" align="center">
            <template #default="{ row }">{{ row.vector_rank ?? '—' }}</template>
          </el-table-column>
          <el-table-column label="全文" width="70" align="center">
            <template #default="{ row }">{{ row.fulltext_rank ?? '—' }}</template>
          </el-table-column>
          <el-table-column label="RRF" width="70" align="center">
            <template #default="{ row }">{{ row.rrf_rank ?? '—' }}</template>
          </el-table-column>
          <el-table-column label="Rerank 后" width="90" align="center">
            <template #default="{ row }">
              <span v-if="row.rerank_rank != null" :class="{ improved: (row.rerank_rank ?? 99) <= (row.rrf_rank ?? 99) }">
                {{ row.rerank_rank }}
              </span>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column label="最终" width="70" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.final" size="small" type="success">采用</el-tag>
              <el-tag v-else size="small" type="info">淘汰</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.trace {
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.page-header {
  display: flex;
  align-items: center;
}

.back-btn {
  font-size: 14px;
}

.summary {
  background: #fff;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 12px 14px;
}

.summary-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
}

.label {
  color: var(--el-text-color-secondary);
  font-weight: 600;
}

.summary-meta {
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.section {
  background: #fff;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 12px 14px;
}

.section-title {
  font-weight: 600;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
}

.rank-help {
  cursor: help;
  margin-left: 6px;
  color: var(--el-text-color-secondary);
}

.rounds {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.round {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 10px 12px;
}

.round-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-weight: 600;
}

.round-badge {
  flex-shrink: 0;
}

.round-label {
  font-size: 14px;
}

.round-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: 400;
}

.timeline {
  display: flex;
  flex-direction: column;
}

.tl-inner .tl-body {
  padding-left: 14px;
  border-left: 2px dashed var(--el-border-color-lighter);
  padding-bottom: 8px;
  margin-left: 2px;
}

.tl-item {
  display: flex;
  gap: 10px;
  position: relative;
  padding-bottom: 8px;
}

.tl-item:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 18px;
  bottom: 2px;
  width: 1px;
  background: var(--el-border-color-lighter);
}

.tl-icon {
  width: 15px;
  flex-shrink: 0;
  font-size: 13px;
  text-align: center;
}

.tl-body {
  flex: 1;
  padding-bottom: 6px;
}

.tl-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tl-step {
  font-weight: 600;
}

.tl-status {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
}

.tl-ms {
  font-size: 12px;
  color: var(--el-color-primary);
}

.tl-tech {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color);
  padding: 0 6px;
  border-radius: 3px;
  font-family: ui-monospace, Consolas, monospace;
  white-space: nowrap;
}

.tl-note {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.tl-io {
  display: flex;
  gap: 6px;
  margin-top: 4px;
  align-items: baseline;
}

.io-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.tl-io pre {
  margin: 0;
  font-size: 12px;
  background: var(--el-fill-color-light);
  padding: 4px 8px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-all;
}

.rank-table {
  width: 100%;
}

.improved {
  color: var(--el-color-success);
  font-weight: 700;
}
</style>
