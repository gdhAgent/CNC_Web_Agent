<script setup lang="ts">
/**
 * DashboardView.vue —— 高频故障 Top-N 看板
 *
 * 后端契约：GET /api/stats/top-faults
 *   ?days=30&top_n=20
 *   ?from_time=2026-01-01T00:00:00&to_time=2026-12-31T23:59:59
 *
 * 视图要点：
 * - 时间窗口筛选（7/30/90/自定义） + TopN（10/20/50）
 * - 概要卡片：窗口内总查询数 / 总工单数
 * - 双源对比柱状图（CSS 实现，避免 ECharts 依赖）
 * - 双表（查询侧 / 工单侧）：code / 名称 / 严重度 / 频次 / 最近出现
 * - 空态 / loading / 错误三态
 */
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh, Histogram, DataLine, Warning } from '@element-plus/icons-vue'
import http, { errMessage } from '@/api/http'
import type { TopFaultsResponse } from '@/types'

const router = useRouter()

const days = ref<number>(30)
const topN = ref<number>(20)
const loading = ref(false)
const data = ref<TopFaultsResponse | null>(null)

const presets = [
  { label: '近 7 天', value: 7 },
  { label: '近 30 天', value: 30 },
  { label: '近 90 天', value: 90 },
]

async function fetchData() {
  loading.value = true
  try {
    const resp = await http.get<TopFaultsResponse>('/stats/top-faults', {
      params: { days: days.value, top_n: topN.value },
    })
    data.value = resp.data
  } catch (e) {
    ElMessage.error(errMessage(e))
    data.value = null
  } finally {
    loading.value = false
  }
}

onMounted(fetchData)

// 柱状图归一化基准：双源各自取最大值
const queryMax = computed(() =>
  data.value?.by_query.reduce((m, it) => Math.max(m, it.count), 0) ?? 0,
)
const maintMax = computed(() =>
  data.value?.by_maintenance.reduce((m, it) => Math.max(m, it.count), 0) ?? 0,
)

const severityTag = (sev?: string | null) => {
  const s = sev || 'unknown'
  const map: Record<string, string> = {
    info: 'info',
    warning: 'warning',
    fault: 'danger',
    fatal: 'danger',
    unknown: 'info',
  }
  return map[s] || 'info'
}
const severityLabel = (sev?: string | null) => {
  const s = sev || 'unknown'
  const map: Record<string, string> = {
    info: '提示',
    warning: '警告',
    fault: '故障',
    fatal: '严重',
    unknown: '未知',
  }
  return map[s] || s
}

function fmtDate(s?: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

const windowLabel = computed(() => {
  if (!data.value) return '—'
  const w = data.value.window
  if (w.days) return `近 ${w.days} 天`
  if (w.from_time) {
    return `${fmtDate(w.from_time)} ~ ${fmtDate(w.to_time)}`
  }
  return `截至 ${fmtDate(w.to_time)}`
})

// 头部「查看工单」：带当前窗口 from/to，跳过去与「窗口内维修工单」口径一致
function goWorkorders() {
  const w = data.value?.window
  const p = new URLSearchParams()
  if (w?.from_time) p.set('from_time', w.from_time)
  if (w?.to_time) p.set('to_time', w.to_time)
  const qs = p.toString()
  router.push(qs ? `/workorders?${qs}` : '/workorders')
}
</script>

<template>
  <div class="dashboard">
    <header class="page-header">
      <h2>
        <el-icon><Histogram /></el-icon>
        高频故障看板
      </h2>
      <p class="hint">按报警码聚合"查询侧（用户问过什么）"和"工单侧（历史上维修过什么）"，辅助知识补录优先级排序</p>
    </header>

    <!-- 筛选栏 -->
    <el-card class="filter-bar" shadow="never">
      <el-form inline>
        <el-form-item label="时间窗口">
          <el-radio-group v-model="days" @change="fetchData">
            <el-radio-button v-for="p in presets" :key="p.value" :value="p.value">
              {{ p.label }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="TopN">
          <el-select v-model="topN" style="width: 100px" @change="fetchData">
            <el-option :value="10" label="Top 10" />
            <el-option :value="20" label="Top 20" />
            <el-option :value="50" label="Top 50" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button :icon="Refresh" :loading="loading" @click="fetchData">刷新</el-button>
        </el-form-item>
        <el-form-item>
          <span class="window-label">窗口：{{ windowLabel }}</span>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 概要卡片 -->
    <div v-if="data" class="summary-cards">
      <el-card shadow="hover" class="summary-card">
        <div class="summary-label">
          <el-icon><DataLine /></el-icon>
          窗口内查询日志
        </div>
        <div class="summary-value">{{ data.total_query_logs }}</div>
        <div class="summary-sub">总条数（含拒答）</div>
      </el-card>
      <el-card shadow="hover" class="summary-card">
        <div class="summary-label">
          <el-icon><Warning /></el-icon>
          窗口内维修工单
        </div>
        <div class="summary-value">{{ data.total_maintenance_logs }}</div>
        <div class="summary-sub">总条数</div>
      </el-card>
      <el-card shadow="hover" class="summary-card">
        <div class="summary-label">查询 Top1</div>
        <div class="summary-value">
          {{ data.by_query[0]?.code_norm || '—' }}
        </div>
        <div class="summary-sub">
          {{ data.by_query[0]?.name || '无名称' }}
        </div>
      </el-card>
      <el-card shadow="hover" class="summary-card">
        <div class="summary-label">工单 Top1</div>
        <div class="summary-value">
          {{ data.by_maintenance[0]?.code_norm || '—' }}
        </div>
        <div class="summary-sub">
          {{ data.by_maintenance[0]?.name || '无名称' }}
        </div>
      </el-card>
    </div>

    <!-- 双源柱状图 -->
    <div v-if="data" class="charts">
      <el-card shadow="never">
        <template #header>
          <span class="chart-title">📊 查询侧 TopN（{{ data.by_query.length }} 条）</span>
        </template>
        <div v-if="data.by_query.length === 0" class="empty-state">
          窗口内无查询日志
        </div>
        <div v-else class="bar-chart">
          <div v-for="(it, idx) in data.by_query" :key="`q-${it.code_norm}`" class="bar-row">
            <span class="bar-rank">#{{ idx + 1 }}</span>
            <span class="bar-code">{{ it.code_norm }}</span>
            <span class="bar-name">{{ it.name || '—' }}</span>
            <div class="bar-track">
              <div
                class="bar-fill bar-fill-query"
                :style="{ width: queryMax > 0 ? (it.count / queryMax * 100) + '%' : '0%' }"
              >
                {{ it.count }}
              </div>
            </div>
          </div>
        </div>
      </el-card>

      <el-card shadow="never">
        <template #header>
          <div class="card-header">
            <span class="chart-title">🔧 工单侧 TopN（{{ data.by_maintenance.length }} 条）</span>
            <el-button size="small" type="primary" text @click="goWorkorders">
              查看工单 →
            </el-button>
          </div>
        </template>
        <div v-if="data.by_maintenance.length === 0" class="empty-state">
          窗口内无工单记录
        </div>
        <div v-else class="bar-chart">
          <div v-for="(it, idx) in data.by_maintenance" :key="`m-${it.code_norm}`" class="bar-row">
            <span class="bar-rank">#{{ idx + 1 }}</span>
            <span class="bar-code">{{ it.code_norm }}</span>
            <span class="bar-name">{{ it.name || '—' }}</span>
            <RouterLink
              :to="`/workorders?alarm_code=${it.code_norm}${data.window.from_time ? `&from_time=${encodeURIComponent(data.window.from_time)}&to_time=${encodeURIComponent(data.window.to_time)}` : ''}`"
              class="bar-link"
              :title="data.window.from_time ? `窗口 ${data.window.from_time} ~ ${data.window.to_time}` : '全部历史'"
            >
              {{ it.count }} 单 →
            </RouterLink>
            <div class="bar-track">
              <div
                class="bar-fill bar-fill-maint"
                :style="{ width: maintMax > 0 ? (it.count / maintMax * 100) + '%' : '0%' }"
              >
                {{ it.count }}
              </div>
            </div>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 详细表格 -->
    <div v-if="data" class="detail-tables">
      <el-card shadow="never">
        <template #header>
          <span class="chart-title">📋 查询侧明细</span>
        </template>
        <el-table :data="data.by_query" stripe size="small">
          <el-table-column prop="code_norm" label="报警码" width="120" />
          <el-table-column prop="name" label="名称" min-width="180">
            <template #default="{ row }">
              {{ row.name || '—' }}
            </template>
          </el-table-column>
          <el-table-column prop="severity" label="严重度" width="100">
            <template #default="{ row }">
              <el-tag :type="severityTag(row.severity) as 'info' | 'warning' | 'danger'" size="small">
                {{ severityLabel(row.severity) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="brand" label="品牌" width="100" />
          <el-table-column prop="count" label="查询次数" width="100" sortable />
          <el-table-column prop="last_seen_at" label="最近出现" width="180">
            <template #default="{ row }">
              {{ fmtDate(row.last_seen_at) }}
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card shadow="never" style="margin-top: 16px">
        <template #header>
          <span class="chart-title">📋 工单侧明细</span>
        </template>
        <el-table :data="data.by_maintenance" stripe size="small">
          <el-table-column prop="code_norm" label="报警码" width="120" />
          <el-table-column prop="name" label="名称" min-width="180">
            <template #default="{ row }">
              {{ row.name || '—' }}
            </template>
          </el-table-column>
          <el-table-column prop="severity" label="严重度" width="100">
            <template #default="{ row }">
              <el-tag :type="severityTag(row.severity) as 'info' | 'warning' | 'danger'" size="small">
                {{ severityLabel(row.severity) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="brand" label="品牌" width="100" />
          <el-table-column prop="count" label="工单数" width="100" sortable />
          <el-table-column prop="last_seen_at" label="最近发生" width="180">
            <template #default="{ row }">
              {{ fmtDate(row.last_seen_at) }}
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>

    <div v-if="!data && !loading" class="empty-state">
      暂无数据，点击"刷新"加载
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}
.page-header h2 {
  margin: 0 0 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.page-header .hint {
  margin: 0 0 16px;
  color: #666;
  font-size: 13px;
}
.filter-bar :deep(.el-form-item) {
  margin-bottom: 0;
}
.window-label {
  color: #666;
  font-size: 13px;
}
.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin: 16px 0;
}
.summary-card {
  text-align: center;
}
.summary-label {
  color: #888;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.summary-value {
  font-size: 28px;
  font-weight: 600;
  color: #303133;
  margin: 8px 0 4px;
  font-family: 'SF Mono', Consolas, monospace;
}
.summary-sub {
  color: #999;
  font-size: 12px;
}
.charts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}
@media (max-width: 1000px) {
  .charts { grid-template-columns: 1fr; }
}
.chart-title {
  font-weight: 600;
}
.bar-chart {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 500px;
  overflow-y: auto;
}
.bar-row {
  display: grid;
  grid-template-columns: 36px 80px 1fr 200px;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.bar-rank {
  color: #999;
  font-family: monospace;
  text-align: right;
}
.bar-code {
  font-family: monospace;
  font-weight: 600;
  color: #303133;
}
.bar-name {
  color: #606266;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bar-track {
  height: 22px;
  background: #f5f7fa;
  border-radius: 4px;
  position: relative;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 8px;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  border-radius: 4px;
  transition: width 0.3s ease;
  min-width: 24px;
}
.bar-fill-query {
  background: linear-gradient(90deg, #409eff, #66b1ff);
}
.bar-fill-maint {
  background: linear-gradient(90deg, #e6a23c, #ebb563);
}
.empty-state {
  text-align: center;
  color: #999;
  padding: 32px;
}
</style>