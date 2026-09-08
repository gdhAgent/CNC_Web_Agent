<script setup lang="ts">
/**
 * RerankProvidersTab —— 重排供应商管理（/api/rerank-providers）
 * - 多 provider（name / base_url / api_key / model），单主用
 * - 主用切换后端 Invalidate 缓存 → 免重启热生效；影响检索结果重排
 * - 与 embedding 共享"API Key"占位回显/留空不变的约定
 */
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Plus, Refresh, Connection, Promotion } from '@element-plus/icons-vue'
import http, { errMessage } from '@/api/http'
import type { RerankProviderItem } from '@/types'

const loading = ref(false)
const items = ref<RerankProviderItem[]>([])

async function load() {
  loading.value = true
  try {
    const resp = await http.get<RerankProviderItem[]>('/rerank-providers')
    items.value = resp.data
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    loading.value = false
  }
}

// ===== 新增 =====
const createVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive({ name: '', base_url: '', api_key: '', model: '' })

function openCreate() {
  Object.assign(createForm, { name: '', base_url: '', api_key: '', model: '' })
  createVisible.value = true
}

async function submitCreate() {
  if (!createForm.name.trim() || !createForm.base_url.trim() || !createForm.model.trim()) {
    ElMessage.warning('请填写名称 / Base URL / 模型')
    return
  }
  createLoading.value = true
  try {
    await http.post('/rerank-providers', {
      name: createForm.name.trim(),
      base_url: createForm.base_url.trim(),
      api_key: createForm.api_key.trim(),
      model: createForm.model.trim(),
    })
    ElMessage.success('已新增供应商')
    createVisible.value = false
    load()
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    createLoading.value = false
  }
}

// ===== 编辑 =====
const editVisible = ref(false)
const editLoading = ref(false)
const editForm = reactive({
  id: 0, name: '', base_url: '', api_key: '', model: '', api_key_placeholder: '',
})

function openEdit(row: RerankProviderItem) {
  Object.assign(editForm, {
    id: row.id,
    name: row.name,
    base_url: row.base_url,
    api_key: '',
    api_key_placeholder: row.api_key ? '已配置（留空保持不变）' : '未配置，可直接填写',
    model: row.model,
  })
  editVisible.value = true
}

async function submitEdit() {
  if (!editForm.name.trim() || !editForm.base_url.trim() || !editForm.model.trim()) {
    ElMessage.warning('请填写名称 / Base URL / 模型')
    return
  }
  editLoading.value = true
  try {
    await http.put(`/rerank-providers/${editForm.id}`, {
      name: editForm.name.trim(),
      base_url: editForm.base_url.trim(),
      api_key: editForm.api_key.trim() || null,
      model: editForm.model.trim(),
    })
    ElMessage.success('已更新')
    editVisible.value = false
    load()
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    editLoading.value = false
  }
}

// ===== 设为主用 =====
async function activate(row: RerankProviderItem) {
  try {
    await ElMessageBox.confirm(
      `将「${row.name}」设为主用？\n下次重排立即切换，无需重启。`,
      '设为主用',
      { type: 'warning', confirmButtonText: '切换', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await http.post(`/rerank-providers/${row.id}/activate`)
    ElMessage.success(`已切到「${row.name}」，热生效`)
    load()
  } catch (e) {
    ElMessage.error(errMessage(e))
  }
}

// ===== 删除 =====
async function remove(row: RerankProviderItem) {
  const msg = row.is_active
    ? `「${row.name}」是当前主用。删除后若无其他主用，重排将回落到 appsettings 配置。仍删除？`
    : `确定删除「${row.name}」？`
  try {
    await ElMessageBox.confirm(msg, '删除供应商', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  try {
    await http.delete(`/rerank-providers/${row.id}`)
    ElMessage.success('已删除')
    load()
  } catch (e) {
    ElMessage.error(errMessage(e))
  }
}

// ===== 测试 =====
const testVisible = ref(false)
const testLoading = ref(false)
const testForm = reactive({ base_url: '', api_key: '', model: '' })
const testResult = ref<{ ok: boolean; message?: string | null; latency_ms?: number } | null>(null)

function openTest(row: RerankProviderItem) {
  Object.assign(testForm, {
    base_url: row.base_url,
    api_key: row.api_key,
    model: row.model,
  })
  testResult.value = null
  testVisible.value = true
}

async function runTest() {
  if (!testForm.base_url.trim() || !testForm.model.trim()) {
    ElMessage.warning('请填写 Base URL 和模型')
    return
  }
  testLoading.value = true
  testResult.value = null
  try {
    const resp = await http.post<{ ok: boolean; message?: string | null; latency_ms?: number }>(
      '/rerank-providers/test',
      {
        base_url: testForm.base_url.trim(),
        api_key: testForm.api_key.trim(),
        model: testForm.model.trim(),
      },
    )
    testResult.value = resp.data
    if (resp.data.ok) ElMessage.success(`测试通过 (${resp.data.latency_ms}ms)`)
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    testLoading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="providers-tab">
    <div class="toolbar">
      <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
      <div class="toolbar-spacer" />
      <el-button type="primary" :icon="Plus" @click="openCreate">新增供应商</el-button>
    </div>

    <el-table :data="items" v-loading="loading" size="small" stripe>
      <el-table-column label="名称" min-width="140">
        <template #default="{ row }">
          {{ row.name }}
          <el-tag v-if="row.is_active" size="small" type="success" style="margin-left: 6px">主用</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Base URL" min-width="240">
        <template #default="{ row }">
          <span style="font-family: ui-monospace, Consolas, monospace">{{ row.base_url }}</span>
        </template>
      </el-table-column>
      <el-table-column label="模型" min-width="180" prop="model" />
      <el-table-column label="API Key" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="row.api_key ? 'success' : 'info'">
            {{ row.api_key ? '已填' : '未填' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="170">
        <template #default="{ row }">
          {{ row.updated_at ? new Date(row.updated_at).toLocaleString() : '—' }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="230" fixed="right">
        <template #default="{ row }">
          <el-button v-if="!row.is_active" size="small" type="success" text :icon="Connection" @click="activate(row)">
            设为主用
          </el-button>
          <el-tooltip content="测试连通性" placement="top">
            <el-button size="small" type="primary" text :icon="Promotion" @click="openTest(row)" />
          </el-tooltip>
          <el-tooltip content="编辑" placement="top">
            <el-button size="small" type="primary" text :icon="Edit" @click="openEdit(row)" />
          </el-tooltip>
          <el-tooltip content="删除" placement="top">
            <el-button size="small" type="danger" text :icon="Delete" @click="remove(row)" />
          </el-tooltip>
        </template>
      </el-table-column>
    </el-table>
    <div class="empty-hint" v-if="items.length === 0">
      暂无 rerank 供应商。可点「新增供应商」添加，或先发起一次提问让系统自动带出默认配置。
    </div>

    <!-- 新增 -->
    <el-dialog v-model="createVisible" title="新增 rerank 供应商" width="560px">
      <el-form label-width="90px" label-position="left">
        <el-form-item label="名称" required>
          <el-input v-model="createForm.name" placeholder="如：本地 BGE-Reranker / SiliconFlow Rerank" />
        </el-form-item>
        <el-form-item label="Base URL" required>
          <el-input v-model="createForm.base_url" placeholder="http(s)://host:port/v1" />
        </el-form-item>
        <el-form-item label="API Key">
          <el-input v-model="createForm.api_key" type="password" show-password placeholder="本地模型可留空" />
        </el-form-item>
        <el-form-item label="模型" required>
          <el-input v-model="createForm.model" placeholder="如 BAAI/bge-reranker-v2-m3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="createLoading" @click="submitCreate">保存</el-button>
      </template>
    </el-dialog>

    <!-- 编辑 -->
    <el-dialog v-model="editVisible" :title="`编辑：${editForm.name}`" width="560px">
      <el-form label-width="90px" label-position="left">
        <el-form-item label="名称" required>
          <el-input v-model="editForm.name" />
        </el-form-item>
        <el-form-item label="Base URL" required>
          <el-input v-model="editForm.base_url" />
        </el-form-item>
        <el-form-item label="API Key">
          <el-input v-model="editForm.api_key" type="password" show-password :placeholder="editForm.api_key_placeholder" />
          <span v-if="editForm.api_key_placeholder.startsWith('已配置')" class="form-hint">留空则保持原 Key 不变</span>
        </el-form-item>
        <el-form-item label="模型" required>
          <el-input v-model="editForm.model" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editLoading" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 测试 -->
    <el-dialog v-model="testVisible" title="测试 rerank 连通性" width="560px">
      <el-form label-width="90px" label-position="left">
        <el-form-item label="Base URL" required>
          <el-input v-model="testForm.base_url" />
        </el-form-item>
        <el-form-item label="API Key">
          <el-input v-model="testForm.api_key" type="password" show-password />
        </el-form-item>
        <el-form-item label="模型" required>
          <el-input v-model="testForm.model" />
        </el-form-item>
      </el-form>
      <div v-if="testResult" class="test-result">
        <el-alert
          :type="testResult.ok ? 'success' : 'error'"
          :closable="false"
          show-icon
          :title="testResult.ok ? `连接正常 (${testResult.latency_ms}ms)` : `连接失败 (${testResult.latency_ms}ms)`"
        >
          {{ testResult.message }}
        </el-alert>
      </div>
      <template #footer>
        <el-button @click="testVisible = false">关闭</el-button>
        <el-button type="primary" :loading="testLoading" :icon="Promotion" @click="runTest">开始测试</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.providers-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}
.toolbar-spacer {
  flex: 1;
}
.empty-hint {
  text-align: center;
  color: var(--el-text-color-secondary);
  padding: 16px;
  font-size: 13px;
}
.form-hint {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
.test-result {
  margin-top: 4px;
}
</style>
