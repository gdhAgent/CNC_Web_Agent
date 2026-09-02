<script setup lang="ts">
/**
 * DeviceTab —— 设备台账维护（设备维护）
 *
 * 设备是业务主数据（ops.machines），非枚举字典，独立于 base_items。
 * 新增/编辑/删除后，工单管理「新增工单」的设备下拉会自动反映。
 *
 * 后端契约：GET/POST /api/devices, PUT/DELETE /api/devices/{id}
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, Edit, Delete } from '@element-plus/icons-vue'
import http, { errMessage } from '@/api/http'
import { useBaseItemsStore } from '@/stores/baseItems'
import { useAuthStore } from '@/stores/auth'
import type { DeviceItem } from '@/types'

const baseStore = useBaseItemsStore()
const auth = useAuthStore()
// V1.5 F8：base-data 页动作级权限（设备台账与字典同属 base_items.edit）
const canEditDevice = computed(() => auth.canDoAction('base-data', 'base_items.edit'))

const items = ref<DeviceItem[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)

const q = ref('')
const status = ref('')
const brand = ref('')

const statusZh: Record<string, string> = {
  running: '运行中',
  idle: '空闲',
  repair: '维修中',
  scrapped: '报废',
}
const statusType: Record<string, string> = {
  running: 'success',
  idle: 'info',
  repair: 'warning',
  scrapped: 'danger',
}

async function loadList() {
  loading.value = true
  try {
    const resp = await http.get<{ total: number; items: DeviceItem[] }>('/devices', {
      params: {
        q: q.value || undefined,
        status: status.value || undefined,
        brand: brand.value || undefined,
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

function onPageChange(p: number) {
  page.value = p
  loadList()
}

// ===== 新增 / 编辑 =====

const dialogVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)
const form = reactive({
  id: 0,
  asset_no: '',
  name: '',
  brand: '',
  model: '',
  controller: '',
  workshop: '',
  line_no: '',
  install_date: '',
  status: 'running',
  is_demo: false,
})

function openCreate() {
  isEdit.value = false
  Object.assign(form, {
    id: 0, asset_no: '', name: '', brand: '', model: '',
    controller: '', workshop: '', line_no: '', install_date: '',
    status: 'running', is_demo: false,
  })
  dialogVisible.value = true
}

function openEdit(row: DeviceItem) {
  isEdit.value = true
  Object.assign(form, {
    id: row.id,
    asset_no: row.asset_no,
    name: row.name,
    brand: row.brand,
    model: row.model || '',
    controller: row.controller || '',
    workshop: row.workshop || '',
    line_no: row.line_no || '',
    install_date: row.install_date || '',
    status: row.status,
    is_demo: row.is_demo,
  })
  dialogVisible.value = true
}

async function submit() {
  if (!form.asset_no.trim() || !form.name.trim() || !form.brand.trim()) {
    ElMessage.warning('请填写资产编号 / 名称 / 品牌')
    return
  }
  submitting.value = true
  try {
    const body = {
      asset_no: form.asset_no.trim(),
      name: form.name.trim(),
      brand: form.brand.trim(),
      model: form.model || null,
      controller: form.controller || null,
      workshop: form.workshop || null,
      line_no: form.line_no || null,
      install_date: form.install_date || null,
      status: form.status,
      is_demo: form.is_demo,
    }
    if (isEdit.value) {
      const { asset_no: _an, ...patch } = body
      await http.put(`/devices/${form.id}`, patch)
      ElMessage.success('已更新')
    } else {
      await http.post('/devices', body)
      ElMessage.success('已新增')
    }
    dialogVisible.value = false
    loadList()
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    submitting.value = false
  }
}

async function remove(row: DeviceItem) {
  try {
    await ElMessageBox.confirm(
      `确定删除设备「${row.asset_no} ${row.name}」？若有关联工单将无法删除。`,
      '确认删除设备',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' },
    )
  } catch {
    return
  }
  try {
    await http.delete(`/devices/${row.id}`)
    ElMessage.success('已删除')
    loadList()
  } catch (e) {
    ElMessage.error(errMessage(e))
  }
}

onMounted(() => {
  baseStore.load()
  loadList()
})
</script>

<template>
  <div class="device-tab">
    <el-alert type="info" :closable="false" show-icon class="guide-alert">
      <template #title>设备台账</template>
      设备是<strong>业务主数据</strong>（MES 设备台账），与上方枚举字典（品牌/类别/严重度/故障类型）不同。
      这里增删改后，<RouterLink to="/workorders">工单管理</RouterLink>「新增工单」的设备下拉会自动反映。
    </el-alert>

    <!-- 工具栏 -->
    <div class="toolbar">
      <el-input
        v-model="q"
        placeholder="资产编号 / 名称 / 型号"
        style="width: 200px"
        clearable
        size="small"
        @keyup.enter="search"
      />
      <el-select v-model="status" placeholder="状态" clearable style="width: 120px" size="small">
        <el-option v-for="(label, v) in statusZh" :key="v" :label="label" :value="v" />
      </el-select>
      <el-select v-model="brand" placeholder="品牌" clearable style="width: 160px" size="small">
        <el-option v-for="b in baseStore.byKind('brand')" :key="b.code" :value="b.code">
          {{ baseStore.displayLabel(b) }}
        </el-option>
      </el-select>
      <el-button size="small" type="primary" @click="search">查询</el-button>
      <div class="toolbar-spacer" />
      <el-button size="small" :icon="Refresh" :loading="loading" @click="loadList">刷新</el-button>
      <el-button size="small" type="primary" :icon="Plus" :disabled="!canEditDevice" @click="openCreate">新增设备</el-button>
    </div>

    <!-- 表格 -->
    <div class="section">
      <el-table :data="items" v-loading="loading" size="small" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="asset_no" label="资产编号" width="100">
          <template #default="{ row }"><span style="font-family: monospace">{{ row.asset_no }}</span></template>
        </el-table-column>
        <el-table-column prop="name" label="设备名称" min-width="160" show-overflow-tooltip />
        <el-table-column label="品牌" width="100">
          <template #default="{ row }">
            <el-tag size="small">{{ row.brand }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="model" label="型号" width="110">
          <template #default="{ row }">{{ row.model || '—' }}</template>
        </el-table-column>
        <el-table-column prop="controller" label="系统" width="110">
          <template #default="{ row }">{{ row.controller || '—' }}</template>
        </el-table-column>
        <el-table-column prop="workshop" label="车间" width="90">
          <template #default="{ row }">{{ row.workshop || '—' }}</template>
        </el-table-column>
        <el-table-column prop="line_no" label="产线" width="80">
          <template #default="{ row }">{{ row.line_no || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="(statusType[row.status] as any) ?? 'info'">
              {{ statusZh[row.status] ?? row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-tooltip content="编辑" placement="top">
              <el-button size="small" type="primary" text :icon="Edit" :disabled="!canEditDevice" @click="openEdit(row)" />
            </el-tooltip>
            <el-tooltip content="删除" placement="top">
              <el-button size="small" type="danger" text :icon="Delete" :disabled="!canEditDevice" @click="remove(row)" />
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!items.length && !loading" description="暂无设备；点击「新增设备」添加" />
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next, jumper"
        class="pagination"
        @current-change="onPageChange"
      />
    </div>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? `编辑设备：${form.asset_no}` : '新增设备'" width="680px">
      <el-form label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="资产编号" required>
              <el-input v-model="form.asset_no" :disabled="isEdit" placeholder="如 CN-031" style="font-family: monospace" />
              <span v-if="isEdit" class="form-hint">⚠️ 不允许修改</span>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="设备名称" required>
              <el-input v-model="form.name" placeholder="如 立式加工中心-31" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="品牌" required>
              <el-select v-model="form.brand" filterable allow-create style="width: 100%">
                <el-option v-for="b in baseStore.byKind('brand')" :key="b.code" :value="b.code">
                  {{ baseStore.displayLabel(b) }}
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="型号">
              <el-input v-model="form.model" placeholder="如 VMC850" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="系统">
              <el-input v-model="form.controller" placeholder="如 FANUC 0i-MF" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态">
              <el-select v-model="form.status" style="width: 100%">
                <el-option v-for="(label, v) in statusZh" :key="v" :label="label" :value="v" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="车间">
              <el-input v-model="form.workshop" placeholder="如 机加工车间" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="产线">
              <el-input v-model="form.line_no" placeholder="如 L1" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="安装日期">
              <el-date-picker v-model="form.install_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.device-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.guide-alert {
  line-height: 1.7;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.toolbar-spacer {
  flex: 1;
}
.section {
  background: #fff;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 12px 14px;
}
.pagination {
  margin-top: 14px;
  justify-content: flex-end;
  display: flex;
}
.form-hint {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
</style>
