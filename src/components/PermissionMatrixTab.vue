<script setup lang="ts">
/**
 * PermissionMatrixTab —— 权限矩阵（V1.5 F7，base-data 页「权限矩阵」Tab）
 * 甲方确认展示粒度：选角色 → 页面层 can_access 开关 + 动作层 actions 复选框（上下两层同屏）
 * 数据源：GET/PUT /api/role-permissions/{role}（admin 端点）
 *
 * 注意：admin 角色改自己的权限可能把自己锁出去 —— 保存时仅轻提示，不拦截（甲方可重跑 seed 恢复）。
 */
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import http, { errMessage } from '@/api/http'
import type { RolePermissionItem, RoleType } from '@/types'

const ROLES: Array<{ value: RoleType; label: string; desc: string }> = [
  { value: 'admin', label: 'admin', desc: '全部页面 + 全部动作（含用户/权限管理）' },
  { value: 'operator', label: 'operator', desc: '业务页可编辑；无基础数据入口' },
  { value: 'viewer', label: 'viewer', desc: '只读视图 + feedback' },
]

/** 动作码 → 中文释义（与 007_role_permissions_seed.sql 动作码对齐；未命中回退显示码本身） */
const ACTION_LABELS: Record<string, string> = {
  view: '页面可访问',
  query: '提问检索',
  feedback: '评价反馈',
  'documents.upload': '上传文档',
  'documents.delete': '删除文档',
  'chunks.view': '查看知识块',
  'alarms.create': '新增报警码',
  'alarms.edit': '编辑报警码',
  'alarms.delete': '删除报警码',
  'faqs.create': '新增 FAQ',
  'faqs.edit': '编辑 FAQ',
  'faqs.delete': '删除 FAQ',
  'import.template': 'Excel 导入 / 模板',
  export: '导出知识库',
  'suggestions.approve': '审核录入',
  'suggestions.reject': '拒绝建议',
  'suggestions.resolve': '标记已补录',
  'workorders.create': '新增工单',
  'workorders.edit': '编辑工单',
  'workorders.delete': '删除工单',
  'vectors.vectorize': '补跑向量',
  'base_items.edit': '维护字典 / 设备',
  'users.manage': '用户管理',
  'permissions.manage': '权限矩阵',
}

/** 动作码 → 中文（未命中回退码本身） */
function actionLabel(a: string): string {
  return ACTION_LABELS[a] ?? a
}

/** 页面与可配动作全集（与 007_role_permissions_seed.sql 对齐，前端展示用） */
const PAGE_DEFS: Array<{ page_code: string; label: string; actionOptions: string[] }> = [
  { page_code: 'chat', label: '智能问答', actionOptions: ['view', 'query', 'feedback'] },
  { page_code: 'knowledge', label: '知识库管理', actionOptions: ['view', 'documents.upload', 'documents.delete', 'chunks.view'] },
  {
    page_code: 'entry',
    label: '知识录入',
    actionOptions: [
      'view', 'alarms.create', 'alarms.edit', 'alarms.delete',
      'faqs.create', 'faqs.edit', 'faqs.delete', 'import.template', 'export',
    ],
  },
  { page_code: 'trace', label: '检索排查', actionOptions: ['view'] },
  { page_code: 'logs', label: '查询日志', actionOptions: ['view', 'feedback'] },
  { page_code: 'suggestions', label: '待补充知识', actionOptions: ['view', 'suggestions.approve', 'suggestions.reject', 'suggestions.resolve'] },
  { page_code: 'dashboard', label: '故障看板', actionOptions: ['view'] },
  { page_code: 'workorders', label: '工单管理', actionOptions: ['view', 'workorders.create', 'workorders.edit', 'workorders.delete'] },
  { page_code: 'vectors', label: '向量总览', actionOptions: ['view', 'vectors.vectorize'] },
  { page_code: 'base-data', label: '基础数据', actionOptions: ['view', 'base_items.edit', 'users.manage', 'permissions.manage'] },
]

interface RowState {
  page_code: string
  label: string
  can_access: boolean
  actions: string[]
  actionOptions: string[]
}

const role = ref<RoleType>('admin')
const rows = ref<RowState[]>([])
const loading = ref(false)
const saving = ref(false)
const dirty = ref(false)

const touchedRows = computed(() => rows.value.filter((r) => r.can_access))

async function load() {
  loading.value = true
  try {
    const resp = await http.get<{ role: RoleType; items: RolePermissionItem[] }>(`/role-permissions/${role.value}`)
    const byCode = new Map(resp.data.items.map((it) => [it.page_code, it]))
    rows.value = PAGE_DEFS.map((def) => {
      const row = byCode.get(def.page_code)
      return {
        page_code: def.page_code,
        label: def.label,
        can_access: row ? row.can_access : false,
        actions: row ? [...row.actions] : [],
        actionOptions: [...def.actionOptions],
      }
    })
    dirty.value = false
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    loading.value = false
  }
}

function markDirty() {
  dirty.value = true
}

async function save() {
  saving.value = true
  try {
    await http.put(`/role-permissions/${role.value}`, {
      items: rows.value.map((r) => ({ page_code: r.page_code, can_access: r.can_access, actions: r.actions })),
    })
    ElMessage.success('权限矩阵已保存')
    dirty.value = false
    await load()
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    saving.value = false
  }
}

function toggleAccess() {
  markDirty()
}

function toggleAction(row: RowState, action: string) {
  const idx = row.actions.indexOf(action)
  if (idx >= 0) row.actions.splice(idx, 1)
  else row.actions.push(action)
  markDirty()
}

onMounted(load)
</script>

<template>
  <div class="perm-tab">
    <!-- 角色选择 -->
    <div class="role-bar">
      <span class="role-label">选择角色：</span>
      <el-radio-group v-model="role" @change="load">
        <el-radio-button v-for="r in ROLES" :key="r.value" :value="r.value">{{ r.label }}</el-radio-button>
      </el-radio-group>
      <span class="role-desc">{{ ROLES.find((r) => r.value === role)?.desc }}</span>
    </div>

    <!-- 页面层 + 动作层 -->
    <el-table :data="rows" v-loading="loading" size="small" stripe>
      <el-table-column label="页面" width="160">
        <template #default="{ row }">
          <strong>{{ row.label }}</strong>
          <div class="page-code">{{ row.page_code }}</div>
        </template>
      </el-table-column>
      <el-table-column label="页面可见" width="120">
        <template #default="{ row }">
          <el-switch v-model="row.can_access" @change="toggleAccess" />
        </template>
      </el-table-column>
      <el-table-column label="动作权限">
        <template #default="{ row }">
          <div class="action-checkboxes" :class="{ disabled: !row.can_access }">
            <el-checkbox
              v-for="a in row.actionOptions"
              :key="a"
              :model-value="row.actions.includes(a)"
              :disabled="!row.can_access"
              @change="toggleAction(row, a)"
            >
              <span class="action-zh">{{ actionLabel(a) }}</span>
              <code class="action-code">{{ a }}</code>
            </el-checkbox>
          </div>
          <div v-if="!row.can_access" class="no-access-hint">页面不可见时动作不生效</div>
        </template>
      </el-table-column>
    </el-table>

    <div class="footer-bar">
      <span class="tips">
        当前角色可访问 {{ touchedRows.length }}/{{ PAGE_DEFS.length }} 个页面。保存为整角色替换（事务）。
      </span>
      <div class="footer-spacer" />
      <el-button :icon="Refresh" :loading="loading" @click="load">重新加载</el-button>
      <el-button type="primary" :loading="saving" :disabled="!dirty" @click="save">保存矩阵</el-button>
    </div>
  </div>
</template>

<style scoped>
.perm-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.role-bar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.role-label {
  color: var(--el-text-color-regular);
  font-size: 14px;
}

.role-desc {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.page-code {
  color: #909399;
  font-size: 12px;
  font-family: ui-monospace, Consolas, monospace;
}

.action-checkboxes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 20px;
}

.action-checkboxes.disabled {
  opacity: 0.45;
}

.action-zh {
  color: var(--el-text-color-regular);
  font-size: 13px;
}

.action-code {
  margin-left: 6px;
  color: #909399;
  font-size: 12px;
}

.no-access-hint {
  color: #c0c4cc;
  font-size: 12px;
  margin-top: 4px;
}

.footer-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.footer-spacer {
  flex: 1;
}

.tips {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
