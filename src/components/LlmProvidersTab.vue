<script setup lang="ts">
/**
 * LlmProvidersTab —— Chat LLM 供应商管理（/api/llm-providers）
 * - 多 provider（name / base_url / api_key / model + disable_thinking），单主用
 * - 主用切换后端 Invalidate 缓存 → 免重启热生效；只影响 chat 路由
 * - 列表 / 新增 / 编辑 / 删除 / 激活 / 测试 全是 admin 端点
 */
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Plus, Refresh, Connection, Promotion } from '@element-plus/icons-vue'
import http, { errMessage } from '@/api/http'
import type { LlmProviderItem } from '@/types'

const loading = ref(false)
const items = ref<LlmProviderItem[]>([])

async function load() {
  loading.value = true
  try {
    const resp = await http.get<LlmProviderItem[]>('/llm-providers')
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
const createForm = reactive({ name: '', base_url: '', api_key: '', model: '', disable_thinking: false })

function openCreate() {
  Object.assign(createForm, { name: '', base_url: '', api_key: '', model: '', disable_thinking: false })
  createVisible.value = true
}

async function submitCreate() {
  if (!createForm.name.trim() || !createForm.base_url.trim() || !createForm.model.trim()) {
    ElMessage.warning('请填写名称 / Base URL / 模型')
    return
  }
  createLoading.value = true
  try {
    await http.post('/llm-providers', { ...createForm, name: createForm.name.trim() })
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
const editForm = reactive({ id: 0, name: '', base_url: '', api_key: '', model: '', disable_thinking: false, api_key_placeholder: '' })

function openEdit(row: LlmProviderItem) {
  Object.assign(editForm, {
    id: row.id,
    name: row.name,
    base_url: row.base_url,
    api_key: '',
    api_key_placeholder: row.api_key ? '已配置（留空保持不变）' : '未配置，可直接填写',
    model: row.model,
    disable_thinking: row.disable_thinking,
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
    await http.put(`/llm-providers/${editForm.id}`, {
      name: editForm.name.trim(),
      base_url: editForm.base_url.trim(),
      api_key: editForm.api_key.trim() || null,
      model: editForm.model.trim(),
      disable_thinking: editForm.disable_thinking,
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
async function activate(row: LlmProviderItem) {
  try {
    await ElMessageBox.confirm(
      `将「${row.name}」设为主用？\n下次提问立即切换，无需重启。`,
      '设为主用',
      { type: 'warning', confirmButtonText: '切换', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await http.post(`/llm-providers/${row.id}/activate`)
    ElMessage.success(`已切到「${row.name}」，热生效`)
    load()
  } catch (e) {
    ElMessage.error(errMessage(e))
  }
}

// ===== 删除 =====
async function remove(row: LlmProviderItem) {
  const msg = row.is_active
    ? `「${row.name}」是当前主用。删除后若无其他主用，提问将回落到 appsettings 配置。仍删除？`
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
    await http.delete(`/llm-providers/${row.id}`)
    ElMessage.success('已删除')
    load()
  } catch (e) {
    ElMessage.error(errMessage(e))
  }
}

// ===== 测试 =====
const testVisible = ref(false)
const testLoading = ref(false)
const testForm = reactive({ name: '', base_url: '', api_key: '', model: '', disable_thinking: false })
const testResult = ref<{ ok: boolean; message?: string | null; latency_ms?: number } | null>(null)

function openTest(row: LlmProviderItem) {
  Object.assign(testForm, {
    name: row.name,
    base_url: row.base_url,
    api_key: row.api_key,
    model: row.model,
    disable_thinking: row.disable_thinking,
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
    const resp = await http.post<{ ok: boolean; message?: string | null; latency_ms?: number }>('/llm-providers/test', {
      base_url: testForm.base_url.trim(),
      api_key: testForm.api_key.trim(),
      model: testForm.model.trim(),
      disable_thinking: testForm.disable_thinking,
    })
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
      <el-table-column label="名称" min-width="150">
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
      <el-table-column label="模型" min-width="140" prop="model" />
      <el-table-column label="API Key" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="row.api_key ? 'success' : 'info'">
            {{ row.api_key ? '已填' : '未填' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="关思考" width="70">
        <template #default="{ row }">
          <el-tag v-if="row.disable_thinking" size="small" type="warning">开</el-tag>
          <span v-else style="color: #c0c4cc">—</span>
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
      暂无 chat 供应商。可点「新增供应商」添加，或先发起一次提问让系统自动带出默认配置。
    </div>

    <!-- 新增 -->
    <el-dialog v-model="createVisible" title="新增 chat 供应商" width="560px">
      <el-form label-width="90px" label-position="left">
        <el-form-item label="名称" required>
          <el-input v-model="createForm.name" placeholder="如：本地千问 / DeepSeek / SiliconFlow" />
        </el-form-item>
        <el-form-item label="Base URL" required>
          <el-input v-model="createForm.base_url" placeholder="http(s)://host:port/v1" />
        </el-form-item>
        <el-form-item label="API Key">
          <el-input v-model="createForm.api_key" type="password" show-password placeholder="本地模型可留空" />
        </el-form-item>
        <el-form-item label="模型" required>
          <el-input v-model="createForm.model" placeholder="如 qwen3.5-397b / deepseek-chat（/v1/models 可查 id）" />
        </el-form-item>
        <el-form-item label="关思考">
          <el-switch v-model="createForm.disable_thinking" />
          <span class="form-hint">vLLM Qwen3.5 等默认 thinking → 需开启，否则返回空正文</span>
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
        <el-form-item label="关思考">
          <el-switch v-model="editForm.disable_thinking" />
          <span class="form-hint">vLLM Qwen3.5 等默认 thinking → 需开启，否则返回空正文</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editLoading" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 测试 -->
    <el-dialog v-model="testVisible" :title="`测试连接：${testForm.name}`" width="560px">
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
        <el-form-item label="关思考">
          <el-switch v-model="testForm.disable_thinking" />
          <span class="form-hint">vLLM Qwen3.5 等默认 thinking → 需开启，否则返回空正文</span>
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
