<script setup lang="ts">
/**
 * ToolTrace —— Agent 工具调用轨迹（默认展开）
 *
 * 显示优化：
 * - 按调用顺序编号 1/2/3...
 * - 完整显示 args（不允许截断，超长横向滚动）
 * - 工具名 + 耗时 + 状态三列对齐
 * - args 区域带复制按钮
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'

import { useChatStore } from '@/stores/chat'

const store = useChatStore()
const activeNames = ref(['tools'])

async function copyArgs(args: unknown) {
  try {
    await navigator.clipboard.writeText(JSON.stringify(args, null, 2))
    ElMessage.success('已复制参数')
  } catch {
    ElMessage.error('复制失败')
  }
}
</script>

<template>
  <el-collapse v-if="store.toolCalls.length" v-model="activeNames" class="tool-trace">
    <el-collapse-item :title="`Agent 工具调用轨迹（共 ${store.toolCalls.length} 次）`" name="tools">
      <ol class="tool-list">
        <li v-for="(tc, i) in store.toolCalls" :key="i" class="tool-item">
          <div class="tool-header">
            <span class="tool-seq">{{ i + 1 }}</span>
            <el-tag size="small" :type="tc.ok === false ? 'danger' : 'success'" class="tool-name">
              {{ tc.name }}
            </el-tag>
            <el-tag v-if="tc.ms != null" size="small" type="info" effect="plain" class="tool-ms">
              {{ tc.ms }}ms
            </el-tag>
            <el-tag v-if="tc.ok === false" size="small" type="warning" effect="plain">超时/失败</el-tag>
          </div>
          <div class="tool-args-wrap">
            <pre class="tool-args">{{ JSON.stringify(tc.args, null, 2) }}</pre>
            <el-button
              size="small"
              text
              class="copy-btn"
              @click="copyArgs(tc.args)"
            >
              复制参数
            </el-button>
          </div>
          <div v-if="tc.output" class="tool-output-wrap">
            <div class="output-label">输出摘要：</div>
            <pre class="tool-output">{{ String(tc.output).slice(0, 200) }}{{ String(tc.output).length > 200 ? '…' : '' }}</pre>
          </div>
        </li>
      </ol>
    </el-collapse-item>
  </el-collapse>
</template>

<style scoped>
.tool-trace {
  margin: 10px 14px 6px;
}

.tool-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tool-item {
  padding: 8px 10px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  border-left: 3px solid var(--el-color-primary);
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.tool-seq {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--el-color-primary);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.tool-name {
  font-family: ui-monospace, Consolas, monospace;
}

.tool-ms {
  font-size: 11px;
}

.tool-args-wrap {
  position: relative;
}

.tool-args {
  margin: 0;
  padding: 8px 10px;
  background: #fff;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow: auto;
  color: var(--el-text-color-regular);
}

.copy-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 11px;
}

.tool-output-wrap {
  margin-top: 6px;
}

.output-label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-bottom: 2px;
}

.tool-output {
  margin: 0;
  padding: 6px 10px;
  background: #fff;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, Consolas, monospace;
  max-height: 120px;
  overflow: auto;
}
</style>