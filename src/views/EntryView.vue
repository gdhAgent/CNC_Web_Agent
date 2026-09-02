<script setup lang="ts">
/**
 * EntryView —— 知识录入 *
 * 三个 Tab：
 *   1. 手动表单 —— POST /api/knowledge/entry（保存即向量化）
 *   2. Excel 批量导入 —— 两阶段校验导入 / 进度 / 错误报表
 *   3. 导出 —— GET /api/knowledge/export 按条件下载 xlsx
 */
import { ref, computed, onMounted, watchEffect } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, Upload, Document, Plus, Search, QuestionFilled } from '@element-plus/icons-vue'
import type { UploadRequestOptions } from 'element-plus'

import http, { errMessage } from '@/api/http'
import type { AlarmEntryRequest, FAQEntryRequest, EntryResponse } from '@/types'
import { useBaseItemsStore } from '@/stores/baseItems'
import { useAuthStore } from '@/stores/auth'
import EntriesTab from '@/components/EntriesTab.vue'

const auth = useAuthStore()
// V1.5 F8：entry 页动作级权限
const canCreateAlarm = computed(() => auth.canDoAction('entry', 'alarms.create'))
const canCreateFaq = computed(() => auth.canDoAction('entry', 'faqs.create'))
const canImport = computed(() => auth.canDoAction('entry', 'import.template'))
const canExport = computed(() => auth.canDoAction('entry', 'export'))
// 录入人默认取当前登录用户（V1.5 真实用户）
const currentUser = computed(() => auth.user?.username ?? 'E1024')

// ===== Tab 1：手动录入 =====

const baseStore = useBaseItemsStore()

const formMode = ref<'alarm' | 'faq'>('alarm')

const alarmForm = ref({
  brand: 'FANUC',
  controller: '',
  code: '',
  name: '',
  category: 'servo',
  severity: 'fault',
  description: '',
  cause: '',
  action: '',
  safety_note: '',
  model_scope: '',
  created_by: 'E1024',
})

const faqForm = ref({
  brand: '',
  title: '',
  body: '',
  model_scope: '',
  source: '',
  created_by: 'E1024',
})

// 表单录入人默认同步当前登录用户
watchEffect(() => {
  alarmForm.value.created_by = currentUser.value
  faqForm.value.created_by = currentUser.value
})

// 下拉数据从 baseItems store 读（启动时已预加载；管理页修改后 store.invalidate 触发刷新）
const brandOptions = computed(() => baseStore.byKind('brand'))
const categoryOptions = computed(() => baseStore.byKind('category'))
const severityOptions = computed(() => baseStore.byKind('severity'))

const submitting = ref(false)

async function submitAlarm() {
  if (!alarmForm.value.code || !alarmForm.value.name) {
    ElMessage.warning('请填写报警码和名称')
    return
  }
  submitting.value = true
  try {
    const body: AlarmEntryRequest = {
      type: 'alarm',
      brand: alarmForm.value.brand,
      controller: alarmForm.value.controller || null,
      code: alarmForm.value.code,
      name: alarmForm.value.name,
      category: alarmForm.value.category,
      severity: alarmForm.value.severity,
      description: alarmForm.value.description || null,
      cause: alarmForm.value.cause || null,
      action: alarmForm.value.action || null,
      safety_note: alarmForm.value.safety_note || null,
      model_scope: alarmForm.value.model_scope
        ? alarmForm.value.model_scope.split(',').map((s) => s.trim()).filter(Boolean)
        : null,
      created_by: alarmForm.value.created_by || null,
    }
    const resp = await http.post<EntryResponse>('/knowledge/entry', body)
    ElMessage.success(
      `已保存报警码 ${resp.data.code_norm || alarmForm.value.code}（${resp.data.vectorized ? '已向量化' : '向量化失败'}）`,
    )
    // 清空表单但保留 brand/controller 便于连续录入
    alarmForm.value.code = ''
    alarmForm.value.name = ''
    alarmForm.value.description = ''
    alarmForm.value.cause = ''
    alarmForm.value.action = ''
    alarmForm.value.safety_note = ''
    alarmForm.value.model_scope = ''
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    submitting.value = false
  }
}

async function submitFAQ() {
  if (!faqForm.value.title || !faqForm.value.body) {
    ElMessage.warning('请填写标题和正文')
    return
  }
  submitting.value = true
  try {
    const body: FAQEntryRequest = {
      type: 'faq',
      brand: faqForm.value.brand || null,
      title: faqForm.value.title,
      body: faqForm.value.body,
      model_scope: faqForm.value.model_scope
        ? faqForm.value.model_scope.split(',').map((s) => s.trim()).filter(Boolean)
        : null,
      source: faqForm.value.source || null,
      created_by: faqForm.value.created_by || null,
    }
    const resp = await http.post<EntryResponse>('/knowledge/entry', body)
    ElMessage.success(`已保存 FAQ（id=${resp.data.id}，${resp.data.vectorized ? '已向量化' : '向量化失败'}）`)
    faqForm.value.title = ''
    faqForm.value.body = ''
    faqForm.value.source = ''
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    submitting.value = false
  }
}

// ===== Tab 2：Excel 批量导入 =====

const excelType = ref<'alarm' | 'faq' | 'machine' | 'maintenance'>('alarm')
const excelFile = ref<File | null>(null)
const dupStrategy = ref<'skip' | 'overwrite' | 'duplicate'>('skip')
const importing = ref(false)
const preview = ref<null | {
  job_id: number
  total: number
  valid: number
  dup: number
  error: number
  errors: Array<{ row: number; field?: string; reason: string }>
  parsed_rows: Array<Record<string, unknown>>
}>(null)
const confirmSync = ref(true)
const jobProgress = ref<null | {
  status: string
  total_rows: number
  imported_rows: number
  vectorized: number
}>(null)
const pollTimer = ref<ReturnType<typeof setInterval> | null>(null)

const excelTypeLabel: Record<string, string> = {
  alarm: '报警码',
  faq: 'FAQ',
  machine: '设备台账',
  maintenance: '维修工单',
}

const excelHelp: Record<string, string> = {
  alarm: '整理报警码的品牌、码、名称、现象、原因、处置步骤；用于扩充 kb.alarms',
  faq: '整理 FAQ 的标题与正文；用于扩充 kb.chunks',
  machine: '整理设备台账；用于扩充 ops.machines',
  maintenance: '整理维修工单历史；用于扩充 ops.maintenance_logs',
}

async function downloadTemplate() {
  try {
    const resp = await http.get(`/knowledge/template`, {
      params: { type: excelType.value },
      responseType: 'blob',
    })
    const blob = new Blob([resp.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${excelType.value}_template.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success(`已下载 ${excelTypeLabel[excelType.value]} 模板`)
  } catch (e) {
    ElMessage.error(errMessage(e))
  }
}

function onExcelSelect(opts: UploadRequestOptions) {
  excelFile.value = opts.file
  preview.value = null
  jobProgress.value = null
}

async function validateExcel() {
  if (!excelFile.value) {
    ElMessage.warning('请先选择 Excel 文件')
    return
  }
  importing.value = true
  try {
    const fd = new FormData()
    fd.append('file', excelFile.value)
    fd.append('type', excelType.value)
    const resp = await http.post<typeof preview.value>('/knowledge/import/validate', fd, {
      params: { dup_strategy: dupStrategy.value },
    })
    preview.value = resp.data
    ElMessage.success(
      `校验完成：共 ${resp.data?.total} 行，有效 ${resp.data?.valid}，重复 ${resp.data?.dup}，错误 ${resp.data?.error}`,
    )
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    importing.value = false
  }
}

async function confirmImport() {
  if (!preview.value) return
  importing.value = true
  try {
    const resp = await http.post<{ job_id: number; status: string }>(
      `/knowledge/import/${preview.value.job_id}/confirm`,
      { parsed_rows: preview.value.parsed_rows },
      { params: { sync: confirmSync.value } },
    )
    if (resp.data.status === 'done') {
      ElMessage.success(`导入完成，共 ${resp.data.job_id ? '' : ''}行`)
      jobProgress.value = {
        status: 'done',
        total_rows: preview.value.valid,
        imported_rows: preview.value.valid,
        vectorized: preview.value.valid,
      }
    } else {
      ElMessage.info(`已加入导入队列，job_id=${resp.data.job_id}`)
      pollJob(resp.data.job_id)
    }
    preview.value = null
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    importing.value = false
  }
}

async function pollJob(jobId: number) {
  if (pollTimer.value) clearInterval(pollTimer.value)
  const tick = async () => {
    try {
      const resp = await http.get<typeof jobProgress.value>(`/knowledge/import/${jobId}`)
      jobProgress.value = resp.data
      if (resp.data?.status === 'done' || resp.data?.status === 'failed') {
        if (pollTimer.value) {
          clearInterval(pollTimer.value)
          pollTimer.value = null
        }
        if (resp.data?.status === 'done') {
          ElMessage.success(`导入完成：${resp.data.imported_rows}/${resp.data.total_rows} 已向量化 ${resp.data.vectorized}`)
        }
      }
    } catch {
      // ignore
    }
  }
  await tick()
  pollTimer.value = setInterval(tick, 2000)
}

async function downloadErrors() {
  if (!preview.value?.job_id) return
  try {
    const resp = await http.get(`/knowledge/import/${preview.value.job_id}/errors.xlsx`, {
      responseType: 'blob',
    })
    const blob = new Blob([resp.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `import_errors_${preview.value.job_id}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    ElMessage.error(errMessage(e))
  }
}

// ===== Tab 3：导出 =====

const exportType = ref<'alarm' | 'faq'>('alarm')
const exportBrand = ref('')
const exportOrigin = ref<'all' | 'ingest' | 'manual' | 'feedback'>('all')

async function doExport() {
  try {
    const resp = await http.get('/knowledge/export', {
      params: {
        type: exportType.value,
        brand: exportBrand.value || undefined,
        origin: exportOrigin.value === 'all' ? undefined : exportOrigin.value,
      },
      responseType: 'blob',
    })
    const blob = new Blob([resp.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${exportType.value}_export.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('已导出')
  } catch (e) {
    ElMessage.error(errMessage(e))
  }
}

onMounted(() => {
  // 组件卸载时清理轮询
  return () => {
    if (pollTimer.value) clearInterval(pollTimer.value)
  }
})
</script>

<template>
  <div class="entry">
    <div class="page-header">
      <h2><el-icon><Plus /></el-icon> 知识录入</h2>
      <p class="hint">把人工经验、设备厂手册整理后的报警码 / FAQ / 维修经验灌入知识库，保存即向量化、立刻可检索</p>
    </div>

    <el-alert type="info" :closable="false" class="guide-alert">
      <template #title>
        <strong>💡 「知识录入」与「知识库管理」的区别</strong>
      </template>
      <div style="line-height: 1.7">
        <strong>本页（知识录入）</strong>录入的是 <strong>短结构化条目</strong>：报警码 / FAQ / 维修工单 / 设备台账，
        通过表单或 Excel 批量导入；适合<strong>单条 / 几百条</strong>规模。
        <br />
        <strong>「<RouterLink to="/knowledge">知识库管理</RouterLink>」页</strong>管的是 <strong>长文档</strong>：
        设备手册 / SOP / FAQ PDF 等，通过上传解析自动切块；适合<strong>几十到几百页</strong>的整本资料。
        <br />
        <strong>导出选项说明：</strong>
        <ul style="margin: 4px 0 4px 16px; padding: 0">
          <li><strong>数据类型</strong>：导出报警码（kb.alarms）还是 FAQ（kb.chunks）</li>
          <li><strong>品牌</strong>：只导某一品牌的（如「FANUC」），留空=全部</li>
          <li><strong>来源</strong>：
            <el-tag size="small">ingest</el-tag>=自动入库（种子数据），
            <el-tag size="small">manual</el-tag>=手工录入（手动表单），
            <el-tag size="small">feedback</el-tag>=反馈补录（点踩后人工补的），
            <el-tag size="small">all</el-tag>=全部</li>
        </ul>
      </div>
    </el-alert>

    <el-tabs type="border-card" class="entry-tabs">
      <!-- Tab 1：手动录入 -->
      <el-tab-pane label="手动录入">
        <el-radio-group v-model="formMode" class="form-mode">
          <el-radio-button value="alarm">报警码</el-radio-button>
          <el-radio-button value="faq">FAQ / 经验</el-radio-button>
        </el-radio-group>

        <!-- 报警码表单 -->
        <el-form v-if="formMode === 'alarm'" label-width="100px" class="entry-form">
          <el-row :gutter="16">
            <el-col :span="8">
              <el-form-item label="品牌" required>
                <el-select v-model="alarmForm.brand" filterable allow-create>
                  <el-option v-for="b in brandOptions" :key="b.code" :value="b.code">
                    {{ baseStore.displayLabel(b) }}
                  </el-option>
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="系统">
                <el-input v-model="alarmForm.controller" placeholder="如 0i-MF（可空）" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="报警码" required>
                <el-input v-model="alarmForm.code" placeholder="如 SV0401" style="font-family: monospace" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-form-item label="名称" required>
            <el-input v-model="alarmForm.name" placeholder="如 伺服 V-Ready 信号关闭" />
          </el-form-item>

          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="类别">
                <el-select v-model="alarmForm.category" filterable allow-create>
                  <el-option v-for="c in categoryOptions" :key="c.code" :value="c.code">
                    {{ baseStore.displayLabel(c) }}
                  </el-option>
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="严重度">
                <el-select v-model="alarmForm.severity">
                  <el-option v-for="s in severityOptions" :key="s.code" :value="s.code">
                    {{ baseStore.displayLabel(s) }}
                  </el-option>
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>

          <el-form-item label="现象">
            <el-input v-model="alarmForm.description" type="textarea" :rows="2" placeholder="白话描述故障现象" />
          </el-form-item>
          <el-form-item label="可能原因">
            <el-input v-model="alarmForm.cause" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item label="处置步骤">
            <el-input v-model="alarmForm.action" type="textarea" :rows="3" />
          </el-form-item>
          <el-form-item label="⚠️ 安全提示">
            <el-input v-model="alarmForm.safety_note" type="textarea" :rows="2" placeholder="如：断电后等待 5 分钟放电" />
          </el-form-item>
          <el-form-item label="适用机型">
            <el-input v-model="alarmForm.model_scope" placeholder="逗号分隔，如 VMC850, TC500（空=通用）" />
          </el-form-item>
          <el-form-item label="录入人">
            <el-input v-model="alarmForm.created_by" style="max-width: 200px" />
          </el-form-item>

          <el-form-item>
            <el-button type="primary" :loading="submitting" :disabled="!canCreateAlarm" @click="submitAlarm">
              保存并向量化
            </el-button>
            <span class="form-hint">
              <el-icon><QuestionFilled /></el-icon>
              保存后立即调 bge-m3 生成 embedding 并入库；可在「智能问答」输入该码验证是否召回
            </span>
          </el-form-item>
        </el-form>

        <!-- FAQ 表单 -->
        <el-form v-else label-width="100px" class="entry-form">
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="品牌">
                <el-select v-model="faqForm.brand" filterable allow-create clearable>
                  <el-option v-for="b in brandOptions" :key="b.code" :value="b.code">
                    {{ baseStore.displayLabel(b) }}
                  </el-option>
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="适用机型">
                <el-input v-model="faqForm.model_scope" placeholder="逗号分隔（空=通用）" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-form-item label="标题" required>
            <el-input v-model="faqForm.title" placeholder="如：主轴定向调整标准流程" />
          </el-form-item>
          <el-form-item label="正文" required>
            <el-input v-model="faqForm.body" type="textarea" :rows="6" placeholder="详细的步骤、注意事项、经验总结…" />
          </el-form-item>
          <el-form-item label="来源说明">
            <el-input v-model="faqForm.source" placeholder="如：厂内 SOP-2025-008 / 维修师傅经验" />
          </el-form-item>
          <el-form-item label="录入人">
            <el-input v-model="faqForm.created_by" style="max-width: 200px" />
          </el-form-item>

          <el-form-item>
            <el-button type="primary" :loading="submitting" :disabled="!canCreateFaq" @click="submitFAQ">
              保存并向量化
            </el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- Tab 2：Excel 批量导入 -->
      <el-tab-pane label="Excel 批量导入">
        <el-alert type="info" :closable="false" class="mb-12">
          两阶段导入：先校验（不入库）→ 预览无误后再确认入库。校验失败的行可下载错误报表修改后重传。
        </el-alert>

        <el-row :gutter="16" class="mb-12">
          <el-col :span="6">
            <el-form-item label="数据类型">
              <el-select v-model="excelType">
                <el-option v-for="(label, v) in excelTypeLabel" :key="v" :label="label" :value="v" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="14">
            <el-form-item>
              <span class="excel-help">{{ excelHelp[excelType] }}</span>
            </el-form-item>
          </el-col>
          <el-col :span="4">
            <el-button :icon="Download" :disabled="!canImport" @click="downloadTemplate">下载模板</el-button>
          </el-col>
        </el-row>

        <el-upload
          class="excel-uploader"
          drag
          :show-file-list="false"
          accept=".xlsx,.xls"
          :disabled="!canImport"
          :http-request="onExcelSelect"
        >
          <el-icon class="upload-icon"><Upload /></el-icon>
          <div class="upload-text">点击或拖拽 Excel 文件到此处</div>
          <template #tip>
            <div class="upload-tip">支持 .xlsx / .xls；按模板填好后上传</div>
          </template>
        </el-upload>

        <div v-if="excelFile" class="file-info">
          <el-icon><Document /></el-icon>
          <span>{{ excelFile.name }}</span>
          <span class="file-size">({{ (excelFile.size / 1024).toFixed(1) }} KB)</span>
          <el-button size="small" text @click="excelFile = null">清除</el-button>
        </div>

        <el-row :gutter="16" class="mb-12" v-if="excelFile">
          <el-col :span="12">
            <el-form-item label="重复处理">
              <el-select v-model="dupStrategy">
                <el-option value="skip" label="跳过重复（推荐）" />
                <el-option value="overwrite" label="覆盖原条目" />
                <el-option value="duplicate" label="新增副本" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-button type="primary" :loading="importing" :disabled="!canImport" @click="validateExcel">
              <el-icon><Search /></el-icon>
              第一步：校验
            </el-button>
          </el-col>
        </el-row>

        <!-- 校验预览 -->
        <el-card v-if="preview" shadow="never" class="preview-card">
          <template #header>
            <div class="preview-header">
              <span>校验预览</span>
              <el-button :icon="Download" size="small" :disabled="!preview.error || !canImport" @click="downloadErrors">
                下载错误报表 ({{ preview.error }} 行)
              </el-button>
            </div>
          </template>
          <div class="preview-stats">
            <el-tag type="info">共 {{ preview.total }} 行</el-tag>
            <el-tag type="success">✅ 可导入 {{ preview.valid }}</el-tag>
            <el-tag type="warning" v-if="preview.dup">⚠️ 重复 {{ preview.dup }}</el-tag>
            <el-tag type="danger" v-if="preview.error">❌ 错误 {{ preview.error }}</el-tag>
          </div>

          <el-table v-if="preview.errors.length" :data="preview.errors" size="small" max-height="200" class="err-table">
            <el-table-column prop="row" label="行号" width="80" />
            <el-table-column prop="field" label="字段" width="120" />
            <el-table-column prop="reason" label="原因" />
          </el-table>

          <div class="confirm-row">
            <el-checkbox v-model="confirmSync">同步执行（等待完成；小文件用）</el-checkbox>
            <el-button
              type="primary"
              :loading="importing"
              :disabled="preview.valid === 0 || !canImport"
              @click="confirmImport"
            >
              第二步：确认导入 {{ preview.valid }} 行
            </el-button>
          </div>
        </el-card>

        <!-- 导入进度 -->
        <el-card v-if="jobProgress" shadow="never" class="progress-card">
          <template #header>导入进度</template>
          <el-descriptions :column="3" size="small" border>
            <el-descriptions-item label="状态">
              <el-tag :type="jobProgress.status === 'done' ? 'success' : 'info'">
                {{ jobProgress.status }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="总行数">{{ jobProgress.total_rows }}</el-descriptions-item>
            <el-descriptions-item label="已导入">{{ jobProgress.imported_rows }}</el-descriptions-item>
            <el-descriptions-item label="已向量化">{{ jobProgress.vectorized }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-tab-pane>

      <!-- Tab 3：导出 -->
      <el-tab-pane label="导出">
        <el-alert type="info" :closable="false" class="mb-12">
          把知识库里的报警码 / FAQ 按条件导出 xlsx。导出的文件结构与模板一致，改完可直接再导入。
        </el-alert>

        <el-row :gutter="16" class="mb-12">
          <el-col :span="6">
            <el-form-item label="数据类型">
              <el-select v-model="exportType">
                <el-option value="alarm" label="报警码" />
                <el-option value="faq" label="FAQ" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="品牌">
              <el-select v-model="exportBrand" filterable clearable style="width: 100%" placeholder="留空=全部">
                <el-option v-for="b in brandOptions" :key="b.code" :value="b.code">
                  {{ baseStore.displayLabel(b) }}
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="来源">
              <el-select v-model="exportOrigin">
                <el-option value="all" label="全部" />
                <el-option value="ingest" label="自动入库" />
                <el-option value="manual" label="手工录入" />
                <el-option value="feedback" label="反馈补录" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-button type="primary" :icon="Download" :disabled="!canExport" @click="doExport">下载 xlsx</el-button>
          </el-col>
        </el-row>

        <el-card shadow="never">
          <template #header>导出用途</template>
          <ul class="use-list">
            <li>备份知识库版本</li>
            <li>离线修改后再批量导入</li>
            <li>跨环境迁移（测试 → 生产）</li>
            <li>交给现场工程师补充后回传</li>
          </ul>
        </el-card>
      </el-tab-pane>

      <!-- Tab 4：已录入条目管理 -->
      <el-tab-pane label="已录入条目">
        <EntriesTab />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.entry {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-header h2 {
  margin: 0 0 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.page-header .hint {
  margin: 0 0 12px;
  color: #666;
  font-size: 13px;
}

.guide-alert {
  line-height: 1.7;
}

.guide-alert :deep(.el-alert__content) {
  line-height: 1.7;
}

.entry-tabs {
  background: #fff;
  border-radius: 8px;
}
.form-mode {
  margin-bottom: 16px;
}
.entry-form {
  max-width: 900px;
}
.form-hint {
  margin-left: 12px;
  color: #888;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.mb-12 {
  margin-bottom: 12px;
}
.excel-help {
  color: #666;
  font-size: 13px;
  padding-top: 4px;
  display: inline-block;
}
.excel-uploader {
  margin-bottom: 12px;
}
.upload-icon {
  font-size: 40px;
  color: var(--el-color-primary);
}
.upload-text {
  color: var(--el-text-color-regular);
  margin: 8px 0;
}
.upload-tip {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  margin-bottom: 12px;
  font-size: 14px;
}
.file-size {
  color: #999;
  font-size: 12px;
}
.preview-card,
.progress-card {
  margin-top: 16px;
}
.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.preview-stats {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.err-table {
  margin-bottom: 12px;
}
.confirm-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.use-list {
  margin: 0;
  padding-left: 20px;
  color: var(--el-text-color-regular);
}
.use-list li {
  margin: 4px 0;
}
</style>