<script setup lang="ts">
/**
 * EntriesTab —— 已录入条目管理（V1.5 B：报警码 + FAQ 统一列表）
 * 按类型 / 来源 / 关键字筛选；可「重新向量化」「删除」
 * 后端：GET /api/knowledge/entries · DELETE /api/knowledge/entry/{type}/{id}
 *        · POST /api/knowledge/entry/{type}/{id}/re-vectorize
 */
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Refresh, Search, VideoPlay } from '@element-plus/icons-vue'
import http, { errMessage } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import type { EntryListItem } from '@/types'

const auth = useAuthStore()

const ORIGIN_LABEL: Record<string, string> = {
  ingest: '自动入库',
  manual: '手工录入',
  feedback: '反馈补录',
}

const TYPE_LABEL: Record<string, string> = { alarm: '报警码', faq: 'FAQ' }

const loading = ref(false)
const items = ref<EntryListItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filters = reactive({ type: '', origin: '', q: '' })

async function load() {
  loading.value = true
  try {
    const resp = await http.get<{ total: number; items: EntryListItem[] }>('/knowledge/entries', {
      params: {
        type: filters.type || undefined,
        origin: filters.origin || undefined,
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
  load()
}

function canDelete(item: EntryListItem): boolean {
  return auth.canDoAction('entry', item.type === 'alarm' ? 'alarms.delete' : 'faqs.delete')
}

function canReVectorize(item: EntryListItem): boolean {
  return auth.canDoAction('entry', item.type === 'alarm' ? 'alarms.edit' : 'faqs.edit')
}

async function remove(item: EntryListItem) {
  if (!canDelete(item)) {
    ElMessage.warning('当前角色无删除权限')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定删除这条${TYPE_LABEL[item.type]}「${item.title}」？\n将同时删除其向量与全文索引，关联建议将回到待审核。`,
      '删除条目',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' },
    )
  } catch {
    return
  }
  try {
    await http.delete(`/knowledge/entry/${item.type}/${item.id}`)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    ElMessage.error(errMessage(e))
  }
}

async function reVectorize(item: EntryListItem) {
  if (!canReVectorize(item)) {
    ElMessage.warning('当前角色无此权限')
    return
  }
  try {
    const resp = await http.post<{ vectorized: boolean }>(`/knowledge/entry/${item.type}/${item.id}/re-vectorize`)
    ElMessage.success(resp.data.vectorized ? '已重新向量化' : '向量化失败，请查看后端日志')
    await load()
  } catch (e) {
    ElMessage.error(errMessage(e))
  }
}

onMounted(load)
</script>

<template>
  <div class="entries-tab">
    <el-alert type="info" :closable="false" show-icon class="guide">
      <template #title>报警码 / FAQ 条目统一管理</template>
      删除会同时清掉该条目的全文索引与向量（同一行数据），审核来源的关联建议自动回到待审核；
      「重新向量化」用于向量不准 / 内容已编辑时按库内内容重算。
    </el-alert>

    <!-- 工具栏 -->
    <div class="toolbar">
      <el-select v-model="filters.type" placeholder="全部类型" clearable style="width: 130px" @change="search">
        <el-option label="报警码" value="alarm" />
        <el-option label="FAQ" value="faq" />
      </el-select>
      <el-select v-model="filters.origin" placeholder="全部来源" clearable style="width: 140px" @change="search">
        <el-option v-for="(label, v) in ORIGIN_LABEL" :key="v" :label="label" :value="v" />
      </el-select>
      <el-input
        v-model="filters.q"
        placeholder="关键字（码/名/标题/正文）"
        clearable
        style="width: 220px"
        @keyup.enter="search"
        @clear="search"
      />
      <el-button type="primary" :icon="Search" @click="search">查询</el-button>
      <div class="spacer" />
      <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
    </div>

    <!-- 列表 -->
    <el-table :data="items" v-loading="loading" size="small" stripe>
      <el-table-column label="类型" width="80">
        <template #default="{ row }">
          <el-tag size="small" :type="row.type === 'alarm' ? 'warning' : 'primary'">
            {{ TYPE_LABEL[row.type] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="title" label="标题" min-width="260" show-overflow-tooltip />
      <el-table-column label="来源" width="110">
        <template #default="{ row }">
          <el-tag size="small" effect="plain">{{ ORIGIN_LABEL[row.origin] ?? row.origin }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="向量" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="row.vectorized ? 'success' : 'info'">
            {{ row.vectorized ? '已向量化' : '未向量化' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="created_by" label="录入人" width="90" />
      <el-table-column label="创建时间" width="160">
        <template #default="{ row }">
          {{ row.created_at ? new Date(row.created_at).toLocaleString() : '—' }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-tooltip content="重新向量化" placement="top">
            <el-button
              size="small"
              type="warning"
              text
              :icon="VideoPlay"
              :disabled="!canReVectorize(row)"
              @click="reVectorize(row)"
            />
          </el-tooltip>
          <el-tooltip content="删除（清向量+索引）" placement="top">
            <el-button
              size="small"
              type="danger"
              text
              :icon="Delete"
              :disabled="!canDelete(row)"
              @click="remove(row)"
            />
          </el-tooltip>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="load"
        @size-change="search"
      />
    </div>
  </div>
</template>

<style scoped>
.entries-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.guide {
  line-height: 1.7;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.spacer {
  flex: 1;
}

.pager {
  display: flex;
  justify-content: flex-end;
}
</style>
