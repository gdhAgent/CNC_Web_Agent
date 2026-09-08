<script setup lang="ts">
/**
 * TermDictView —— 工业术语词典管理
 * CRUD + 从查询日志 / 报警码自动挖掘候选词
 * 后端：/api/term-dict + /api/term-mine/*
 *
 * 用途：影响 SimpleTokenizer 分词时哪些工业术语"整词保留不被切碎为 bigram"。
 * 修改后无需重启服务，后端 tokenize.Reload() 热生效。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import http, { errMessage } from '@/api/http'

interface TermRow {
  id: number
  canonical: string
  synonyms: string[]
  scope: string
  _edit?: boolean
  _synonymsText?: string
}

interface MineRow {
  ngram: string
  frequency: number
  doc_count: number
  synonym_candidates: string[]
  already_in_dict: boolean
  _checked?: boolean
  _synonymsText?: string
}

// ===== 列表（服务端分页） =====
const rows = ref<TermRow[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const filterKeyword = ref('')
const filterScope = ref('')
const allScopes = ref<string[]>(['cnc', 'general'])

async function fetchList() {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      page_size: String(pageSize.value),
    })
    if (filterKeyword.value.trim()) params.set('keyword', filterKeyword.value.trim())
    if (filterScope.value) params.set('scope', filterScope.value)
    const data = (await http.get<{ items: TermRow[]; total: number; page: number; page_size: number }>(
      `/term-dict?${params.toString()}`
    )).data
    rows.value = data.items
    total.value = data.total
  } catch (e) {
    ElMessage.error('加载失败：' + errMessage(e))
  } finally {
    loading.value = false
  }
}

watch(filterKeyword, () => { page.value = 1; fetchList() })
watch(filterScope, () => { page.value = 1; fetchList() })
watch(pageSize, () => { page.value = 1; fetchList() })
watch(page, fetchList)

// ===== 新增（顶部行内） =====
const creating = ref(false)
const newRow = reactive<{ canonical: string; _synonymsText: string; scope: string }>({
  canonical: '',
  _synonymsText: '',
  scope: 'cnc',
})

async function onCreate() {
  if (!newRow.canonical.trim()) {
    ElMessage.warning('请输入 canonical')
    return
  }
  creating.value = true
  try {
    const syns = newRow._synonymsText.split(/[,，]/).map(s => s.trim()).filter(Boolean)
    await http.post('/term-dict', {
      canonical: newRow.canonical.trim(),
      synonyms: syns,
      scope: newRow.scope.trim() || 'cnc',
    })
    ElMessage.success('已创建并热重载')
    newRow.canonical = ''
    newRow._synonymsText = ''
    page.value = 1
    await fetchList()
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    creating.value = false
  }
}

// ===== 编辑 / 删除单条 =====
function onEdit(row: TermRow) {
  row._edit = true
  row._synonymsText = row.synonyms.join(', ')
}

async function onSave(row: TermRow) {
  try {
    const syns = (row._synonymsText ?? '')
      .split(/[,，]/)
      .map(s => s.trim())
      .filter(Boolean)
    await http.put(`/term-dict/${row.id}`, {
      canonical: row.canonical,
      synonyms: syns,
      scope: row.scope,
    })
    row._edit = false
    row.synonyms = syns
    ElMessage.success('已保存并热重载')
  } catch (e) {
    ElMessage.error(errMessage(e))
  }
}

async function onDelete(row: TermRow) {
  try {
    await ElMessageBox.confirm(`确认删除「${row.canonical}」？`, '提示', { type: 'warning' })
    await http.delete(`/term-dict/${row.id}`)
    ElMessage.success('已删除并热重载')
    await fetchList()
  } catch (e: any) {
    if (e === 'cancel') return
    ElMessage.error(errMessage(e))
  }
}

// ===== 批量删除（单次请求，不再逐条） =====
const selectedIds = ref<number[]>([])
const batchDeleting = ref(false)
function onSelectionChange(rs: TermRow[]) {
  selectedIds.value = rs.map(r => r.id)
}

async function onBatchDelete() {
  if (selectedIds.value.length === 0) {
    ElMessage.warning('请先勾选要删除的术语')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认删除已勾选的 ${selectedIds.value.length} 条术语？此操作不可撤销。`,
      '批量删除',
      { type: 'warning' }
    )
  } catch (e) {
    if (e === 'cancel') return
    throw e
  }
  batchDeleting.value = true
  try {
    const r = (await http.post<{ deleted: number }>('/term-dict/batch-delete', {
      ids: selectedIds.value,
    })).data
    ElMessage.success(`已删除 ${r.deleted} 条`)
    selectedIds.value = []
    await fetchList()
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    batchDeleting.value = false
  }
}

// ===== 挖掘 =====
const mining = ref<'' | 'query_logs' | 'alarms'>('')
const bulkInserting = ref(false)
const mineDrawer = ref(false)
const mineRows = ref<MineRow[]>([])
const mineScope = ref('cnc')

async function onMine(source: 'query_logs' | 'alarms') {
  mining.value = source
  try {
    const path = source === 'query_logs'
      ? '/term-mine/query-logs?days=30&min_freq=2&max_gram=3&limit=200'
      : '/term-mine/alarms?min_freq=2&max_gram=3&limit=200'
    const data = (await http.get<{ items: MineRow[] }>(path)).data
    const sorted = [...data.items].filter(x => !x.already_in_dict)
    sorted.forEach((r, i) => {
      r._checked = i < 30
      // 默认填入后端算出的共现同义词候选（可编辑）
      r._synonymsText = (r.synonym_candidates ?? []).join(', ')
    })
    mineRows.value = sorted
    mineDrawer.value = true
    if (mineRows.value.length === 0) ElMessage.info('没有新候选词')
    else ElMessage.success(`挖到 ${mineRows.value.length} 个候选词，默认勾选前 30 个`)
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    mining.value = ''
  }
}

const selectedMineCount = computed(() => mineRows.value.filter(r => r._checked).length)

function selectAllMine(v: boolean) {
  mineRows.value.forEach(r => (r._checked = v))
}

async function onBulkInsert() {
  const picked = mineRows.value.filter(r => r._checked && r.ngram.trim())
  if (picked.length === 0) {
    ElMessage.warning('请至少勾选一条')
    return
  }
  bulkInserting.value = true
  try {
    const items = picked.map(r => ({
      canonical: r.ngram.trim(),
      synonyms: (r._synonymsText ?? '')
        .split(/[,，]/)
        .map(s => s.trim())
        .filter(Boolean),
      scope: mineScope.value,
    }))
    const r = (await http.post<{ inserted: number; skipped: number }>('/term-dict/bulk', { items })).data
    ElMessage.success(`已加入 ${r.inserted} 条（跳过 ${r.skipped} 条）`)
    mineDrawer.value = false
    await fetchList()
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    bulkInserting.value = false
  }
}

async function onReload() {
  try {
    await http.post('/term-dict/reload')
    ElMessage.success('已重载')
  } catch (e) {
    ElMessage.error(errMessage(e))
  }
}

onMounted(fetchList)
</script>

<template>
  <div class="term-dict">
    <el-alert type="info" :closable="false" show-icon class="hint">
      <template #title>工业术语词典（kb.term_dict）</template>
      <div class="hint-body">
        决定 <b>SimpleTokenizer 分词时哪些词"整词保留不被切碎为 bigram"</b>。
        例：「主轴电机」默认会被切成「主轴」+「轴电」+「电机」，加入此词典后「主轴」/「主轴电机」都会作为整词命中，
        提升全文检索召回率。<br>
        <span class="hint-sub">写后自动热重载（<code>tokenizer.Reload()</code>），无需重启服务。</span>
      </div>
    </el-alert>

    <!-- 新增行（顶部） -->
    <el-card class="new-row-card">
      <div class="new-row">
        <span class="new-label">新增术语</span>
        <el-input v-model="newRow.canonical" placeholder="标准词（必填）" style="width: 200px" size="default" />
        <el-input v-model="newRow._synonymsText" placeholder="同义词，逗号分隔（可空）" style="width: 320px" size="default" />
        <el-input v-model="newRow.scope" placeholder="scope" style="width: 120px" size="default" />
        <el-button type="primary" :loading="creating" @click="onCreate">新增</el-button>
      </div>
    </el-card>

    <!-- 工具栏 -->
    <el-card>
      <div class="toolbar">
        <div class="filters">
          <el-input
            v-model="filterKeyword"
            placeholder="搜索 canonical 或 synonym"
            clearable
            style="width: 260px"
          />
          <el-select v-model="filterScope" placeholder="scope" clearable style="width: 140px">
            <el-option v-for="s in allScopes" :key="s" :label="s" :value="s" />
          </el-select>
        </div>
        <div class="actions">
          <el-button
            type="danger"
            :disabled="selectedIds.length === 0"
            :loading="batchDeleting"
            @click="onBatchDelete"
          >
            <el-icon style="vertical-align: -2px"><Delete /></el-icon>
            批量删除 {{ selectedIds.length > 0 ? `（${selectedIds.length}）` : '' }}
          </el-button>
          <el-button :loading="mining === 'query_logs'" @click="onMine('query_logs')">
            从查询日志挖掘
          </el-button>
          <el-button :loading="mining === 'alarms'" @click="onMine('alarms')">
            从报警码挖掘
          </el-button>
          <el-button @click="onReload">热重载</el-button>
        </div>
      </div>

      <el-table
        :data="rows"
        v-loading="loading"
        stripe
        empty-text="无匹配术语"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="标准词（canonical）" min-width="160">
          <template #default="{ row }">
            <el-input v-if="row._edit" v-model="row.canonical" size="small" />
            <span v-else class="cell-canon">{{ row.canonical }}</span>
          </template>
        </el-table-column>
        <el-table-column label="同义词（synonyms，逗号分隔）" min-width="240">
          <template #default="{ row }">
            <el-input v-if="row._edit" v-model="row._synonymsText" size="small" placeholder="例：spindle, SP" />
            <span v-else class="cell-syns">
              <el-tag
                v-for="s in row.synonyms"
                :key="s"
                size="small"
                type="info"
                effect="plain"
                class="syn-tag"
              >{{ s }}</el-tag>
              <span v-if="row.synonyms.length === 0" class="muted">—</span>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="scope" width="100">
          <template #default="{ row }">
            <el-input v-if="row._edit" v-model="row.scope" size="small" />
            <el-tag v-else size="small" effect="plain">{{ row.scope }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <template v-if="row._edit">
              <el-button size="small" type="primary" @click="onSave(row)">保存</el-button>
              <el-button size="small" @click="row._edit = false">取消</el-button>
            </template>
            <template v-else>
              <el-button size="small" @click="onEdit(row)">编辑</el-button>
              <el-button size="small" type="danger" @click="onDelete(row)">删除</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100, 200]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          background
        />
      </div>
    </el-card>

    <!-- 挖掘抽屉 -->
    <el-drawer v-model="mineDrawer" title="候选术语（从语料挖掘）" size="760px">
      <el-alert type="info" :closable="false" show-icon class="hint">
        <template #title>挖掘说明</template>
        <div class="hint-body">
          已过滤停用词 + 词典已收录词。<b>勾选</b>要加入的词，<b>可填同义词</b>（可不填）。默认按出现文档数降序，前 30 项自动勾选。
        </div>
      </el-alert>
      <div class="mine-toolbar">
        <el-checkbox :model-value="mineRows.every(r => r._checked)" @change="selectAllMine(($event as unknown) as boolean)">
          全选 / 反选（已勾选 {{ selectedMineCount }} / {{ mineRows.length }}）
        </el-checkbox>
        <span class="grow" />
        scope：
        <el-input v-model="mineScope" size="small" style="width: 140px" />
      </div>
      <el-table :data="mineRows" max-height="60vh">
        <el-table-column width="48">
          <template #default="{ row }">
            <el-checkbox v-model="row._checked" />
          </template>
        </el-table-column>
        <el-table-column prop="ngram" label="候选词" min-width="140" />
        <el-table-column prop="frequency" label="频次" width="70" />
        <el-table-column prop="doc_count" label="文档数" width="80" />
        <el-table-column label="同义词（可填，默认填入共现候选）" min-width="260">
          <template #default="{ row }">
            <el-input v-model="row._synonymsText" size="small" placeholder="逗号分隔，可改可删" />
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="mineDrawer = false">关闭</el-button>
        <el-button type="primary" :loading="bulkInserting" @click="onBulkInsert">
          加入已勾选的 {{ selectedMineCount }} 条
        </el-button>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.term-dict {
  padding: 16px;
}
.hint {
  margin-bottom: 16px;
}
.hint-body {
  font-size: 13px;
  line-height: 1.6;
}
.hint-sub {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.new-row-card {
  margin-bottom: 16px;
}
.new-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.new-label {
  font-weight: 600;
  margin-right: 4px;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}
.filters {
  display: flex;
  gap: 8px;
  align-items: center;
}
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.cell-canon {
  font-weight: 600;
}
.cell-syns .syn-tag {
  margin-right: 4px;
  margin-bottom: 2px;
}
.muted {
  color: var(--el-text-color-placeholder);
}
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.mine-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
}
.grow {
  flex: 1;
}
</style>
