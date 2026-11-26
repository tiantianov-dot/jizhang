<script setup>
/**
 * EditView.vue — 编辑 / 删除单笔账目（路由 /record/:id）
 *
 * 独立页面：复用共用输入区块组件，不复用 AddView 整页。
 * 保存语义：整行覆盖写回（update 由 repository 刷新 updatedAt）；
 * 删除语义：软删除（deleted 标记），撤销入口交给流水页。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCategoriesStore } from '@/stores/categories'
import { useRecordsStore } from '@/stores/records'
import { useToast } from '@/composables/useToast'
import { useTwoStepConfirm } from '@/composables/useTwoStepConfirm'
import { fenToInput, formatAmountBuffer, formatRecordSubline, toFen } from '@/utils/format'
import {
  describeDeleteFailure,
  describeWriteFailure,
  DELETE_MESSAGES,
  WRITE_MESSAGES,
} from '@/services/writeOutcome'
import AmountPad from '@/components/AmountPad.vue'
import CategoryGrid from '@/components/CategoryGrid.vue'
import PageTopbar from '@/components/PageTopbar.vue'
import RecordAmountHeader from '@/components/RecordAmountHeader.vue'
import RecordMetaBar from '@/components/RecordMetaBar.vue'

const route = useRoute()
const router = useRouter()
const records = useRecordsStore()
const categories = useCategoriesStore()

const rec = computed(() => records.list.find((r) => r.id === route.params.id))
const ready = ref(false) // 预填完成后才渲染，避免坏 id 时闪一下空表单

const type = ref('expense') // expense | income
const buffer = ref('') // 金额输入缓冲（字符串，形如 "12.3"）
const categoryId = ref('')
const note = ref('')
const date = ref('')
const isPrivate = ref(false)
const saving = ref(false)
const deleting = ref(false)

const { message: toast, show: showToast, clear: clearToast } = useToast({ duration: 4000 })
const { confirming, trigger: triggerDelete } = useTwoStepConfirm({ timeout: 3000 })

const cats = computed(() => (type.value === 'expense' ? categories.expense : categories.income))
const display = computed(() => formatAmountBuffer(buffer.value))
const subline = computed(() => formatRecordSubline(date.value, note.value))

let backTimer = null

onMounted(async () => {
  // 冷启动直接访问 /record/:id 时 store 可能尚未加载：先补一次加载，再判定「找不到」
  if (!rec.value) await records.load()
  if (!rec.value) {
    router.replace('/list') // 坏 id / 已删除：回流水页，不白屏
    return
  }
  const r = rec.value
  type.value = r.type
  buffer.value = fenToInput(r.amount)
  categoryId.value = r.categoryId
  note.value = r.note
  date.value = r.date
  isPrivate.value = r.private
  ready.value = true
})

onUnmounted(() => {
  clearTimeout(backTimer)
})

function switchType(t) {
  type.value = t
  categoryId.value = '' // 与记一笔一致：切换收支后重新选分类
}

async function save() {
  if (saving.value) return
  const fen = toFen(buffer.value || '0')
  if (fen <= 0) {
    showToast('先输入金额')
    return
  }
  if (!categoryId.value) {
    showToast('先选一个分类')
    return
  }
  saving.value = true
  try {
    // 整行覆盖；repository 会刷新 updatedAt（编辑不刷新分类 lastUsedAt，编辑 ≠ 使用）
    const { refreshFailed } = await records.update({
      ...rec.value,
      amount: fen,
      type: type.value,
      categoryId: categoryId.value,
      note: note.value.trim(),
      date: date.value,
      private: isPrivate.value,
    })
    if (refreshFailed) {
      // 写库已成功：显示“已保存”并稍后返回，绝不把本条留在页上误导重复提交
      showToast(WRITE_MESSAGES.refreshFailed)
      clearTimeout(backTimer)
      backTimer = setTimeout(() => router.back(), 1200)
      return
    }
    router.back()
  } catch (err) {
    // 失败留在本页，输入与分类选择原样保留
    showToast(describeWriteFailure(err).message)
  } finally {
    saving.value = false
  }
}

/** 删除两段式：首次点击进入确认态（3 秒后自动复原），3 秒内再点才真正删除 */
function onDeleteClick() {
  triggerDelete(remove)
}

async function remove() {
  if (deleting.value) return
  deleting.value = true
  try {
    // undoable：让流水页弹出「已删除，点这里撤销」
    const { refreshFailed } = await records.softDelete(rec.value.id, { undoable: true })
    if (refreshFailed) {
      showToast(DELETE_MESSAGES.refreshFailed)
      clearTimeout(backTimer)
      backTimer = setTimeout(() => router.replace('/list'), 1200)
      return
    }
    router.replace('/list')
  } catch (err) {
    // 删除失败留在本页；两段式确认已复位，可直接重试
    showToast(describeDeleteFailure(err))
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div v-if="ready" class="page edit">
    <PageTopbar title="编辑" @back="router.back()" />

    <!-- 收支切换 + 金额 -->
    <RecordAmountHeader
      :type="type"
      :display="display"
      :subline="subline"
      @switch-type="switchType"
    />

    <!-- 分类：保留原分类；原分类已归档时降级显示「未分类」 -->
    <CategoryGrid v-model="categoryId" :cats="cats" />

    <!-- 备注 / 日期 / 本机标记 -->
    <RecordMetaBar v-model:note="note" v-model:date="date" v-model:is-private="isPrivate" />

    <!-- 删除：两段式确认，不用 window.confirm -->
    <button
      class="del"
      :class="{ warn: confirming }"
      :disabled="deleting || saving"
      @click="onDeleteClick"
    >
      {{ confirming ? '再点一次确认删除' : '删除这笔账' }}
    </button>

    <!-- 数字键盘 -->
    <AmountPad v-model:buffer="buffer" :saving="saving" @save="save" />

    <!-- 校验反馈 -->
    <button v-if="toast" class="toast" @click="clearToast">{{ toast }}</button>
  </div>
</template>

<style scoped>
.edit {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* danger 语义靠红色底/描边承载，文字用纯白保证深底可读 */
.del {
  padding: 12px 0;
  border-radius: var(--radius-md);
  border: 1px solid var(--danger-soft-border);
  background: var(--danger-soft-bg);
  color: #fff;
  font-size: 15px;
}

.del.warn {
  /* 填充态不能跟 --danger 走亮红：白字在 #ff6b6b 上不足 4.5:1 */
  background: var(--danger-solid);
  border-color: var(--danger-solid);
  color: #fff;
  font-weight: 600;
}

.del:disabled {
  opacity: 0.55;
}
</style>
