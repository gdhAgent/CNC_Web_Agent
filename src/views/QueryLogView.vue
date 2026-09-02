<script setup lang="ts">
/**
 * QueryLogView —— 查询日志 / 检索过程浏览页 *
 * 单独页面，类似"日志检索"：列出历史问答，可筛可翻页，
 * 点「查看检索过程」跳到 /trace/:traceId 排查页（按 Agent 调用顺序展示）。
 *
 * 后端契约：GET /api/logs?refused=&route=&feedback=&from_time=&to_time=&limit=&offset=
 */
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search, Refresh, View, Filter } from '@element-plus/icons-vue'
import http, { errMessage } from '@/api/http'
import type { LogItem, LogListResponse } from '@/types'

const router = useRouter()

const items = ref<LogItem[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)

const filters = reactive({
  route: '',
  refused: '',
  feedback: '',
  from_time: '',
  to_time: '',
  q: '',
})

const routeZh: Record<string, string> = {
  exact_code: '报警码精确短路',
  hybrid: '混合检索',
  agent: 'Agent 工具路由',
  rag_fallback: '纯 RAG（降级）',
  refused: '拒答',
}

async function loadList() {
  loading.value = true
  try {
    const resp = await http.get<LogListResponse>('/logs', {
      params: {
        route: filters.route || undefined,
        refused: filters.refused === '' ? undefined : filters.refused,
        feedback: filters.feedback === '' ? undefined : filters.feedback,
        from_time: filters.from_time || undefined,
        to_time: filters.to_time || undefined,
        q: filters.q || undefined,
        limit: pageSize.value,
        offset: (page.value - 1) * pageSize.value,
      },
    })
    items.value = resp.data.items
    total.value = resp.data.total
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  loadList()
}

function reset() {
  Object.assign(filters, { route: '', refused: '', feedback: '', from_time: '', to_time: '', q: '' })
  page.value = 1
  loadList()
}

function openTrace(row: LogItem) {
  router.push(`/trace/${row.trace_id}`)
}

function fmtDate(s?: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

onMounted(loadList)
</script>

<template>
  <div class="qlog">
    <div class="page-header">
      <h2>📜 查询日志 / 检索过程</h2>
      <p class="hint">查看历史问答的检索排查过程（点击「查看检索过程」进入按 Agent 调用顺序展示的排查页）</p>
    </div>

    <!-- 筛选 -->
    <el-card shadow="never" class="filter-card">
      <el-form inline>
        <el-form-item label="关键词">
          <el-input
            v-model="filters.q"
            placeholder="问题内容包含"
            style="width: 160px"
            clearable
            @keyup.enter="search"
          />
        </el-form-item>
        <el-form-item label="路由">
          <el-select v-model="filters.route" clearable placeholder="全部" style="width: 150px">
            <el-option v-for="(label, v) in routeZh" :key="v" :label="label" :value="v" />
          </el-select>
        </el-form-item>
        <el-form-item label="拒答">
          <el-select v-model="filters.refused" clearable placeholder="全部" style="width: 100px">
            <el-option value="true" label="是" />
            <el-option value="false" label="否" />
          </el-select>
        </el-form-item>
        <el-form-item label="评价">
          <el-select v-model="filters.feedback" clearable placeholder="全部" style="width: 120px">
            <el-option value="1" label="👍 有用" />
            <el-option value="-1" label="👎 不准" />
            <el-option value="any" label="有评价" />
          </el-select>
        </el-form-item>
        <el-form-item label="时间">
          <el-date-picker
            v-model="filters.from_time"
            type="datetime"
            placeholder="起"
            style="width: 170px"
            value-format="YYYY-MM-DDTHH:mm:ss"
          />
          <span style="margin: 0 6px">~</span>
          <el-date-picker
            v-model="filters.to_time"
            type="datetime"
            placeholder="止"
            style="width: 170px"
            value-format="YYYY-MM-DDTHH:mm:ss"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="search">查询</el-button>
          <el-button :icon="Filter" @click="reset">重置</el-button>
          <el-button :icon="Refresh" :loading="loading" @click="loadList">刷新</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 列表 -->
    <div class="section">
      <div class="section-title">📋 历史查询（共 {{ total }} 条）</div>
      <el-table :data="items" v-loading="loading" size="small" stripe>
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ fmtDate(row.created_at) }}</template>
        </el-table-column>
        <el-table-column prop="raw_query" label="问题" min-width="240" show-overflow-tooltip />
        <el-table-column label="路由" width="150">
          <template #default="{ row }">
            <el-tag size="small" :type="row.refused ? 'danger' : 'info'">
              {{ routeZh[row.route] ?? row.route }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="耗时" width="90">
          <template #default="{ row }">
            <span v-if="row.latency_ms != null">{{ row.latency_ms }}ms</span>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="评价" width="80">
          <template #default="{ row }">
            <span v-if="row.feedback === 1">👍</span>
            <span v-else-if="row.feedback === -1">👎</span>
            <span v-else style="color: #ccc">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" text :icon="View" @click="openTrace(row)">
              查看检索过程
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!items.length && !loading" description="暂无查询记录" />
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next, jumper"
        class="pagination"
        @current-change="loadList"
      />
    </div>
  </div>
</template>

<style scoped>
.qlog {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.page-header h2 {
  margin: 0 0 4px;
}
.page-header .hint {
  margin: 0 0 8px;
  color: #666;
  font-size: 13px;
}
.filter-card :deep(.el-form) {
  display: flex;
  flex-wrap: wrap;
  gap: 0 18px;
}
.filter-card :deep(.el-form-item) {
  margin-right: 0;
  margin-bottom: 12px;
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
}
.pagination {
  margin-top: 14px;
  justify-content: flex-end;
  display: flex;
}
</style>
