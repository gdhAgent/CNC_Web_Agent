<script setup lang="ts">
/**
 * QueryBar —— 输入框 + 品牌筛选 + 示例问题
 */
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'

import { useChatStore } from '@/stores/chat'
import { useBaseItemsStore } from '@/stores/baseItems'

const store = useChatStore()
const baseStore = useBaseItemsStore()
const query = ref('')
const brand = ref<string | undefined>(undefined)

// 品牌下拉来自基础数据维护表（/admin/base-data 可增删改），显示"英文 (中文)"
const brandOptions = computed(() => baseStore.byKind('brand'))

const examples = [
  'SV0401 报警怎么排查',
  '主轴转起来有异响，还报了3001',
  '3号加工中心最近有没有类似故障',
]

function doSend() {
  const q = query.value.trim()
  if (!q) {
    ElMessage.warning('请输入故障现象或报警码')
    return
  }
  store.send(q, { brand: brand.value || undefined })
}

function sendExample(q: string) {
  query.value = q
  doSend()
}
</script>

<template>
  <div class="query-bar">
    <el-input
      v-model="query"
      size="large"
      placeholder="输入故障现象或报警码，如：SV0401 报警 / 主轴有异响"
      clearable
      :disabled="store.streaming"
      @keyup.enter="doSend"
    >
      <template #append>
        <el-button type="primary" :loading="store.streaming" @click="doSend">
          {{ store.streaming ? '分析中' : '检索' }}
        </el-button>
      </template>
    </el-input>

    <div class="row">
      <el-select
        v-model="brand"
        placeholder="品牌筛选（不限）"
        size="small"
        clearable
        class="brand-select"
      >
        <el-option
          v-for="b in brandOptions"
          :key="b.code"
          :label="baseStore.displayLabel(b)"
          :value="b.code"
        />
      </el-select>
      <div class="examples">
        <span class="examples-label">试试：</span>
        <el-tag
          v-for="(q, i) in examples"
          :key="i"
          class="example-tag"
          size="small"
          @click="sendExample(q)"
        >
          {{ q }}
        </el-tag>
      </div>
    </div>
  </div>
</template>

<style scoped>
.query-bar {
  flex-shrink: 0;
}

.row {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.brand-select {
  width: 150px;
}

.examples {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.examples-label {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.example-tag {
  cursor: pointer;
}
</style>
