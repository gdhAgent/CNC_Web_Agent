/**
 * axios 封装 —— baseURL=/api（vite 代理到 127.0.0.1:8000）
 * 统一从后端错误 JSON（{error:{code,message}}）提取人话 message。
 *
 * V1.5 F2 增强：
 * - 请求拦截器：有 token 自动带 Authorization: Bearer
 * - 响应拦截器：401 → 清 token + 跳登录（登录接口本身的 401 除外，由 LoginView 处理）；
 *               403 → 弹 toast 提示无权限
 */
import axios from 'axios'
import { ElMessage } from 'element-plus'

/** localStorage 存 token 的键（auth store / 拦截器共用；避免循环依赖故放这里） */
export const AUTH_TOKEN_KEY = 'cnc_kb_token'

const http = axios.create({
  baseURL: '/api',
  timeout: 30_000,
})

// 请求：注入 Bearer
http.interceptors.request.use((config) => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应：401 会话失效 / 403 无权限
http.interceptors.response.use(
  (resp) => resp,
  async (error) => {
    const status = error?.response?.status as number | undefined
    const url: string = error?.config?.url ?? ''

    if (status === 401 && !url.includes('/auth/login')) {
      // token 缺失 / 过期 / 无效 → 清 store + 本地 + 跳登录（带 redirect 回跳）
      // 注意：登录接口本身的 401（密码错）不走这里，由 LoginView 处理
      localStorage.removeItem(AUTH_TOKEN_KEY)
      const { useAuthStore } = await import('@/stores/auth')
      useAuthStore().clear()
      const { default: router } = await import('@/router')
      const current = router.currentRoute.value
      if (current.path !== '/login') {
        router.replace({ path: '/login', query: { redirect: current.fullPath } })
      }
    } else if (status === 403) {
      // 后端 require_role / require_action 拒绝；前端正常已按 canDoAction 隐藏，
      // 这里兜底弹提示（如直接手敲 URL 进无权限页）
      ElMessage.error(errMessage(error))
    }

    return Promise.reject(error)
  },
)

/** 从 axios error 中提取后端统一错误 message */
export function errMessage(err: unknown): string {
  const e = err as {
    response?: { data?: { error?: { message?: string } } }
  }
  const m = e?.response?.data?.error?.message
  if (m) return m
  if (axios.isAxiosError(err) && err.response) {
    return `请求失败 (${err.response.status})`
  }
  return '网络错误，请检查后端服务是否已启动'
}

export default http
