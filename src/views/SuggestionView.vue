<script setup lang="ts">
/**
 * SuggestionView —— 待补充知识清单（审核流）
 * 数据闭环收口：拒答 / 差评自动汇集的知识缺口，由审核人：
 *   - 「审核录入」：可先编辑内容 → 一键入知识库 + 向量化（origin='feedback'）→ 建议 resolved
 *   - 「拒绝」：审核未通过，不入知识库
 *   - 「已补录 ✓」：已在「知识录入」页手动补录过时，仅标记已处理
 * 后端契约：GET /api/suggestions、POST approve / reject / resolve
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import http, { errMessage } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import type { SuggestionItem } from '@/types'

const auth = useAuthStore()
// V1.5 F8：suggestions 页动作级权限（viewer 仅 view，无审核动作）
const canApprove = computed(() => auth.canDoAction('suggestions', 'suggestions.approve'))
const canReject = computed(() => auth.canDoAction('suggestions', 'suggestions.reject'))
const canResolve = computed(() => auth.canDoAction('suggestions', 'suggestions.resolve'))
const currentUser = computed(() => auth.user?.username ?? 'E1024')

// ===== 删除已录入条目（V1.5 删除闭环） =====
const canDeleteAlarm = computed(() => auth.canDoAction('entry', 'alarms.delete'))
const canDeleteFaq = computed(() => auth.canDoAction('entry', 'faqs.delete'))

/** 从 resolved_ref 解析出已录入条目（type + 条目 id + 展示文案）；解析失败返回 null */
function entryRefInfo(item: SuggestionItem): { type: 'alarm' | 'faq'; id: number | null; label: string } | null {
  const ref = item.resolved_ref
  if (!ref || typeof ref !== 'object') return null
  if (ref.type === 'alarm') {
    const id = Number(ref.id)
    return { type: 'alarm', id: Number.isFinite(id) ? id : null, label: `报警码 #${id}` }
  }
  if (ref.type === 'faq') {
    const id = Number(ref.chunk_id)
    return { type: 'faq', id: Number.isFinite(id) ? id : null, label: `FAQ #${id}` }
  }
  return null
}

/** 当前用户能否删除该已录入条目 */
function canDeleteRef(item: SuggestionItem): boolean {
  const info = entryRefInfo(item)
  if (!info) return false
  return info.type === 'alarm' ? canDeleteAlarm.value : canDeleteFaq.value
}

async function removeEntry(item: SuggestionItem) {
  const info = entryRefInfo(item)
  if (!info || info.id == null) return
  if (!canDeleteRef(item)) {
    ElMessage.warning('当前角色无删除权限')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定删除这条已录入（${info.label}）？\n将同时删除其向量与全文索引，对应建议会回到待审核。`,
      '删除录入',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' },
    )
  } catch {
    return
  }
  try {
    await http.delete(`/knowledge/entry/${info.type}/${info.id}`)
    ElMessage.success('已删除录入，建议已回到待审核')
    await load()
  } catch (e) {
    ElMessage.error(errMessage(e))
  }
}

const items = ref<SuggestionItem[]>([])
const loading = ref(false)
const statusFilter = ref<string>('open')

const sourceZh: Record<string, string> = {
  refused: '拒答',
  negative_feedback: '差评',
  manual: '手动',
  low_score: '低分',
}

const typeZh: Record<string, string> = {
  alarm: '报警码',
  faq: 'FAQ',
  manual_chunk: '手册知识',
  maintenance_tip: '维修经验',
}

const statusType: Record<string, string> = {
  open: 'warning',
  in_progress: 'primary',
  resolved: 'success',
  rejected: 'info',
}

async function load() {
  loading.value = true
  try {
    const params = statusFilter.value ? { status: statusFilter.value } : {}
    const resp = await http.get<SuggestionItem[]>('/suggestions', { params })
    items.value = resp.data
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    loading.value = false
  }
}

// ===== 审核录入 =====

const approveVisible = ref(false)
const approving = ref(false)
const reviewForm = reactive({
  id: 0,
  entry_type: 'faq' as 'faq' | 'alarm',
  title: '',
  body: '',
  brand: '',
  // alarm 字段
  code: '',
  name: '',
  controller: '',
  category: '',
  severity: '',
  description: '',
  cause: '',
  action: '',
  safety_note: '',
})

function openApprove(item: SuggestionItem) {
  Object.assign(reviewForm, {
    id: item.id,
    entry_type: item.suggested_type === 'alarm' ? 'alarm' : 'faq',
    title: item.question,
    body: item.draft_content || '',
    brand: '',
    code: '',
    name: '',
    controller: '',
    category: '',
    severity: '',
    description: '',
    cause: '',
    action: '',
    safety_note: '',
  })
  approveVisible.value = true
}

async function submitApprove() {
  if (approving.value) return
  if (reviewForm.entry_type === 'faq' && !reviewForm.body.trim()) {
    ElMessage.warning('FAQ 正文不能为空')
    return
  }
  if (reviewForm.entry_type === 'alarm' && (!reviewForm.code.trim() || !reviewForm.name.trim())) {
    ElMessage.warning('报警码补录必须填写 code 与 name')
    return
  }
  approving.value = true
  try {
    const body: Record<string, unknown> = {
      entry_type: reviewForm.entry_type,
      brand: reviewForm.brand || undefined,
      created_by: currentUser.value,
    }
    if (reviewForm.entry_type === 'faq') {
      body.title = reviewForm.title || undefined
      body.body = reviewForm.body
    } else {
      Object.assign(body, {
        code: reviewForm.code.trim(),
        name: reviewForm.name.trim(),
        controller: reviewForm.controller || undefined,
        category: reviewForm.category || undefined,
        severity: reviewForm.severity || undefined,
        description: reviewForm.description || undefined,
        cause: reviewForm.cause || undefined,
        action: reviewForm.action || undefined,
        safety_note: reviewForm.safety_note || undefined,
      })
    }
    const resp = await http.post<{ vectorized?: boolean }>(
      `/suggestions/${reviewForm.id}/approve`,
      body,
    )
    ElMessage.success(
      resp.data.vectorized
        ? '已审核通过并录入知识库（已向量化，可检索）'
        : '已审核通过并录入知识库（向量化失败，可稍后补跑）',
    )
    approveVisible.value = false
    await load()
  } catch (e) {
    ElMessage.error(errMessage(e))
  } finally {
    approving.value = false
  }
}

// ===== 拒绝 =====

async function reject(item: SuggestionItem) {
  try {
    await ElMessageBox.confirm(
      `确定拒绝「${item.question}」？该建议将标记为已拒绝，不会进入知识库。`,
      '拒绝建议',
      { type: 'warning', confirmButtonText: '拒绝', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' },
    )
  } catch {
    return
  }
  try {
    await http.post(`/suggestions/${item.id}/reject`, null, { params: { handler: currentUser.value } })
    ElMessage.success('已拒绝')
    await load()
  } catch (e) {
    ElMessage.error(errMessage(e))
  }
}

// ===== 已手动补录过 → 仅标记 =====

async function resolve(item: SuggestionItem) {
  try {
    await ElMessageBox.confirm(
      '已在「知识录入」页手动补录过该内容吗？将标记为已处理。',
      '标记已补录',
      { type: 'info', confirmButtonText: '确认', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await http.post(`/suggestions/${item.id}/resolve`, { handler: currentUser.value })
    ElMessage.success('已标记已补录')
    await load()
  } catch (e) {
    ElMessage.error(errMessage(e))
  }
}

onMounted(load)
</script>

<template>
  <div class="suggestions">
    <div class="toolbar">
      <h2>📝 待补充知识</h2>
      <div class="toolbar-right">
        <el-select v-model="statusFilter" size="small" style="width: 140px" @change="load">
          <el-option label="待审核 (open)" value="open" />
          <el-option label="全部状态" value="" />
          <el-option label="已处理 (resolved)" value="resolved" />
          <el-option label="已拒绝 (rejected)" value="rejected" />
        </el-select>
        <el-button size="small" :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="拒答与差评产生的知识缺口汇集在这里 —— 审核通过后一键录入知识库（自动向量化、可检索）；不合适的点「拒绝」"
      class="hint"
    />

    <div class="list" v-loading="loading">
      <el-empty v-if="!items.length && !loading" description="没有待补充的知识建议" />

      <el-card v-for="item in items" :key="item.id" class="sug-card" shadow="never">
        <div class="sug-head">
          <el-tag size="small" :type="(statusType[item.status] as any) ?? 'info'">
            {{ item.status }}
          </el-tag>
          <el-tag size="small" type="info">{{ sourceZh[item.source] ?? item.source }}</el-tag>
          <el-tag size="small" type="warning">{{ typeZh[item.suggested_type] ?? item.suggested_type }}</el-tag>
          <span class="sug-question">{{ item.question }}</span>
          <template v-if="item.status === 'open'">
            <el-button size="small" type="primary" :disabled="!canApprove" @click="openApprove(item)">审核录入</el-button>
            <el-button size="small" type="danger" plain :disabled="!canReject" @click="reject(item)">拒绝</el-button>
            <el-button size="small" text :disabled="!canResolve" @click="resolve(item)">已补录 ✓</el-button>
          </template>
          <span v-else-if="entryRefInfo(item)" class="sug-ref">
            已录入: {{ entryRefInfo(item)?.label }}
            <el-button
              size="small"
              type="danger"
              text
              :disabled="!canDeleteRef(item)"
              @click="removeEntry(item)"
            >
              删除录入
            </el-button>
          </span>
        </div>
        <div v-if="item.draft_content" class="sug-draft">{{ item.draft_content }}</div>
        <div class="sug-meta">
          <span v-if="item.trace_id">trace: {{ item.trace_id }}</span>
          <span v-if="item.handler">处理人: {{ item.handler }}</span>
          <span v-if="item.created_at">{{ new Date(item.created_at).toLocaleString() }}</span>
        </div>
      </el-card>
    </div>

    <!-- 审核录入弹窗 -->
    <el-dialog v-model="approveVisible" title="审核录入知识库" width="680px" top="6vh">
      <el-form label-width="90px">
        <el-form-item label="录入类型">
          <el-radio-group v-model="reviewForm.entry_type">
            <el-radio-button value="faq">FAQ / 经验</el-radio-button>
            <el-radio-button value="alarm">报警码</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <template v-if="reviewForm.entry_type === 'faq'">
          <el-form-item label="标题">
            <el-input v-model="reviewForm.title" placeholder="审核人可修改标题（缺省用问题原文）" />
          </el-form-item>
          <el-form-item label="正文" required>
            <el-input
              v-model="reviewForm.body"
              type="textarea"
              :rows="6"
              placeholder="补录内容（审核人可修改）"
            />
          </el-form-item>
          <el-form-item label="品牌">
            <el-input v-model="reviewForm.brand" placeholder="如 FANUC（可空=通用）" />
          </el-form-item>
        </template>

        <template v-else>
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="品牌" required>
                <el-input v-model="reviewForm.brand" placeholder="FANUC / MITSUBISHI" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="报警码" required>
                <el-input v-model="reviewForm.code" placeholder="如 SV0401" style="font-family: monospace" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="名称" required>
            <el-input v-model="reviewForm.name" placeholder="报警名称" />
          </el-form-item>
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="类别">
                <el-input v-model="reviewForm.category" placeholder="如 servo（可空）" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="严重度">
                <el-input v-model="reviewForm.severity" placeholder="fault / warning（可空）" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="现象">
            <el-input v-model="reviewForm.description" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item label="可能原因">
            <el-input v-model="reviewForm.cause" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item label="处置步骤">
            <el-input v-model="reviewForm.action" type="textarea" :rows="2" />
          </el-form-item>
        </template>

        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="审核通过后将立即向量化入库，可在「智能问答」检索到；来源标记为反馈补录"
        />
      </el-form>

      <template #footer>
        <el-button @click="approveVisible = false">取消</el-button>
        <el-button type="primary" :loading="approving" @click="submitApprove">
          审核通过并录入
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.suggestions {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  overflow: hidden;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.toolbar h2 {
  margin: 0;
  font-size: 18px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hint {
  flex-shrink: 0;
}

.list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sug-card {
  border-radius: 8px;
}

.sug-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sug-question {
  font-weight: 600;
  flex: 1;
  min-width: 200px;
}

.sug-ref {
  font-size: 12px;
  color: var(--el-color-success);
  font-family: ui-monospace, Consolas, monospace;
}

.sug-draft {
  margin-top: 8px;
  padding: 8px 10px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
}

.sug-meta {
  margin-top: 6px;
  display: flex;
  gap: 14px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  flex-wrap: wrap;
}
</style>
