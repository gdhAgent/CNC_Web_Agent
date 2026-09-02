<script setup lang="ts">
/**
 * WorkOrderView —— 工单管理 *
 * 后端契约：
 *   GET    /api/workorders          列表（带筛选 + 分页）
 *   POST   /api/workorders          新增（保存即向量化）
 *   GET    /api/workorders/{id}     详情
 *   GET    /api/workorders/machines 设备台账
 *
 * 列表筛选：报警码 / 品牌 / 故障类型 / 时间
 * 列表显示：工单号、设备、报警码、故障类型、现象、停机时长、操作人、开始时间
 * 点击「详情」弹窗：完整 symptom / root_cause / action_taken / parts_used / 报警码关联
 * 点击「新增」弹窗：表单填工单字段，POST 提交
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Document, Filter, Plus, Delete } from '@element-plus/icons-vue'
import http, { errMessage } from '@/api/http'
import type { WorkOrderItem, WorkOrderListResponse, MachineItem } from '@/types'
import { useBaseItemsStore } from '@/stores/baseItems'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
// V1.5 F8：workorders 页动作级权限（viewer 仅 view，无 create）
const canCreateWorkorder = computed(() => auth.canDoAction('workorders', 'workorders.create'))
const canDeleteWorkorder = computed(() => auth.canDoAction('workorders', 'workorders.delete'))

// ===== 筛选 =====
const route = useRoute()
const alarmCode = ref((route.query.alarm_code as string) || '')
const brand = ref((route.query.brand as string) || '')
const faultType = ref((route.query.fault_type as string) || '')
const fromTime = ref((route.query.from_time as string) || '')
const toTime = ref((route.query.to_time as string) || '')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

const workorders = ref<WorkOrderItem[]>([])
const loading = ref(false)
const machines = ref<MachineItem[]>([])

const baseStore = useBaseItemsStore()
const faultTypeFromBase = computed(() => baseStore.byKind('fault_type'))
const brandFromBase = computed(() => baseStore.byKind('brand'))

const detailVisible = ref(false)
const detail = ref<WorkOrderItem | null>(null)
const detailLoading = ref(false)

async function loadMachines() {
  try {
    const resp = await http.get<{ items: MachineItem[] }>('/workorders/machines', {
      params: { limit: 500 },
    })
    machines.value = resp.data.items
  } catch (e) {
    // 失败不阻塞列表
    console.warn('loadMachines failed:', errMessage(e))
  }
}

async function loadList() {
  loading.value = true
  try {
    const resp = await http.get<WorkOrderListResponse>('/workorders', {
      params: {
        alarm_code: alarmCode.value || undefined,
        brand: brand.value || undefined,
        fault_type: faultType.value || undefined,
        from_time: fromTime.value || undefined,
        to_time: toTime.value || undefined,
        limit: pageSize.value,
        offset: (page.value - 1) * pageSize.value,
      },
    })
    workorders.value = resp.data.items
    total.value = resp.data.total
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    loading.value = false
  }
}

async function openDetail(row: WorkOrderItem) {
  detail.value = row
  detailVisible.value = true
  detailLoading.value = true
  try {
    const resp = await http.get<WorkOrderItem>(`/workorders/${row.id}`)
    detail.value = resp.data
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    detailLoading.value = false
  }
}

function resetFilter() {
  alarmCode.value = ''
  brand.value = ''
  faultType.value = ''
  fromTime.value = ''
  toTime.value = ''
  page.value = 1
  loadList()
}

function onPageChange(p: number) {
  page.value = p
  loadList()
}

function fmtDate(s?: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

const faultTypeTag: Record<string, string> = {
  机械: 'warning',
  电气: 'danger',
  液压: 'info',
  气动: 'info',
  软件: 'success',
}

const severityTag: Record<string, string> = {
  info: 'info',
  warning: 'warning',
  fault: 'danger',
  fatal: 'danger',
}

// 从看板跳转时带 from_time/to_time，展示当前生效的窗口，避免"数字对不上"的困惑
const activeWindowText = computed(() => {
  if (fromTime.value && toTime.value) return `看板窗口 ${fromTime.value.slice(0, 10)} ~ ${toTime.value.slice(0, 10)}`
  if (fromTime.value) return `自 ${fromTime.value.slice(0, 10)}`
  if (toTime.value) return `至 ${toTime.value.slice(0, 10)}`
  return ''
})

onMounted(() => {
  loadMachines()
  loadList()
})

// 从「故障看板」带 query 跳转时，Vue Router 对同路径 query 变化复用组件、不触发 onMounted。
// watch route.query 把筛选同步到表单并重载，保证「看板 X 单 → 工单列表」计数一致。
watch(
  () => route.query,
  (q) => {
    alarmCode.value = (q.alarm_code as string) || ''
    brand.value = (q.brand as string) || ''
    faultType.value = (q.fault_type as string) || ''
    fromTime.value = (q.from_time as string) || ''
    toTime.value = (q.to_time as string) || ''
    page.value = 1
    loadList()
  },
)

// ===== 新增工单 =====

const createVisible = ref(false)
const creating = ref(false)
const createForm = reactive({
  machine_id: null as number | null,
  order_no: '',
  alarm_code: '',
  fault_type: '',
  symptom: '',
  root_cause: '',
  action_taken: '',
  engineer: '',
  downtime_min: null as number | null,
  started_at: '',
  finished_at: '',
})

function openCreate() {
  // 重置表单
  Object.assign(createForm, {
    machine_id: null,
    order_no: '',
    alarm_code: '',
    fault_type: '',
    symptom: '',
    root_cause: '',
    action_taken: '',
    engineer: '',
    downtime_min: null,
    started_at: '',
    finished_at: '',
  })
  createVisible.value = true
}

async function submitCreate() {
  if (!createForm.machine_id) {
    ElMessage.warning('请选择设备')
    return
  }
  if (!createForm.symptom.trim()) {
    ElMessage.warning('请填写现象')
    return
  }
  creating.value = true
  try {
    const body = {
      machine_id: createForm.machine_id,
      order_no: createForm.order_no || null,
      alarm_code: createForm.alarm_code || null,
      fault_type: createForm.fault_type || null,
      symptom: createForm.symptom,
      root_cause: createForm.root_cause || null,
      action_taken: createForm.action_taken || null,
      engineer: createForm.engineer || null,
      downtime_min: createForm.downtime_min || null,
      started_at: createForm.started_at || null,
      finished_at: createForm.finished_at || null,
    }
    const resp = await http.post<{ id: number }>('/workorders', body)
    ElMessage.success(`工单 #${resp.data.id} 已保存，正在后台向量化…`)
    createVisible.value = false
    page.value = 1
    loadList()
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    creating.value = false
  }
}

// ===== 删除工单（V1.5 删除闭环；embedding 随行删除）=====
async function removeWorkorder(row: WorkOrderItem) {
  if (!canDeleteWorkorder.value) {
    ElMessage.warning('当前角色无删除权限')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定删除工单 #${row.id}（${row.order_no || '无单号'}）？\n将同时删除其向量，此操作不可恢复。`,
      '删除工单',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' },
    )
  } catch {
    return
  }
  try {
    await http.delete(`/workorders/${row.id}`)
    ElMessage.success('已删除工单')
    await loadList()
  } catch (e) {
    ElMessage.error(errMessage(e))
  }
}
</script>

<template>
  <div class="workorders">
    <div class="page-header">
      <h2>🔧 工单管理</h2>
      <p class="hint">查看工厂 CNC 设备的维修工单历史；可按报警码 / 品牌 / 故障类型 / 时间筛选</p>
    </div>

    <!-- 筛选 -->
    <el-card shadow="never" class="filter-card">
      <el-form inline>
        <el-form-item label="报警码">
          <el-input
            v-model="alarmCode"
            placeholder="如 SV0401"
            style="width: 130px"
            clearable
            @keyup.enter="loadList"
          />
        </el-form-item>
        <el-form-item label="品牌">
          <el-select v-model="brand" clearable style="width: 180px">
            <el-option v-for="b in brandFromBase" :key="b.code" :value="b.code">
              {{ baseStore.displayLabel(b) }}
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="故障类型">
          <el-select v-model="faultType" clearable style="width: 160px">
            <el-option v-for="t in faultTypeFromBase" :key="t.code" :value="t.code">
              {{ baseStore.displayLabel(t) }}
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="时间">
          <el-date-picker
            v-model="fromTime"
            type="datetime"
            placeholder="起"
            style="width: 180px"
            value-format="YYYY-MM-DDTHH:mm:ss"
          />
          <span style="margin: 0 6px">~</span>
          <el-date-picker
            v-model="toTime"
            type="datetime"
            placeholder="止"
            style="width: 180px"
            value-format="YYYY-MM-DDTHH:mm:ss"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="() => { page = 1; loadList() }">查询</el-button>
          <el-button :icon="Filter" @click="resetFilter">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 列表 -->
    <div class="section">
      <div class="section-title">
        <span>📋 工单列表（共 {{ total }} 条）</span>
        <div class="title-actions">
          <span v-if="activeWindowText" class="hint-mini window-hint">📅 {{ activeWindowText }}</span>
          <span class="hint-mini" v-if="machines.length">
            设备台账 {{ machines.length }} 台
          </span>
          <el-button type="primary" :icon="Plus" :disabled="!canCreateWorkorder" @click="openCreate">新增工单</el-button>
        </div>
      </div>
      <el-table :data="workorders" v-loading="loading" size="small" stripe class="wo-table">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="order_no" label="工单号" width="130" />
        <el-table-column label="设备" min-width="160">
          <template #default="{ row }">
            <span style="font-family: monospace">{{ row.asset_no || '—' }}</span>
            <el-tag v-if="row.brand" size="small" style="margin-left: 4px">{{ row.brand }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="报警码" width="140">
          <template #default="{ row }">
            <span v-if="row.alarm_code" style="font-family: monospace; font-weight: 600">
              {{ row.alarm_code }}
            </span>
            <span v-else style="color: #999">无</span>
            <div v-if="row.alarm_name" style="font-size: 12px; color: #666">
              {{ row.alarm_name }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="故障类型" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.fault_type" :type="(faultTypeTag[row.fault_type] as any) ?? 'info'" size="small">
              {{ row.fault_type }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="现象" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ row.symptom }}</template>
        </el-table-column>
        <el-table-column label="停机" width="80">
          <template #default="{ row }">
            <span v-if="row.downtime_min">{{ row.downtime_min }}分</span>
          </template>
        </el-table-column>
        <el-table-column prop="engineer" label="维修人" width="90" />
        <el-table-column label="开始时间" width="150">
          <template #default="{ row }">{{ fmtDate(row.started_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" text :icon="Document" @click="openDetail(row)">
              详情
            </el-button>
            <el-tooltip content="删除（清向量）" placement="top">
              <el-button
                size="small"
                type="danger"
                text
                :icon="Delete"
                :disabled="!canDeleteWorkorder"
                @click="removeWorkorder(row)"
              />
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next, jumper"
        class="pagination"
        @current-change="onPageChange"
      />
    </div>

    <!-- 详情弹窗 -->
    <el-dialog v-model="detailVisible" title="工单详情" width="720px" top="6vh">
      <div v-loading="detailLoading" v-if="detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="工单号">{{ detail.order_no || '—' }}</el-descriptions-item>
          <el-descriptions-item label="设备">
            <span style="font-family: monospace">{{ detail.asset_no }}</span>
            <el-tag v-if="detail.brand" size="small" style="margin-left: 4px">{{ detail.brand }}</el-tag>
            <span v-if="detail.model" style="margin-left: 4px; color: #666">{{ detail.model }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="故障类型">
            <el-tag v-if="detail.fault_type" :type="(faultTypeTag[detail.fault_type] as any) ?? 'info'" size="small">
              {{ detail.fault_type }}
            </el-tag>
            <span v-else>—</span>
          </el-descriptions-item>
          <el-descriptions-item label="维修人">{{ detail.engineer || '—' }}</el-descriptions-item>
          <el-descriptions-item label="报警码" v-if="detail.alarm_code">
            <span style="font-family: monospace; font-weight: 600">{{ detail.alarm_code }}</span>
            <span v-if="detail.alarm_name" style="margin-left: 8px; color: #666">{{ detail.alarm_name }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="严重度" v-if="detail.alarm_severity">
            <el-tag :type="(severityTag[detail.alarm_severity] as any) ?? 'info'" size="small">
              {{ detail.alarm_severity }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="停机时长">
            {{ detail.downtime_min ? detail.downtime_min + ' 分钟' : '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="开始时间">{{ fmtDate(detail.started_at) }}</el-descriptions-item>
          <el-descriptions-item label="结束时间">{{ fmtDate(detail.finished_at) }}</el-descriptions-item>
        </el-descriptions>

        <el-divider />

        <h4>📝 现象</h4>
        <p class="block-text">{{ detail.symptom || '—' }}</p>

        <h4>🔍 根因</h4>
        <p class="block-text">{{ detail.root_cause || '—' }}</p>

        <h4>🛠 处置</h4>
        <p class="block-text">{{ detail.action_taken || '—' }}</p>
      </div>
    </el-dialog>

    <!-- 新增工单弹窗 -->
    <el-dialog v-model="createVisible" title="新增工单" width="720px" top="6vh">
      <el-form label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="设备" required>
              <el-select v-model="createForm.machine_id" filterable placeholder="选设备" style="width: 100%">
                <el-option
                  v-for="m in machines"
                  :key="m.id"
                  :label="`${m.asset_no} (${m.brand}${m.model ? ' ' + m.model : ''})`"
                  :value="m.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="工单号">
              <el-input v-model="createForm.order_no" placeholder="可空，自动生成" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="报警码">
              <el-input v-model="createForm.alarm_code" placeholder="如 SV0401（可空）" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="故障类型">
              <el-select v-model="createForm.fault_type" allow-create clearable style="width: 100%">
                <el-option v-for="t in faultTypeFromBase" :key="t.code" :value="t.code">
                  {{ baseStore.displayLabel(t) }}
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="现象" required>
          <el-input v-model="createForm.symptom" type="textarea" :rows="3" placeholder="白话描述故障现象" />
        </el-form-item>

        <el-form-item label="根因">
          <el-input v-model="createForm.root_cause" type="textarea" :rows="2" />
        </el-form-item>

        <el-form-item label="处置">
          <el-input v-model="createForm.action_taken" type="textarea" :rows="2" />
        </el-form-item>

        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="维修人">
              <el-input v-model="createForm.engineer" placeholder="如 张师傅" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="停机时长">
              <el-input-number v-model="createForm.downtime_min" :min="0" :max="10000" placeholder="分钟" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="开始时间">
              <el-date-picker v-model="createForm.started_at" type="datetime" style="width: 100%"
                              value-format="YYYY-MM-DDTHH:mm:ss" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="结束时间">
              <el-date-picker v-model="createForm.finished_at" type="datetime" style="width: 100%"
                              value-format="YYYY-MM-DDTHH:mm:ss" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-alert type="info" :closable="false" show-icon
                  title="保存后会自动调 embedding API 向量化（siliconflow bge-m3），下次类似工单能通过「智能问答」检索到" />
      </el-form>

      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">保存并向量化</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.workorders {
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

.filter-card {
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

.title-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.hint-mini {
  color: #999;
  font-size: 12px;
  font-weight: 400;
}

.window-hint {
  padding: 2px 8px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  border-radius: 4px;
}

.wo-table {
  width: 100%;
}

.pagination {
  margin-top: 14px;
  justify-content: flex-end;
  display: flex;
}

.block-text {
  background: var(--el-fill-color-light);
  padding: 8px 12px;
  border-radius: 4px;
  white-space: pre-wrap;
  margin: 4px 0 12px;
  font-size: 14px;
  line-height: 1.6;
}

h4 {
  margin: 12px 0 4px;
  font-size: 14px;
}

</style>