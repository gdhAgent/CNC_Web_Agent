<script setup lang="ts">
/**
 * BaseDataView —— 基础数据维护 *
 * 4 类 Tab：品牌 / 类别 / 严重度 / 故障类型
 * 表格 + 新增 / 编辑 / 启用禁用 / 删除
 * 后端：GET /api/base-items?kind= + POST + PUT + DELETE
 * 启动时由 main.ts 预加载到 useBaseItemsStore()
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Refresh, Hide, View } from '@element-plus/icons-vue'

import http, { errMessage } from '@/api/http'
import { useBaseItemsStore } from '@/stores/baseItems'
import { useAuthStore } from '@/stores/auth'
import DeviceTab from '@/components/DeviceTab.vue'
import UsersTab from '@/components/UsersTab.vue'
import PermissionMatrixTab from '@/components/PermissionMatrixTab.vue'
import type { BaseItem, BaseItemKind } from '@/types'

const store = useBaseItemsStore()
const auth = useAuthStore()

type ActiveKind = BaseItemKind | 'device' | 'users' | 'permissions'

/** 枚举字典可编辑权限（base-data 页 base_items.edit 动作） */
const canEditBaseItems = computed(() => auth.canDoAction('base-data', 'base_items.edit'))

const KIND_TABS: Array<{ key: BaseItemKind; label: string; desc: string }> = [
  { key: 'brand', label: '品牌', desc: 'CNC 设备品牌（FANUC / 三菱 / 西门子 等）' },
  { key: 'category', label: '报警码类别', desc: '报警码所属分类（伺服 / 主轴 / PMC 等）' },
  { key: 'severity', label: '严重度', desc: '报警码严重等级（提示 / 警告 / 故障 / 严重）' },
  { key: 'fault_type', label: '故障类型', desc: '维修工单故障类型（机械 / 电气 / 液压 等）' },
]

const activeKind = ref<ActiveKind>('brand')
const showInactive = ref(false)
const loading = ref(false)

const items = computed<BaseItem[]>(() => {
  // 设备 / 用户 / 权限 Tab 各自组件自理，不经过枚举字典 store
  if (activeKind.value === 'device' || activeKind.value === 'users' || activeKind.value === 'permissions') return []
  const all = store.byKind(activeKind.value)
  return showInactive.value
    ? store.items.filter((it) => it.kind === activeKind.value).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    : all
})

async function refresh() {
  loading.value = true
  try {
    await store.load(true)
  } finally {
    loading.value = false
  }
}

// ===== 新增 / 编辑 =====

const dialogVisible = ref(false)
const isEdit = ref(false)
const form = reactive({
  id: 0,
  kind: 'brand' as BaseItemKind,
  code: '',
  label_zh: '',
  label_en: '',
  sort_order: 100,
  is_active: true,
})

function openCreate() {
  isEdit.value = false
  Object.assign(form, {
    id: 0,
    kind: activeKind.value,
    code: '',
    label_zh: '',
    label_en: '',
    sort_order: 100,
    is_active: true,
  })
  dialogVisible.value = true
}

function openEdit(row: BaseItem) {
  isEdit.value = true
  Object.assign(form, {
    id: row.id,
    kind: row.kind,
    code: row.code,
    label_zh: row.label_zh,
    label_en: row.label_en,
    sort_order: row.sort_order,
    is_active: row.is_active,
  })
  dialogVisible.value = true
}

async function submit() {
  if (!form.code.trim() || !form.label_zh.trim() || !form.label_en.trim()) {
    ElMessage.warning('请填写 code / 中文名 / 英文名')
    return
  }
  try {
    if (isEdit.value) {
      await http.put(`/base-items/${form.id}`, {
        label_zh: form.label_zh,
        label_en: form.label_en,
        sort_order: form.sort_order,
        is_active: form.is_active,
      })
      ElMessage.success('已更新')
    } else {
      await http.post('/base-items', {
        kind: form.kind,
        code: form.code,
        label_zh: form.label_zh,
        label_en: form.label_en,
        sort_order: form.sort_order,
        is_active: form.is_active,
      })
      ElMessage.success('已新增')
    }
    dialogVisible.value = false
    store.invalidate()
    await refresh()
  } catch (e) {
    ElMessage.error(errMessage(e))
  }
}

async function toggleActive(row: BaseItem) {
  try {
    await http.put(`/base-items/${row.id}`, { is_active: !row.is_active })
    ElMessage.success(row.is_active ? '已停用' : '已启用')
    store.invalidate()
    await refresh()
  } catch (e) {
    ElMessage.error(errMessage(e))
  }
}

async function remove(row: BaseItem) {
  try {
    await ElMessageBox.confirm(
      `确定硬删除「${row.label_zh}（${row.code}）」？\n关联业务数据可能受影响，建议先停用而非删除。`,
      '确认删除',
      { type: 'warning', confirmButtonText: '硬删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' },
    )
  } catch {
    return
  }
  try {
    await http.delete(`/base-items/${row.id}`)
    ElMessage.success('已删除')
    store.invalidate()
    await refresh()
  } catch (e) {
    ElMessage.error(errMessage(e))
  }
}

onMounted(async () => {
  await refresh()
})
</script>

<template>
  <div class="base-data">
    <div class="page-header">
      <h2>🛠 基础数据维护</h2>
      <p class="hint">维护品牌 / 类别 / 严重度 / 故障类型等下拉数据源 + 设备台账；新增或修改后业务侧下拉立即生效</p>
    </div>

    <el-alert type="info" :closable="false" class="guide-alert">
      <template #title>
        <strong>💡 显示规则</strong>
      </template>
      下拉默认显示 <strong>英文 (中文意思)</strong> 格式，例如 <code>FANUC (发那科)</code>。
      中英文相同时只显示一份（如 <code>servo (伺服)</code>）。
      数据库存的是 <code>code</code> 字段（API 兼容用，建议不修改），前端展示用 <code>label_zh</code> + <code>label_en</code>。
    </el-alert>

    <!-- Tab 切换 -->
    <el-tabs v-model="activeKind" type="border-card" class="kind-tabs">
      <el-tab-pane v-for="t in KIND_TABS" :key="t.key" :label="t.label" :name="t.key">
        <div class="tab-desc">{{ t.desc }}</div>
      </el-tab-pane>
      <el-tab-pane label="设备台账" name="device" lazy>
        <DeviceTab />
      </el-tab-pane>
      <el-tab-pane v-if="auth.canDoAction('base-data', 'users.manage')" label="用户管理" name="users" lazy>
        <UsersTab />
      </el-tab-pane>
      <el-tab-pane v-if="auth.canDoAction('base-data', 'permissions.manage')" label="权限矩阵" name="permissions" lazy>
        <PermissionMatrixTab />
      </el-tab-pane>
    </el-tabs>

    <!-- 枚举字典区（设备 / 用户 / 权限 Tab 各自组件自理，不显示本节） -->
    <template v-if="activeKind !== 'device' && activeKind !== 'users' && activeKind !== 'permissions'">
      <!-- 工具栏 -->
      <div class="toolbar">
        <el-checkbox v-model="showInactive">显示已停用</el-checkbox>
        <div class="toolbar-spacer" />
        <el-button :icon="Refresh" :loading="loading" @click="refresh">刷新</el-button>
        <el-button type="primary" :icon="Plus" :disabled="!canEditBaseItems" @click="openCreate">新增</el-button>
      </div>

      <!-- 表格 -->
      <div class="section">
        <el-table :data="items" v-loading="loading" size="small" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="Code（API 用）" width="160">
          <template #default="{ row }">
            <span style="font-family: ui-monospace, Consolas, monospace">{{ row.code }}</span>
          </template>
        </el-table-column>
        <el-table-column label="英文 label_en" min-width="160" prop="label_en" />
        <el-table-column label="中文 label_zh" min-width="160" prop="label_zh" />
        <el-table-column label="展示效果" min-width="200">
          <template #default="{ row }">
            <el-tag size="small">
              {{ row.label_en === row.label_zh ? row.label_en : `${row.label_en} (${row.label_zh})` }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sort_order" label="排序" width="80" sortable />
        <el-table-column label="启用" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="row.is_active ? 'success' : 'info'">
              {{ row.is_active ? '✅ 是' : '⏸ 否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-tooltip content="编辑" placement="top">
              <el-button size="small" type="primary" text :icon="Edit" :disabled="!canEditBaseItems" @click="openEdit(row)" />
            </el-tooltip>
            <el-tooltip :content="row.is_active ? '停用' : '启用'" placement="top">
              <el-button
                size="small"
                :type="row.is_active ? 'warning' : 'success'"
                text
                :icon="row.is_active ? Hide : View"
                :disabled="!canEditBaseItems"
                @click="toggleActive(row)"
              />
            </el-tooltip>
            <el-tooltip content="删除" placement="top">
              <el-button size="small" type="danger" text :icon="Delete" :disabled="!canEditBaseItems" @click="remove(row)" />
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>
        <div class="empty-hint" v-if="items.length === 0">
          当前分类暂无数据，点击右上「新增」添加
        </div>
      </div>
    </template>

    <!-- 新增/编辑弹窗（仅枚举字典用；设备走 DeviceTab 内弹窗） -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? `编辑：${form.label_zh || form.code}` : '新增基础数据'"
      width="640px"
    >
      <el-form label-width="140px" label-position="left">
        <el-form-item label="分类">
          <el-select v-model="form.kind" :disabled="isEdit" style="width: 100%">
            <el-option v-for="t in KIND_TABS" :key="t.key" :label="t.label" :value="t.key" />
          </el-select>
        </el-form-item>
        <el-form-item label="Code" required>
          <el-input
            v-model="form.code"
            :disabled="isEdit"
            placeholder="API 兼容字段；建议大写字母/下划线（如 FANUC, servo）"
          />
          <span v-if="isEdit" class="form-hint">
            ⚠️ Code 不允许修改（API 兼容性）
          </span>
        </el-form-item>
        <el-form-item label="英文名 label_en" required>
          <el-input v-model="form.label_en" placeholder="如 FANUC / servo / fault" />
        </el-form-item>
        <el-form-item label="中文名 label_zh" required>
          <el-input v-model="form.label_zh" placeholder="如 发那科 / 伺服 / 故障" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort_order" :min="0" :max="10000" />
          <span class="form-hint">越小越靠前</span>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.is_active" />
          <span class="form-hint">停用后业务侧下拉不再出现</span>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.base-data {
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

.guide-alert {
  line-height: 1.7;
}

.kind-tabs {
  background: #fff;
}

.tab-desc {
  padding: 4px 0 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
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

.empty-hint {
  text-align: center;
  color: #999;
  padding: 16px;
  font-size: 13px;
}

.form-hint {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
</style>