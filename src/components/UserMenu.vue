<script setup lang="ts">
/**
 * UserMenu —— 顶栏用户区（V1.5 F5+F6）
 * - 显示真实 display_name + 头像缩写
 * - el-dropdown：个人信息 / 修改密码 / 退出登录（甲方确认基础三项）
 * - 个人信息弹框：只读展示当前用户
 * - 修改密码弹框：旧密码校验 → /api/auth/change-password
 */
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import http, { errMessage } from '@/api/http'

const auth = useAuthStore()
const router = useRouter()

const ROLE_LABEL: Record<string, string> = {
  admin: '管理员',
  operator: '操作员',
  viewer: '只读访客',
}

// ===== 个人信息弹框 =====
const profileVisible = ref(false)

function openProfile() {
  profileVisible.value = true
}

// ===== 修改密码弹框 =====
const pwdVisible = ref(false)
const pwdLoading = ref(false)
const pwdForm = reactive({
  old_password: '',
  new_password: '',
  confirm: '',
})

function openChangePwd() {
  Object.assign(pwdForm, { old_password: '', new_password: '', confirm: '' })
  pwdVisible.value = true
}

async function submitPwd() {
  if (pwdForm.new_password.length < 6) {
    ElMessage.warning('新密码至少 6 位')
    return
  }
  if (pwdForm.new_password !== pwdForm.confirm) {
    ElMessage.warning('两次输入的新密码不一致')
    return
  }
  pwdLoading.value = true
  try {
    await http.post('/auth/change-password', {
      old_password: pwdForm.old_password,
      new_password: pwdForm.new_password,
    })
    ElMessage.success('密码已修改')
    pwdVisible.value = false
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    pwdLoading.value = false
  }
}

// ===== 退出登录 =====
async function doLogout() {
  try {
    await ElMessageBox.confirm('确定退出登录吗？', '退出登录', {
      type: 'warning',
      confirmButtonText: '退出',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  await auth.logout()
  ElMessage.success('已退出登录')
  router.replace('/login')
}

async function handleCommand(cmd: string) {
  if (cmd === 'profile') openProfile()
  else if (cmd === 'password') openChangePwd()
  else if (cmd === 'logout') await doLogout()
}

function initials(name: string): string {
  return (name || '?').slice(0, 1).toUpperCase()
}
</script>

<template>
  <div class="user-menu">
    <el-dropdown trigger="click" @command="handleCommand">
      <span class="user-chip">
        <span class="avatar">{{ initials(auth.user?.display_name ?? '') }}</span>
        <span class="name">{{ auth.user?.display_name || auth.user?.username || '未登录' }}</span>
        <el-icon class="caret"><ArrowDown /></el-icon>
      </span>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="profile">
            <el-icon><User /></el-icon>个人信息
          </el-dropdown-item>
          <el-dropdown-item command="password">
            <el-icon><Lock /></el-icon>修改密码
          </el-dropdown-item>
          <el-dropdown-item command="logout" divided>
            <el-icon><SwitchButton /></el-icon>退出登录
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <!-- 个人信息 -->
    <el-dialog v-model="profileVisible" title="个人信息" width="440px">
      <el-descriptions :column="1" border size="small">
        <el-descriptions-item label="用户名">{{ auth.user?.username }}</el-descriptions-item>
        <el-descriptions-item label="显示名">{{ auth.user?.display_name }}</el-descriptions-item>
        <el-descriptions-item label="角色">
          <el-tag size="small" :type="auth.user?.role === 'admin' ? 'danger' : 'primary'">
            {{ ROLE_LABEL[auth.user?.role ?? ''] || auth.user?.role }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag size="small" :type="auth.user?.is_active ? 'success' : 'info'">
            {{ auth.user?.is_active ? '启用' : '停用' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="最近登录">
          {{ auth.user?.last_login_at ? new Date(auth.user.last_login_at).toLocaleString() : '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">
          {{ auth.user?.created_at ? new Date(auth.user.created_at).toLocaleString() : '—' }}
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>

    <!-- 修改密码 -->
    <el-dialog v-model="pwdVisible" title="修改密码" width="420px">
      <el-form label-width="90px" label-position="left">
        <el-form-item label="旧密码" required>
          <el-input v-model="pwdForm.old_password" type="password" show-password placeholder="请输入旧密码" />
        </el-form-item>
        <el-form-item label="新密码" required>
          <el-input v-model="pwdForm.new_password" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
        <el-form-item label="确认新密码" required>
          <el-input v-model="pwdForm.confirm" type="password" show-password placeholder="再次输入新密码" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdVisible = false">取消</el-button>
        <el-button type="primary" :loading="pwdLoading" @click="submitPwd">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.user-menu {
  display: flex;
  align-items: center;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--el-text-color-primary);
}

.user-chip:hover {
  background: var(--el-fill-color-light);
}

.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--el-color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.name {
  font-size: 14px;
  white-space: nowrap;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.caret {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
