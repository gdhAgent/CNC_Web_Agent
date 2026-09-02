<script setup lang="ts">
/**
 * LoginView —— 登录页（V1.5 F4）
 * - 居中卡片；甲方确认：预填默认演示账号 admin/admin123
 * - 失败抖动动画 + 模糊错误提示（后端 401 统一「用户名或密码错误」，防探活）
 * - 成功跳 redirect 参数（登录前想访问的页）或首页
 */
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Key, User } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { errMessage } from '@/api/http'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const form = reactive({
  username: 'admin',
  password: 'admin123',
})
const loading = ref(false)
const shaking = ref(false)

async function submit() {
  if (!form.username.trim() || !form.password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }
  loading.value = true
  try {
    await auth.login(form.username.trim(), form.password)
    const name = auth.user?.display_name || form.username.trim()
    ElMessage.success(`欢迎回来，${name}`)
    const redirect = (route.query.redirect as string) || '/'
    router.replace(redirect)
  } catch (e) {
    shaking.value = true
    setTimeout(() => (shaking.value = false), 500)
    ElMessage.error(errMessage(e))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card" :class="{ shake: shaking }">
      <div class="brand-row">
        <span class="brand-dot">CNC</span>
        <span class="brand-name">机台智能知识库</span>
      </div>
      <p class="subtitle">故障问答 · 混合检索 · 结构化分析</p>

      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item label="用户名">
          <el-input v-model="form.username" size="large" placeholder="用户名" :prefix-icon="User" autofocus />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="form.password"
            size="large"
            type="password"
            placeholder="密码"
            :prefix-icon="Key"
            show-password
            @keyup.enter="submit"
          />
        </el-form-item>
        <el-button type="primary" size="large" class="login-btn" :loading="loading" @click="submit">
          登 录
        </el-button>
      </el-form>

      <p class="demo-hint">演示账号已预填（生产环境部署前请务必修改默认密码）</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: linear-gradient(135deg, #eef3fb 0%, #e2e9f6 100%);
}

.login-card {
  width: 380px;
  padding: 36px 32px 24px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(31, 55, 110, 0.12);
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 20px;
  font-weight: 700;
}

.brand-dot {
  color: #fff;
  background: var(--el-color-primary);
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 14px;
}

.brand-name {
  color: #1f376e;
}

.subtitle {
  margin: 8px 0 24px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.login-btn {
  width: 100%;
  margin-top: 4px;
  letter-spacing: 4px;
}

.demo-hint {
  margin: 16px 0 0;
  text-align: center;
  color: #a3aab8;
  font-size: 12px;
}

/* 登录失败抖动 */
.shake {
  animation: shake 0.5s ease-in-out;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-10px); }
  40% { transform: translateX(10px); }
  60% { transform: translateX(-6px); }
  80% { transform: translateX(6px); }
}
</style>
