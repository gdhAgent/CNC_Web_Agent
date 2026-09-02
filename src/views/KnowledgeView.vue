<script setup lang="ts">
/**
 * KnowledgeView —— 知识库管理 *
 * 上传（拖拽，md/pdf/txt，可同步解析）+ 文档列表 + 解析状态轮询 + 删除
 * + 导入历史（Excel 批量导入的 kb.import_jobs）
 * + 字段说明（doc_type / 同步解析 tooltip，给小白使用）
 *
 * 后端契约：
 *   POST /api/knowledge/upload
 *   GET  /api/knowledge/documents
 *   DELETE /api/knowledge/documents/{id}
 *   GET  /api/knowledge/import/jobs   ← 新增（导入历史）
 *   GET  /api/knowledge/template?type=   ← 模板下载
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UploadFilled, QuestionFilled, Download, View, Delete } from '@element-plus/icons-vue'
import type { UploadRequestOptions } from 'element-plus'

import http, { errMessage } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import type { DocumentItem, ChunkItem, DocumentChunksResponse } from '@/types'

const auth = useAuthStore()
// V1.5 F8：动作级权限（后端 knowledge 页动作码）
const canUpload = computed(() => auth.canDoAction('knowledge', 'documents.upload'))
const canDelete = computed(() => auth.canDoAction('knowledge', 'documents.delete'))
const canViewChunks = computed(() => auth.canDoAction('knowledge', 'chunks.view'))

const docs = ref<DocumentItem[]>([])
const total = ref(0)
const loading = ref(false)
const uploadSync = ref(false)
const docType = ref('manual')
const hasActive = ref(false)
const docPage = ref(1)
const docPageSize = ref(10)
let pollTimer: ReturnType<typeof setInterval> | null = null

const docTypeLabel: Record<string, string> = {
  manual: '手册',
  alarm_table: '报警码表',
  maintenance_std: '保养标准',
  sop: 'SOP',
  faq: 'FAQ',
  other: '其他',
}

// 每种 doc_type 的含义（tooltip）
const docTypeHelp: Record<string, string> = {
  manual: '设备维修手册、使用说明书（如 FANUC 0i-MF 维修手册）',
  alarm_table: '完整报警码清单（PDF / Excel 表格形式）',
  maintenance_std: '保养规范、点检表（按周期 / 部位列出）',
  sop: '标准操作流程（针对某个具体场景的逐步流程）',
  faq: '常见问题 / 工程师经验总结',
  other: '其他不适合归类的资料',
}

const statusType: Record<string, string> = {
  pending: 'info',
  parsing: 'warning',
  ready: 'success',
  failed: 'danger',
}

// ===== 导入历史（kb.import_jobs）=====

interface ImportJob {
  id: number
  job_type: string
  filename: string
  total_rows: number
  valid_rows: number
  dup_rows: number
  error_rows: number
  imported_rows: number
  vectorized: number
  status: string
  dup_strategy: string
  created_by: string | null
  created_at: string
  finished_at: string | null
}

const importJobs = ref<ImportJob[]>([])
const jobsTotal = ref(0)
const jobsPage = ref(1)
const jobsPageSize = ref(10)
const jobsLoading = ref(false)

async function loadDocs() {
  loading.value = true
  try {
    const resp = await http.get<{ total: number; items: DocumentItem[] }>('/knowledge/documents', {
      params: { limit: docPageSize.value, offset: (docPage.value - 1) * docPageSize.value },
    })
    docs.value = resp.data.items
    total.value = resp.data.total
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    loading.value = false
  }
}

async function loadImportJobs() {
  jobsLoading.value = true
  try {
    const resp = await http.get<{ total: number; items: ImportJob[] }>(
      '/knowledge/import/jobs',
      { params: { limit: jobsPageSize.value, offset: (jobsPage.value - 1) * jobsPageSize.value } },
    )
    importJobs.value = resp.data.items
    jobsTotal.value = resp.data.total
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    jobsLoading.value = false
  }
}

// ===== 文档查看（在线 chunks）=====

const chunksVisible = ref(false)
const chunksTitle = ref('')
const chunks = ref<ChunkItem[]>([])
const chunksTotal = ref(0)
const chunksPage = ref(1)
const chunksPageSize = ref(20)
const chunksLoading = ref(false)

async function openDocChunks(doc: DocumentItem) {
  chunksTitle.value = doc.title
  chunksPage.value = 1
  chunksVisible.value = true
  await loadChunks(doc.id)
}

async function loadChunks(docId: number) {
  chunksLoading.value = true
  try {
    const resp = await http.get<DocumentChunksResponse>(
      `/knowledge/documents/${docId}/chunks`,
      { params: { limit: chunksPageSize.value, offset: (chunksPage.value - 1) * chunksPageSize.value } },
    )
    chunks.value = resp.data.items
    chunksTotal.value = resp.data.total
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    chunksLoading.value = false
  }
}

function hasParsing(): boolean {
  return docs.value.some((d) => d.status === 'pending' || d.status === 'parsing')
}

function ensurePolling() {
  const need = hasParsing()
  hasActive.value = need
  if (need && !pollTimer) {
    pollTimer = setInterval(loadDocs, 3000)
  } else if (!need && pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function handleUpload(opts: UploadRequestOptions) {
  const fd = new FormData()
  fd.append('file', opts.file)
  fd.append('doc_type', docType.value)
  const title = (opts.data as { title?: string } | undefined)?.title
  if (title) fd.append('title', title)
  if (uploadSync.value) fd.append('sync', 'true')
  try {
    const resp = await http.post('/knowledge/upload', fd)
    const data = resp.data as { doc_id: number; status: string }
    ElMessage.success(
      data.status === 'ready' ? `文档 #${data.doc_id} 解析完成` : `文档 #${data.doc_id} 已加入解析队列`,
    )
    await loadDocs()
    ensurePolling()
  } catch (e) {
    ElMessage.error(errMessage(e))
  }
}

function onUploadChange() {
  ensurePolling()
}

async function removeDoc(doc: DocumentItem) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${doc.title}」？将级联删除其全部 ${doc.chunk_count} 个知识块。`,
      '删除文档',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await http.delete(`/knowledge/documents/${doc.id}`)
    ElMessage.success('已删除')
    await loadDocs()
    ensurePolling()
  } catch (e) {
    ElMessage.error(errMessage(e))
  }
}

async function downloadTemplate(type: string) {
  try {
    const resp = await http.get(`/knowledge/template`, {
      params: { type },
      responseType: 'blob',
    })
    const blob = new Blob([resp.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${type}_template.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success(`已下载 ${docTypeLabel[type] ?? type} 模板`)
  } catch (e) {
    ElMessage.error(errMessage(e))
  }
}

const jobStatusType: Record<string, string> = {
  done: 'success',
  failed: 'danger',
  importing: 'warning',
  previewing: 'info',
  validating: 'info',
  cancelled: 'info',
}
const jobTypeLabel: Record<string, string> = {
  alarm: '报警码',
  faq: 'FAQ',
  machine: '设备台账',
  maintenance: '维修工单',
}

onMounted(() => {
  loadDocs()
  loadImportJobs()
})
onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <div class="knowledge">
    <div class="page-header">
      <h2>📚 知识库文档</h2>
      <p class="hint">上传设备手册 / SOP / FAQ 等资料；解析后即可被「智能问答」检索到</p>
    </div>

    <!-- 新人引导卡 -->
    <el-alert type="info" :closable="false" class="guide-alert">
      <template #title>
        <strong>知识库是什么？</strong>
      </template>
      知识库存放所有"可以被问答系统检索到的内容"，包括上传的文档（手动解析）和录入的报警码 / FAQ。
      文档上传后会按段落自动切成小块并向量化；保存后立即可被检索。
      <span style="margin-left: 8px; color: #909399">💡 Excel 批量录入请到「<RouterLink to="/entry">知识录入</RouterLink>」页</span>
    </el-alert>

    <!-- 支持格式与自定义说明 -->
    <el-alert type="warning" :closable="false" class="guide-alert">
      <template #title>
        <strong>📂 支持的格式与自定义文档</strong>
      </template>
      <div style="line-height: 1.7">
        <strong>支持的文件格式：</strong>.md / .markdown / .pdf / .txt
        （Excel 报警码 / FAQ / 工单请到「<RouterLink to="/entry">知识录入</RouterLink>」页批量导入）
        <br />
        <strong>自定义手册能识别吗？</strong>能 —— 只要文本能抽出来就能被切成知识块、向量化、被检索。
        <ul style="margin: 4px 0 4px 16px; padding: 0">
          <li><strong>.md / .txt</strong>：直接读全文，按 # 标题切块</li>
          <li><strong>.pdf</strong>：按页抽文本（pdfplumber 库）；扫描版 PDF（图片）需要先 OCR，本系统暂不支持</li>
          <li><strong>自定义内容</strong>：只要文档内有可见文本（标题、段落、列表）就能被切块检索；专有术语可加进 <code>kb.term_dict</code> 提升命中率</li>
          <li><strong>如果你厂的文档有特殊格式</strong>：建议转成结构化 Markdown（每章用 # 标题），准确率最高</li>
        </ul>
        <strong>💡 「知识库 vs 知识录入」区别：</strong>
        <strong>知识库管</strong>长文档（手册 / SOP / FAQ PDF）→ 上传即解析；
        <strong>知识录入</strong>短结构化条目（报警码 / FAQ / 工单）→ 表单或 Excel 批量。
      </div>
    </el-alert>

    <!-- 工具栏 -->
    <el-card shadow="never" class="toolbar-card">
      <div class="toolbar">
        <span class="toolbar-label">上传新文档：</span>
        <el-tooltip
          content="这里选的是「上传文档的分类」：这台文档是一本手册 / 报警码表 / 保养标准 / SOP / FAQ…（分类只影响展示与筛选，解析都按长文档切块）"
          placement="top"
        >
          <el-select v-model="docType" size="small" style="width: 160px">
            <template #prefix>
              <el-icon style="color: #909399"><QuestionFilled /></el-icon>
            </template>
            <el-option
              v-for="(label, v) in docTypeLabel"
              :key="v"
              :label="label"
              :value="v"
            />
          </el-select>
        </el-tooltip>
        <el-tooltip
          content="同步解析会阻塞等后端解析完成（小文件 / 调试时用）；默认是后台异步解析（大文件 / 生产用）"
          placement="top"
        >
          <el-checkbox v-model="uploadSync" size="small">
            同步解析 <el-icon style="vertical-align: middle"><QuestionFilled /></el-icon>
          </el-checkbox>
        </el-tooltip>
        <el-button size="small" :loading="loading" @click="loadDocs">刷新</el-button>
        <div class="toolbar-spacer" />
        <el-tooltip
          content="这些是「知识录入」页 Excel 批量导入用的模板（短结构化条目），和左侧「上传新文档」的文档分类是两回事"
          placement="top"
        >
          <el-dropdown @command="downloadTemplate">
            <el-button size="small" :icon="Download">
              Excel 模板（知识录入）
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="alarm">报警码模板</el-dropdown-item>
                <el-dropdown-item command="faq">FAQ 模板</el-dropdown-item>
                <el-dropdown-item command="machine">设备台账模板</el-dropdown-item>
                <el-dropdown-item command="maintenance">维修工单模板</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </el-tooltip>
      </div>
    </el-card>

    <!-- 上传区 -->
    <el-upload
      class="uploader"
      drag
      multiple
      :show-file-list="false"
      accept=".md,.markdown,.pdf,.txt"
      :disabled="!canUpload"
      :http-request="handleUpload"
      :on-change="onUploadChange"
    >
      <el-icon class="upload-icon"><UploadFilled /></el-icon>
      <div class="upload-text">拖拽文件到此处，或 <em>点击上传</em></div>
      <template #tip>
        <div class="upload-tip">
          支持 Markdown / PDF / 文本（.md .markdown .pdf .txt）。Excel 批量导入请到「知识录入」页。
        </div>
      </template>
    </el-upload>

    <el-alert
      v-if="hasActive"
      type="info"
      :closable="false"
      show-icon
      title="存在解析中的文档，列表每 3 秒自动刷新"
      class="poll-hint"
    />

    <!-- 文档列表 -->
    <div class="section">
      <div class="section-title">
        <span>📄 文档列表（共 {{ total }} 篇）</span>
      </div>
      <el-table :data="docs" v-loading="loading" size="small" class="doc-table">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="标题" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <el-link type="primary" :underline="false" @click="openDocChunks(row)">
              {{ row.title }}
            </el-link>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="90">
          <template #default="{ row }">
            <el-tooltip :content="docTypeHelp[row.doc_type] || ''" placement="top">
              <el-tag size="small">{{ docTypeLabel[row.doc_type] ?? row.doc_type }}</el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="brand" label="品牌" width="100" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="(statusType[row.status] as any) ?? 'info'">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="chunk_count" label="知识块" width="80" />
        <el-table-column label="错误信息" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.status === 'failed'" class="err-msg">{{ row.error_msg }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-tooltip content="在线查看文档内容" placement="top">
              <el-button size="small" type="primary" text :icon="View" :disabled="!canViewChunks" @click="openDocChunks(row)" />
            </el-tooltip>
            <el-tooltip content="删除（级联删知识块）" placement="top">
              <el-button size="small" type="danger" text :icon="Delete" :disabled="!canDelete" @click="removeDoc(row)" />
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="docPage"
        :page-size="docPageSize"
        :total="total"
        layout="prev, pager, next, jumper"
        class="pagination"
        @current-change="loadDocs"
      />
    </div>

    <!-- 导入历史 -->
    <div class="section">
      <div class="section-title">
        <span>📥 Excel 批量导入历史（最近 {{ importJobs.length }} 条）</span>
        <el-button size="small" text @click="loadImportJobs" :loading="jobsLoading">刷新</el-button>
      </div>
      <el-empty v-if="!importJobs.length && !jobsLoading" description="暂无导入记录；去「知识录入」页试试 Excel 批量导入" />
      <el-table v-else :data="importJobs" v-loading="jobsLoading" size="small" class="jobs-table">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">{{ jobTypeLabel[row.job_type] ?? row.job_type }}</template>
        </el-table-column>
        <el-table-column prop="filename" label="文件名" min-width="180" show-overflow-tooltip />
        <el-table-column label="行数" width="240">
          <template #default="{ row }">
            共 {{ row.total_rows }} · 有效 {{ row.valid_rows }}
            <span v-if="row.dup_rows" style="color: #e6a23c"> · 重复 {{ row.dup_rows }}</span>
            <span v-if="row.error_rows" style="color: #f56c6c"> · 错误 {{ row.error_rows }}</span>
          </template>
        </el-table-column>
        <el-table-column label="导入进度" width="160">
          <template #default="{ row }">
            {{ row.imported_rows }} / {{ row.total_rows }} · 向量化 {{ row.vectorized }}
          </template>
        </el-table-column>
        <el-table-column label="重复策略" width="80">
          <template #default="{ row }">
            <el-tag size="small">{{ row.dup_strategy }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="(jobStatusType[row.status] as any) ?? 'info'">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_by" label="操作人" width="80" />
        <el-table-column prop="created_at" label="创建时间" width="160">
          <template #default="{ row }">
            {{ new Date(row.created_at).toLocaleString('zh-CN') }}
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="jobsPage"
        :page-size="jobsPageSize"
        :total="jobsTotal"
        layout="prev, pager, next, jumper"
        class="pagination"
        @current-change="loadImportJobs"
      />
    </div>

    <!-- 文档查看弹窗 -->
    <el-dialog v-model="chunksVisible" :title="`📖 文档内容：${chunksTitle}`" width="900px" top="6vh">
      <div v-loading="chunksLoading">
        <el-alert v-if="chunksTotal === 0" type="info" :closable="false" show-icon
                  title="该文档暂无 chunks（可能还在解析中或解析失败）" />
        <div v-else>
          <div class="chunks-header">
            <span>共 {{ chunksTotal }} 个分块</span>
            <span class="hint-mini">按 level + seq 排序；父块（1）只做上下文，子块（2）用于检索</span>
          </div>
          <div class="chunks-list">
            <div v-for="ch in chunks" :key="ch.id" class="chunk-card">
              <div class="chunk-header">
                <el-tag size="small" :type="ch.level === 1 ? 'warning' : 'primary'">
                  {{ ch.level === 1 ? '父块' : '子块' }} #{{ ch.seq }}
                </el-tag>
                <span v-if="ch.heading_path" class="chunk-heading">{{ ch.heading_path }}</span>
                <span v-if="ch.page_from" class="chunk-page">P{{ ch.page_from }}{{ ch.page_to && ch.page_to > ch.page_from ? '-' + ch.page_to : '' }}</span>
                <el-tag v-if="ch.has_embedding" size="small" type="success" effect="plain">已向量化</el-tag>
                <el-tag v-else size="small" type="warning" effect="plain">未向量化</el-tag>
              </div>
              <pre class="chunk-content">{{ ch.content }}</pre>
            </div>
          </div>
          <el-pagination
            v-model:current-page="chunksPage"
            :page-size="chunksPageSize"
            :total="chunksTotal"
            layout="prev, pager, next, jumper"
            class="pagination"
            @current-change="loadChunks"
          />
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.knowledge {
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

.guide-alert :deep(.el-alert__content) {
  line-height: 1.7;
}

.toolbar-card {
  flex-shrink: 0;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.toolbar-label {
  font-weight: 600;
  color: #303133;
}

.toolbar-spacer {
  flex: 1;
}

.uploader {
  flex-shrink: 0;
}

.upload-icon {
  font-size: 40px;
  color: var(--el-color-primary);
}

.upload-text {
  color: var(--el-text-color-regular);
}

.upload-tip {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.poll-hint {
  flex-shrink: 0;
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
}

.doc-table,
.jobs-table {
  width: 100%;
}

.pagination {
  margin-top: 14px;
  justify-content: flex-end;
  display: flex;
}

.err-msg {
  color: var(--el-color-danger);
  font-size: 12px;
}

.chunks-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.chunks-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 60vh;
  overflow-y: auto;
}

.chunk-card {
  padding: 10px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  border-left: 3px solid var(--el-color-primary);
}

.chunk-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 13px;
}

.chunk-heading {
  color: var(--el-text-color-regular);
  font-weight: 500;
}

.chunk-page {
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
}

.chunk-content {
  margin: 0;
  padding: 8px 10px;
  background: #fff;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--el-text-color-regular);
  max-height: 200px;
  overflow: auto;
}
</style>