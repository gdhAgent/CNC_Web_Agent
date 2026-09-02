<script setup lang="ts">
/**
 * UsersTab —— 用户管理（V1.5 F7，base-data 页「用户管理」Tab）
 * - 列表 + 筛选（q / role / is_active）+ 分页
 * - 新增 / 编辑（display_name / role / is_active）/ 删除 / 管理员重置密码
 * - 全部走 /api/users（admin 端点；后端 require_role('admin') 兜底）
 */
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Key, Plus, Refresh, Search } from '@element-plus/icons-vue'
import http, { errMessage } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import type { AuthUser, RoleType } from '@/types'

const auth = useAuthStore()

const ROLES: Array<{ value: RoleType; label: string }> = [
  { value: 'admin', label: '管理员' },
  { value: 'operator', label: '操作员' },
  { value: 'viewer', label: '只读访客' },
]

function roleLabel(r?: string): string {
  return ROLES.find((it) => it.value === r)?.label ?? r ?? '—'
}

const loading = ref(false)
const items = ref<AuthUser[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const q = ref('')
const roleFilter = ref<RoleType | ''>('')

async function load() {
  loading.value = true
  try {
    const resp = await http.get<{ items: AuthUser[]; total: number }>('/users', {
      params: {
        q: q.value || undefined,
        role: roleFilter.value || undefined,
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

// ===== 新增 =====
const createVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive({
  username: '',
  display_name: '',
  password: '',
  role: 'viewer' as RoleType,
  is_active: true,
})

function openCreate() {
  Object.assign(createForm, {
    username: '',
    display_name: '',
    password: '',
    role: 'viewer' as RoleType,
    is_active: true,
  })
  createVisible.value = true
}

async function submitCreate() {
  if (!createForm.username.trim() || !createForm.display_name.trim()) {
    ElMessage.warning('请填写用户名和显示名')
    return
  }
  if (createForm.password.length < 6) {
    ElMessage.warning('密码至少 6 位')
    return
  }
  createLoading.value = true
  try {
    await http.post('/users', { ...createForm, username: createForm.username.trim() })
    ElMessage.success('已新增用户')
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
  id: 0,
  username: '',
  display_name: '',
  role: 'viewer' as RoleType,
  is_active: true,
})

function openEdit(row: AuthUser) {
  Object.assign(editForm, {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    role: row.role,
    is_active: row.is_active,
  })
  editVisible.value = true
}

async function submitEdit() {
  if (!editForm.display_name.trim()) {
    ElMessage.warning('请填写显示名')
    return
  }
  editLoading.value = true
  try {
    await http.put(`/users/${editForm.id}`, {
      display_name: editForm.display_name.trim(),
      role: editForm.role,
      is_active: editForm.is_active,
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

// ===== 重置密码（管理员） =====
const resetVisible = ref(false)
const resetLoading = ref(false)
const resetForm = reactive({ id: 0, username: '', new_password: '' })

function openReset(row: AuthUser) {
  Object.assign(resetForm, { id: row.id, username: row.username, new_password: '' })
  resetVisible.value = true
}

async function submitReset() {
  if (resetForm.new_password.length < 6) {
    ElMessage.warning('新密码至少 6 位')
    return
  }
  resetLoading.value = true
  try {
    await http.post(`/users/${resetForm.id}/password`, { new_password: resetForm.new_password })
    ElMessage.success('密码已重置')
    resetVisible.value = false
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    resetLoading.value = false
  }
}

// ===== 删除 =====
async function remove(row: AuthUser) {
  if (auth.user?.id === row.id) {
    ElMessage.warning('不能删除自己')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定删除用户「${row.username}」？此操作不可恢复。`,
      '删除用户',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' },
    )
  } catch {
    return
  }
  try {
    await http.delete(`/users/${row.id}`)
    ElMessage.success('已删除')
    load()
  } catch (e) {
    ElMessage.error(errMessage(e))
  }
}

onMounted(load)
</script>

<template>
  <div class="users-tab">
    <!-- 工具栏 -->
    <div class="toolbar">
      <el-input
        v-model="q"
        :prefix-icon="Search"
        placeholder="搜索用户名 / 显示名"
        clearable
        style="width: 240px"
        @keyup.enter="search"
        @clear="search"
      />
      <el-select v-model="roleFilter" placeholder="全部角色" clearable style="width: 140px" @change="search">
        <el-option v-for="r in ROLES" :key="r.value" :label="r.label" :value="r.value" />
      </el-select>
      <el-button :icon="Search" @click="search">查询</el-button>
      <div class="toolbar-spacer" />
      <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
      <el-button type="primary" :icon="Plus" @click="openCreate">新增用户</el-button>
    </div>

    <!-- 列表 -->
    <el-table :data="items" v-loading="loading" size="small" stripe>
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="username" label="用户名" min-width="120">
        <template #default="{ row }">
          <span style="font-family: ui-monospace, Consolas, monospace">{{ row.username }}</span>
          <el-tag v-if="auth.user?.id === row.id" size="small" type="success" style="margin-left: 6px">我</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="display_name" label="显示名" min-width="120" />
      <el-table-column label="角色" width="110">
        <template #default="{ row }">
          <el-tag size="small" :type="row.role === 'admin' ? 'danger' : row.role === 'operator' ? 'warning' : 'info'">
            {{ roleLabel(row.role) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag size="small" :type="row.is_active ? 'success' : 'info'">
            {{ row.is_active ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="最近登录" width="160">
        <template #default="{ row }">
          {{ row.last_login_at ? new Date(row.last_login_at).toLocaleString() : '—' }}
        </template>
      </el-table-column>
      <el-table-column label="创建人" width="100" prop="created_by" />
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-tooltip content="编辑" placement="top">
            <el-button size="small" type="primary" text :icon="Edit" @click="openEdit(row)" />
          </el-tooltip>
          <el-tooltip content="重置密码" placement="top">
            <el-button size="small" type="warning" text :icon="Key" @click="openReset(row)" />
          </el-tooltip>
          <el-tooltip content="删除" placement="top">
            <el-button size="small" type="danger" text :icon="Delete" @click="remove(row)" />
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

    <!-- 新增 -->
    <el-dialog v-model="createVisible" title="新增用户" width="460px">
      <el-form label-width="90px" label-position="left">
        <el-form-item label="用户名" required>
          <el-input v-model="createForm.username" placeholder="字母/数字/._-（唯一）" />
        </el-form-item>
        <el-form-item label="显示名" required>
          <el-input v-model="createForm.display_name" placeholder="如：张工" />
        </el-form-item>
        <el-form-item label="密码" required>
          <el-input v-model="createForm.password" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="createForm.role" style="width: 100%">
            <el-option v-for="r in ROLES" :key="r.value" :label="r.label" :value="r.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="createForm.is_active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="createLoading" @click="submitCreate">保存</el-button>
      </template>
    </el-dialog>

    <!-- 编辑 -->
    <el-dialog v-model="editVisible" :title="`编辑用户：${editForm.username}`" width="460px">
      <el-form label-width="90px" label-position="left">
        <el-form-item label="显示名" required>
          <el-input v-model="editForm.display_name" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="editForm.role" style="width: 100%">
            <el-option v-for="r in ROLES" :key="r.value" :label="r.label" :value="r.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="editForm.is_active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editLoading" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码 -->
    <el-dialog v-model="resetVisible" :title="`重置密码：${resetForm.username}`" width="420px">
      <el-form label-width="90px" label-position="left">
        <el-form-item label="新密码" required>
          <el-input v-model="resetForm.new_password" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetVisible = false">取消</el-button>
        <el-button type="primary" :loading="resetLoading" @click="submitReset">重置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.users-tab {
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

.pager {
  display: flex;
  justify-content: flex-end;
}
</style>
