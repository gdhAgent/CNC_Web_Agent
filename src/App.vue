<script setup lang="ts">
/**
 * 应用外壳：顶栏导航 + 内容区路由出口
 * V1.5 F5：导航按 canSeePage(pageCode) 过滤；右侧真实用户下拉菜单（UserMenu）
 */
import { computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import UserMenu from '@/components/UserMenu.vue'

const auth = useAuthStore()

/** 导航项：path ↔ 后端权限 page_code ↔ 中文名 */
const NAV_ITEMS = [
  { path: '/', pageCode: 'chat', label: '智能问答' },
  { path: '/knowledge', pageCode: 'knowledge', label: '知识库管理' },
  { path: '/entry', pageCode: 'entry', label: '知识录入' },
  { path: '/workorders', pageCode: 'workorders', label: '工单管理' },
  { path: '/logs', pageCode: 'logs', label: '查询日志' },
  { path: '/suggestions', pageCode: 'suggestions', label: '待补充知识' },
  { path: '/dashboard', pageCode: 'dashboard', label: '故障看板' },
  { path: '/vectors', pageCode: 'vectors', label: '向量总览' },
  { path: '/admin/base-data', pageCode: 'base-data', label: '基础数据' },
]

const visibleNav = computed(() => NAV_ITEMS.filter((it) => auth.canSeePage(it.pageCode)))

onMounted(() => {
  // 路由守卫已确保 loaded；这里兜底（直接进入 /login 场景也保证有用户信息）
  auth.ensureLoaded()
})
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-dot">CNC</span>
        <span>机台智能知识库</span>
      </div>
      <nav class="nav">
        <RouterLink v-for="it in visibleNav" :key="it.pageCode" :to="it.path" class="nav-link">
          {{ it.label }}
        </RouterLink>
      </nav>
      <UserMenu />
    </header>
    <main class="content">
      <div class="content-inner">
        <RouterView />
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f4f6fa;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0 24px;
  height: 56px;
  border-bottom: 1px solid var(--el-border-color-light);
  background: #fff;
  flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-weight: 600;
  font-size: 16px;
  white-space: nowrap;
}

.brand-dot {
  color: #fff;
  background: var(--el-color-primary);
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 12px;
}

.nav {
  display: flex;
  gap: 4px;
  flex: 1;
  overflow-x: auto;
}

.nav-link {
  padding: 6px 12px;
  border-radius: 6px;
  color: var(--el-text-color-regular);
  text-decoration: none;
  font-size: 14px;
  white-space: nowrap;
}

.nav-link:hover {
  background: var(--el-fill-color-light);
}

.nav-link.router-link-active {
  color: var(--el-color-primary);
  font-weight: 600;
  background: var(--el-color-primary-light-9);
}

.content {
  flex: 1;
  overflow: hidden;
}

.content-inner {
  height: 100%;
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px;
  box-sizing: border-box;
  overflow-y: auto;
}

@media (max-width: 1000px) {
  .content-inner {
    padding: 16px;
  }
}

@media (max-width: 700px) {
  .content-inner {
    padding: 12px;
  }
  .topbar {
    padding: 0 12px;
    gap: 12px;
  }
  .brand {
    font-size: 14px;
  }
}
</style>
