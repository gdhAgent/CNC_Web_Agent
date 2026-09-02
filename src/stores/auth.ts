/**
 * auth.ts —— 登录态 / 权限 Pinia store（V1.5 F1）
 *
 * 职责：
 * - token 与用户信息 localStorage 持久化（token 是唯一持久键；用户/权限每次启动经 /me 拉取，保证新鲜）
 * - login / fetchMe / logout
 * - canSeePage(pageCode)   路由守卫 + 顶栏导航显隐依据
 * - canDoAction(pageCode, action)  按钮级显隐依据
 *
 * 权限数据来源：GET /api/auth/me 的 visible_pages + actions_by_page。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import http from '@/api/http'
import { AUTH_TOKEN_KEY } from '@/api/http'
import type { AuthUser, LoginResponse, MeResponse } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(localStorage.getItem(AUTH_TOKEN_KEY) || '')
  const user = ref<AuthUser | null>(null)
  const visiblePages = ref<string[]>([])
  const actionsByPage = ref<Record<string, string[]>>({})
  const loaded = ref(false)          // /me 是否已拉取（首次进入受保护页前保证）

  const isLoggedIn = computed(() => !!token.value)

  /** 启动恢复：有 token 则拉 /me 重建权限缓存；失败（过期/无效）清空 */
  async function ensureLoaded(): Promise<boolean> {
    if (!token.value) return false
    if (!loaded.value) {
      try {
        await fetchMe()
      } catch {
        clear()
        return false
      }
    }
    return true
  }

  async function login(username: string, password: string) {
    const resp = await http.post<LoginResponse>('/auth/login', { username, password })
    token.value = resp.data.token
    localStorage.setItem(AUTH_TOKEN_KEY, resp.data.token)
    user.value = resp.data.user
    // 登录响应里已带 user，但权限矩阵仍需 /me 拉一次（login 响应不含 visible_pages）
    await fetchMe()
  }

  async function fetchMe() {
    if (!token.value) return
    const resp = await http.get<MeResponse>('/auth/me')
    user.value = resp.data.user
    visiblePages.value = resp.data.visible_pages
    actionsByPage.value = resp.data.actions_by_page
    loaded.value = true
  }

  /** 页面可见性（顶栏导航 / 路由守卫 / Tab 显隐共用） */
  function canSeePage(pageCode: string): boolean {
    return visiblePages.value.includes(pageCode)
  }

  /** 动作白名单（按钮级显隐；页面不可见或动作不在列表 → false） */
  function canDoAction(pageCode: string, action: string): boolean {
    return actionsByPage.value[pageCode]?.includes(action) ?? false
  }

  async function logout() {
    try {
      await http.post('/auth/logout')
    } catch {
      // 无状态 JWT，清本地即可；网络失败不阻塞登出
    }
    clear()
  }

  function clear() {
    token.value = ''
    user.value = null
    visiblePages.value = []
    actionsByPage.value = {}
    loaded.value = false
    localStorage.removeItem(AUTH_TOKEN_KEY)
  }

  return {
    token,
    user,
    visiblePages,
    actionsByPage,
    loaded,
    isLoggedIn,
    login,
    fetchMe,
    ensureLoaded,
    canSeePage,
    canDoAction,
    logout,
    clear,
  }
})
