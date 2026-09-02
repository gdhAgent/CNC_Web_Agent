/**
 * baseItems.ts —— 基础数据字典 Pinia store
 *
 * 启动时一次性加载所有 kind（brand/category/severity/fault_type），
 * 业务侧下拉从 store 读，避免每次弹窗/页面都打接口。
 *
 * 管理页（BaseDataView）修改后调 invalidate() 触发刷新。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import http from '@/api/http'
import type { BaseItem, BaseItemKind } from '@/types'

export const useBaseItemsStore = defineStore('baseItems', () => {
  const items = ref<BaseItem[]>([])
  const loaded = ref(false)
  const loading = ref(false)

  async function load(force = false) {
    if (loaded.value && !force) return
    loading.value = true
    try {
      const resp = await http.get<{ items: BaseItem[] }>('/base-items')
      items.value = resp.data.items
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  function invalidate() {
    loaded.value = false
  }

  /**
   * 取某一 kind 下启用的项，按 sort_order 排序
   * 显示格式：label_en (label_zh)，如果 zh==en 则只显示一份
   */
  function byKind(kind: BaseItemKind): BaseItem[] {
    return items.value
      .filter((it) => it.kind === kind && it.is_active)
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
  }

  /**
   * 显示文案：「英文 (中文)」（如 "FANUC (发那科)"）
   * 中英文相同时只显示一份
   */
  function displayLabel(it: BaseItem): string {
    if (it.label_en === it.label_zh) return it.label_en
    return `${it.label_en} (${it.label_zh})`
  }

  /**
   * 业务侧下拉专用：code → 完整 BaseItem
   * 用场景：报警表 / 工单里的 brand='FANUC' 还原成 {label_zh:'发那科', label_en:'FANUC', ...}
   */
  function findByCode(kind: BaseItemKind, code: string): BaseItem | undefined {
    return items.value.find((it) => it.kind === kind && it.code === code)
  }

  return {
    items,
    loaded,
    loading,
    load,
    invalidate,
    byKind,
    displayLabel,
    findByCode,
  }
})