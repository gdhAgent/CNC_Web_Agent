<script setup lang="ts">
/**
 * VectorView —— 向量存储总览 *
 * 向量存在 PostgreSQL（pgvector vector 列，bge-m3 1024 维）。
 * 重档部分：PCA 把向量投影到 2D 散点图（按类别/品牌着色，可缩放/悬浮），
 * 直观看到"同类向量聚在一起"。
 *
 * 后端契约：
 *   GET  /api/vectors/overview
 *   GET  /api/vectors/embedding-map?table=&group_by=
 *   GET  /api/vectors/unvectorized
 *   POST /api/vectors/vectorize/{table}
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, VideoPlay, Histogram, QuestionFilled } from '@element-plus/icons-vue'
import * as echarts from 'echarts/core'
import { ScatterChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent, DataZoomComponent, GridComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'
import http, { errMessage } from '@/api/http'
import { useBaseItemsStore } from '@/stores/baseItems'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
// V1.5 F8：vectors 页动作级权限（仅 admin 可补跑向量）
const canVectorize = computed(() => auth.canDoAction('vectors', 'vectors.vectorize'))

echarts.use([ScatterChart, TooltipComponent, LegendComponent, DataZoomComponent, GridComponent, CanvasRenderer])

interface TableStat {
  table: string
  label: string
  note: string
  designed_skip: boolean
  total: number
  with_embedding: number
  without: number
  dim_min: number | null
  dim_max: number | null
}

interface MapItem {
  id: number
  x: number
  y: number
  label: string
  group: string
}

interface UnvectorizedItem {
  id: number
  code: string | null
  title: string | null
  detail: string | null
}

const PALETTE = ['#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#9C27B0', '#00BCD4', '#FF9800', '#4CAF50', '#795548', '#607D8B', '#E91E63', '#8BC34A']

const tables = ref<TableStat[]>([])
const loading = ref(false)

const activeTable = ref<'alarms' | 'chunks' | 'maintenance_logs'>('alarms')
const groupBy = ref('category')
const groupByOptions = ref<string[]>([])
const mapData = ref<MapItem[]>([])
const explained = ref<[number, number]>([0, 0])
const mapLoading = ref(false)

const activeTable2 = ref<'alarms' | 'chunks' | 'maintenance_logs'>('chunks')
const missing = ref<UnvectorizedItem[]>([])
const missingTotal = ref(0)
const missingLoading = ref(false)
const missingPage = ref(1)
const missingPageSize = ref(20)
const vectorizing = ref(false)

const totalEmbedded = computed(() => tables.value.reduce((a, t) => a + t.with_embedding, 0))
const totalAll = computed(() => tables.value.reduce((a, t) => a + t.total, 0))

const chartEl = ref<HTMLDivElement | null>(null)
let chart: ReturnType<typeof echarts.init> | null = null

const GROUP_LABEL: Record<string, string> = {
  category: '按类别',
  brand: '按品牌',
  severity: '按严重度',
  doc: '按文档',
  level: '按层级',
  fault_type: '按故障类型',
}

const baseStore = useBaseItemsStore()

// 严重度 → 中文
const SEVERITY_ZH: Record<string, string> = {
  info: '提示', warning: '警告', fault: '故障', fatal: '严重', unknown: '未知',
}

/** 分组值 → 中文展示（category/brand 用 base-items 的 label；severity 用映射；fault_type/doc/level 原生中文） */
function groupLabel(raw: string): string {
  if (activeTable.value === 'alarms') {
    if (groupBy.value === 'category') {
      const b = baseStore.findByCode('category', raw)
      return b ? baseStore.displayLabel(b) : raw
    }
    if (groupBy.value === 'brand') {
      const b = baseStore.findByCode('brand', raw)
      return b ? baseStore.displayLabel(b) : raw
    }
    if (groupBy.value === 'severity') return SEVERITY_ZH[raw] ?? raw
  }
  if (activeTable.value === 'maintenance_logs' && groupBy.value === 'brand') {
    const b = baseStore.findByCode('brand', raw)
    return b ? baseStore.displayLabel(b) : raw
  }
  if (activeTable.value === 'chunks' && groupBy.value === 'level') {
    return raw.includes('1') ? '父块' : '子块'
  }
  return raw  // fault_type / doc 本身就是可读中文或标题
}

const TABLE_GROUP_BY: Record<string, string[]> = {
  alarms: ['category', 'brand', 'severity'],
  chunks: ['doc', 'level'],
  maintenance_logs: ['fault_type', 'brand'],
}

function tableLabel(t: string): string {
  const found = tables.value.find((s) => s.table === t)
  return found?.label ?? t
}

function pct(t: TableStat): number {
  return t.total > 0 ? Math.round((t.with_embedding / t.total) * 100) : 0
}

async function loadOverview() {
  loading.value = true
  try {
    const resp = await http.get<{ tables: TableStat[] }>('/vectors/overview')
    tables.value = resp.data.tables
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    loading.value = false
  }
}

// ===== 散点图 =====

async function loadMap() {
  mapLoading.value = true
  try {
    const resp = await http.get<{
      count: number
      group_by: string
      explained_variance: [number, number]
      items: MapItem[]
    }>('/vectors/embedding-map', { params: { table: activeTable.value, group_by: groupBy.value } })
    mapData.value = resp.data.items
    explained.value = resp.data.explained_variance
    renderChart()
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    mapLoading.value = false
  }
}

function onMapTableChange() {
  groupByOptions.value = TABLE_GROUP_BY[activeTable.value] ?? []
  groupBy.value = groupByOptions.value[0] ?? ''
  loadMap()
}

function renderChart() {
  if (!chartEl.value) return
  if (!chart) chart = echarts.init(chartEl.value)

  const groups = [...new Set(mapData.value.map((i) => i.group))]
  const series = groups.map((g, idx) => ({
    name: groupLabel(g),
    type: 'scatter',
    data: mapData.value.filter((i) => i.group === g).map((i) => ({ value: [i.x, i.y], label: i.label })),
    symbolSize: 10,
    itemStyle: { color: PALETTE[idx % PALETTE.length] },
  }))

  const option: EChartsCoreOption = {
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => `${p.marker} <b>${p.seriesName}</b><br/>${p.data?.label ?? ''}`,
    },
    legend: { type: 'scroll', top: 0, left: 'center', itemWidth: 14, itemHeight: 10, textStyle: { fontSize: 12 } },
    grid: { left: 64, right: 32, top: 56, bottom: 70 },
    xAxis: { type: 'value', name: `PC1（主成分 1 · 解释 ${(explained.value[0] * 100).toFixed(1)}%）`, scale: true },
    yAxis: { type: 'value', name: `PC2（主成分 2 · 解释 ${(explained.value[1] * 100).toFixed(1)}%）`, scale: true },
    dataZoom: [
      { type: 'inside', throttle: 50 },
      { type: 'slider', height: 16, bottom: 12 },
    ],
    series,
  }
  chart.setOption(option, true)
}

function onResize() {
  chart?.resize()
}

// ===== 无向量清单 / 补跑 =====

async function loadMissing() {
  missingLoading.value = true
  try {
    const resp = await http.get<{ total: number; items: UnvectorizedItem[] }>(
      '/vectors/unvectorized',
      { params: { table: activeTable2.value, limit: missingPageSize.value, offset: (missingPage.value - 1) * missingPageSize.value } },
    )
    missing.value = resp.data.items
    missingTotal.value = resp.data.total
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    missingLoading.value = false
  }
}

function onMissingTableChange() {
  missingPage.value = 1
  loadMissing()
}

function onPageChange(p: number) {
  missingPage.value = p
  loadMissing()
}

async function triggerVectorize() {
  vectorizing.value = true
  try {
    const resp = await http.post<{ started: boolean }>(`/vectors/vectorize/${activeTable2.value}`)
    if (resp.data.started) {
      ElMessage.success(`已开始后台补跑「${tableLabel(activeTable2.value)}」的缺失向量，稍后刷新查看`)
    }
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    vectorizing.value = false
  }
}

onMounted(() => {
  onMapTableChange()
  loadOverview()
  loadMissing()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div class="vectors">
    <div class="page-header">
      <h2>
        <el-icon><Histogram /></el-icon>
        向量存储总览
      </h2>
      <p class="hint">
        向量存在 PostgreSQL（pgvector 扩展的 <code>vector</code> 列，bge-m3 生成 1024 维）。
        下方散点图是把向量 PCA 投影到 2D 的分布 —— 同一颜色的点语义相近。
      </p>
    </div>

    <!-- 概览卡片 -->
    <div class="cards" v-loading="loading">
      <el-card v-for="t in tables" :key="t.table" shadow="hover" class="stat-card">
        <div class="card-head">
          <span class="card-label">{{ t.label }}</span>
          <span class="card-table">{{ t.table }}</span>
        </div>
        <div class="card-big">
          {{ t.with_embedding }}<span class="card-slash"> / {{ t.total }}</span>
        </div>
        <div class="progress">
          <div class="progress-fill" :style="{ width: pct(t) + '%' }" />
        </div>
        <div class="card-meta">
          <span>覆盖 {{ pct(t) }}%</span>
          <span v-if="t.without"> · 缺 {{ t.without }}</span>
          <span v-if="t.dim_min"> · 维度 {{ t.dim_min }}{{ t.dim_max && t.dim_max !== t.dim_min ? '~' + t.dim_max : '' }}</span>
        </div>
        <div v-if="t.designed_skip" class="card-note">⚠️ 父块按设计不向量化（只做上下文）</div>
        <div class="card-note">{{ t.note }}</div>
      </el-card>
    </div>
    <div class="total-line" v-if="tables.length">
      合计：{{ totalEmbedded }} / {{ totalAll }} 条已有向量（{{ totalAll ? Math.round((totalEmbedded / totalAll) * 100) : 0 }}%）
    </div>

    <!-- 向量分布图（重档） -->
    <div class="section">
      <div class="map-head">
        <div class="map-title-row">
          <span class="map-title">📈 向量分布图（PCA 主成分分析 · 2D 降维）</span>
          <el-tooltip placement="top" :show-after="150">
            <template #content>
              <div class="map-help-content">
                <b>这是什么</b>：每个条目被算成一个 <b>1024 维</b>的向量，没法直接画图；
                用 PCA 把它压缩成平面上的 <b>2 个坐标</b>，画成一个点。
                <br />
                <b>怎么读</b>：<b>点越近 = 语义越像</b>；同色 = 同一分组。
                <br />
                <b>PC1 / PC2</b>：压缩后保留信息最多的两个方向（图的横轴 / 纵轴），
                PC1 比 PC2 更重要。
                <br />
                <b>「解释 XX%」</b>：这个轴单独能保留原始信息变化的百分比；
                两个轴加起来约等于整张图的还原度（30~50% 属正常，够看出聚类）。
              </div>
            </template>
            <el-icon class="map-help"><QuestionFilled /></el-icon>
          </el-tooltip>
          <span class="map-count">{{ mapData.length }} 个向量</span>
        </div>
        <div class="map-sub">
          把 1024 维向量降维成平面上的点 —— <b>点越近、语义越像</b>；悬停看具体内容，滚轮缩放 / 拖拽平移。
        </div>
        <div class="map-controls">
          <span class="ctrl-label">数据表</span>
          <el-select v-model="activeTable" size="small" style="width: 130px" @change="onMapTableChange">
            <el-option v-for="t in tables" :key="t.table" :label="t.label" :value="t.table" />
          </el-select>
          <span class="ctrl-label">着色分组</span>
          <el-select v-model="groupBy" size="small" style="width: 140px" @change="loadMap">
            <el-option v-for="g in groupByOptions" :key="g" :label="GROUP_LABEL[g] ?? g" :value="g" />
          </el-select>
          <el-button size="small" :icon="Refresh" :loading="mapLoading" @click="loadMap">刷新</el-button>
        </div>
      </div>
      <div ref="chartEl" class="scatter" v-loading="mapLoading" />
      <div v-if="!mapData.length && !mapLoading" class="empty-state">该表暂无向量数据</div>
    </div>

    <!-- 无向量清单 -->
    <div class="section">
      <div class="section-title">
        <span>🔍 未向量化清单（{{ missingTotal }} 条）</span>
        <div class="title-actions">
          <el-select v-model="activeTable2" size="small" style="width: 160px" @change="onMissingTableChange">
            <el-option v-for="t in tables" :key="t.table" :label="t.label" :value="t.table" />
          </el-select>
          <el-button size="small" :icon="Refresh" :loading="missingLoading" @click="loadMissing">刷新</el-button>
          <el-button
            size="small"
            type="primary"
            :icon="VideoPlay"
            :loading="vectorizing"
            :disabled="missingTotal === 0 || !canVectorize"
            @click="triggerVectorize"
          >
            补跑向量
          </el-button>
        </div>
      </div>
      <el-empty v-if="missingTotal === 0 && !missingLoading" description="当前表全部已向量化 🎉" />
      <el-table v-else :data="missing" v-loading="missingLoading" size="small" stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="code" label="编号" width="140">
          <template #default="{ row }">
            <span v-if="row.code" style="font-family: monospace">{{ row.code }}</span>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="标题/名称" min-width="220" show-overflow-tooltip />
        <el-table-column prop="detail" label="内容摘要" min-width="200" show-overflow-tooltip />
      </el-table>
      <el-pagination
        v-model:current-page="missingPage"
        :page-size="missingPageSize"
        :total="missingTotal"
        layout="prev, pager, next, jumper"
        class="pagination"
        @current-change="onPageChange"
      />
    </div>
  </div>
</template>

<style scoped>
.vectors {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.page-header h2 {
  margin: 0 0 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.page-header .hint {
  margin: 0 0 8px;
  color: #666;
  font-size: 13px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}
.stat-card {
  border-radius: 8px;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-label {
  font-weight: 600;
  font-size: 15px;
}
.card-table {
  font-size: 11px;
  color: #999;
  font-family: ui-monospace, Consolas, monospace;
}
.card-big {
  font-size: 30px;
  font-weight: 700;
  color: #303133;
  margin: 8px 0 6px;
  font-family: 'SF Mono', Consolas, monospace;
}
.card-slash {
  font-size: 15px;
  color: #999;
  font-weight: 400;
}
.progress {
  height: 8px;
  background: #f5f7fa;
  border-radius: 4px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #409eff, #66b1ff);
  border-radius: 4px;
  transition: width 0.4s ease;
}
.card-meta {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.card-note {
  margin-top: 4px;
  font-size: 11px;
  color: #999;
  line-height: 1.5;
}
.total-line {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.section {
  background: #fff;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 12px 14px;
}
.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  margin-bottom: 10px;
  flex-wrap: wrap;
  gap: 8px;
}
.title-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.map-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.map-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.map-title {
  font-weight: 600;
  font-size: 15px;
}
.map-help {
  color: #999;
  cursor: help;
  font-size: 14px;
  vertical-align: -2px;
}
.map-help-content {
  max-width: 340px;
  line-height: 1.8;
  color: #fff;
}
.map-count {
  margin-left: auto;
  font-size: 12px;
  color: #999;
}
.map-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}
.map-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 8px;
  margin-top: 2px;
  border-top: 1px dashed var(--el-border-color-lighter);
}
.ctrl-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.scatter {
  width: 100%;
  height: 460px;
}
.empty-state {
  text-align: center;
  color: #999;
  padding: 32px;
}
.pagination {
  margin-top: 14px;
  justify-content: flex-end;
  display: flex;
}
</style>
