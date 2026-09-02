/**
 * 路由 —— 页面视图（懒加载）
 * ChatView 是主界面；TraceView 带 /trace/:traceId 参数
 *
 * V1.5 F3 增强：
 * - 每条受保护路由 meta.requiresAuth + meta.pageCode（与后端 ops.role_permissions.page_code 对齐）
 * - 全局前置守卫：未登录 → /login（带 redirect 回跳）；无该页可见权限 → 回首页
 * - /login 已登录访问 → 回首页
 */
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { title: '登录' },
    },
    {
      path: '/',
      name: 'chat',
      component: () => import('@/views/ChatView.vue'),
      meta: { title: '智能问答', requiresAuth: true, pageCode: 'chat' },
    },
    {
      path: '/knowledge',
      name: 'knowledge',
      component: () => import('@/views/KnowledgeView.vue'),
      meta: { title: '知识库管理', requiresAuth: true, pageCode: 'knowledge' },
    },
    {
      path: '/entry',
      name: 'entry',
      component: () => import('@/views/EntryView.vue'),
      meta: { title: '知识录入', requiresAuth: true, pageCode: 'entry' },
    },
    {
      path: '/trace/:traceId',
      name: 'trace',
      component: () => import('@/views/TraceView.vue'),
      meta: { title: '检索排查', requiresAuth: true, pageCode: 'trace' },
    },
    {
      path: '/logs',
      name: 'logs',
      component: () => import('@/views/QueryLogView.vue'),
      meta: { title: '查询日志', requiresAuth: true, pageCode: 'logs' },
    },
    {
      path: '/suggestions',
      name: 'suggestions',
      component: () => import('@/views/SuggestionView.vue'),
      meta: { title: '待补充知识', requiresAuth: true, pageCode: 'suggestions' },
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { title: '故障看板', requiresAuth: true, pageCode: 'dashboard' },
    },
    {
      path: '/workorders',
      name: 'workorders',
      component: () => import('@/views/WorkOrderView.vue'),
      meta: { title: '工单管理', requiresAuth: true, pageCode: 'workorders' },
    },
    {
      path: '/admin/base-data',
      name: 'base-data',
      component: () => import('@/views/BaseDataView.vue'),
      meta: { title: '基础数据', requiresAuth: true, pageCode: 'base-data' },
    },
    {
      path: '/vectors',
      name: 'vectors',
      component: () => import('@/views/VectorView.vue'),
      meta: { title: '向量总览', requiresAuth: true, pageCode: 'vectors' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // 登录页：已登录直接回首页
  if (to.name === 'login') {
    if (auth.isLoggedIn) return { path: '/' }
    return true
  }

  // 受保护页
  if (to.meta.requiresAuth) {
    if (!auth.isLoggedIn) {
      return { path: '/login', query: { redirect: to.fullPath } }
    }
    const ok = await auth.ensureLoaded()
    if (!ok) {
      return { path: '/login', query: { redirect: to.fullPath } }
    }
    const pageCode = to.meta.pageCode as string | undefined
    if (pageCode && !auth.canSeePage(pageCode)) {
      // 无该页可见权限 → 回首页（顶栏已隐藏导航，这里兜底手敲 URL 场景）
      return { path: '/' }
    }
  }
  return true
})

export default router
