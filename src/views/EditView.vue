<script setup>
/**
 * EditView.vue — 编辑 / 删除单笔账目（路由 /record/:id）
 *
 * 独立页面：只复用 AmountPad 与 CategoryGrid 两个组件，不复用 AddView 整页。
 * 保存语义：整行覆盖写回（update 由 repository 刷新 updatedAt）；
 * 删除语义：软删除（deleted 标记），撤销入口交给流水页。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCategoriesStore } from '@/stores/categories'
import { useRecordsStore } from '@/stores/records'
import { toFen, fenToYuan, fenToInput } from '@/utils/format'
import AmountPad from '@/components/AmountPad.vue'
import CategoryGrid from '@/components/CategoryGrid.vue'

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
const confirming = ref(false) // 删除两段式确认态
const toast = ref('')

const cats = computed(() => (type.value === 'expense' ? categories.expense : categories.income))

const display = computed(() => {
  if (!buffer.value) return '0.00'
  const fen = toFen(buffer.value === '.' ? '0.' : buffer.value)
  return fenToYuan(fen)
})

/** 分 → 金额输入缓冲串：去掉无意义的尾随 0 与小数点（35.50 → "35.5"，35.00 → "35"） */
function toBuffer(fen) {
  return fenToInput(fen)
}

let toastTimer = null
function showToast(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 4000)
}

let confirmTimer = null

onMounted(async () => {
  // 冷启动直接访问 /record/:id 时 store 可能尚未加载：先补一次加载，再判定「找不到」
  if (!rec.value) await records.load()
  if (!rec.value) {
    router.replace('/list') // 坏 id / 已删除：回流水页，不白屏
    return
  }
  const r = rec.value
  type.value = r.type
  buffer.value = toBuffer(r.amount)
  categoryId.value = r.categoryId
  note.value = r.note
  date.value = r.date
  isPrivate.value = r.private
  ready.value = true
})

onUnmounted(() => {
  clearTimeout(toastTimer)
  clearTimeout(confirmTimer)
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
    await records.update({
      ...rec.value,
      amount: fen,
      type: type.value,
      categoryId: categoryId.value,
      note: note.value.trim(),
      date: date.value,
      private: isPrivate.value,
    })
    router.back()
  } finally {
    saving.value = false
  }
}

/** 删除两段式：首次点击进入确认态（3 秒后自动复原），3 秒内再点才真正删除 */
function onDeleteClick() {
  if (!confirming.value) {
    confirming.value = true
    clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => (confirming.value = false), 3000)
    return
  }
  clearTimeout(confirmTimer)
  confirming.value = false
  remove()
}

async function remove() {
  if (deleting.value) return
  deleting.value = true
  try {
    // undoable：让流水页弹出「已删除，点这里撤销」
    await records.softDelete(rec.value.id, { undoable: true })
    router.replace('/list')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div v-if="ready" class="page edit">
    <div class="topbar">
      <button class="back" @click="router.back()">‹ 返回</button>
      <h2 class="page-title">编辑</h2>
    </div>

    <!-- 收支切换 + 金额 -->
    <div class="head card">
      <div class="seg">
        <button :class="{ on: type === 'expense' }" @click="switchType('expense')">支出</button>
        <button :class="{ on: type === 'income' }" @click="switchType('income')">收入</button>
      </div>
      <div class="amount" :class="type">¥ {{ display }}</div>
    </div>

    <!-- 分类：保留原分类；原分类已归档时降级显示「未分类」 -->
    <CategoryGrid v-model="categoryId" :cats="cats" />

    <!-- 备注 / 日期 / 私密 -->
    <div class="meta card">
      <input v-model="note" class="note" placeholder="备注（可选）" maxlength="30" />
      <input v-model="date" class="date" type="date" />
      <button
        class="lock"
        :class="{ on: isPrivate }"
        title="私密账单：不同步"
        @click="isPrivate = !isPrivate"
      >
        {{ isPrivate ? '🔒' : '🔓' }}
      </button>
    </div>

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
    <button v-if="toast" class="toast" @click="toast = ''">{{ toast }}</button>
  </div>
</template>

<style scoped>
.edit {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.back {
  font-size: 15px;
  color: var(--text-secondary);
  padding: 8px 0;
}

.topbar .page-title {
  margin: 0;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.seg {
  display: flex;
  background: var(--bg);
  border-radius: 999px;
  padding: 3px;
}

.seg button {
  padding: 6px 18px;
  border-radius: 999px;
  font-size: 14px;
  color: var(--text-secondary);
}

.seg button.on {
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}

.amount {
  font-size: 30px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.amount.income {
  color: var(--income);
}

.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
}

.note {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
  font-size: 14px;
  padding: 6px 0;
}

.date {
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  width: 8.5em;
}

.lock {
  font-size: 17px;
  opacity: 0.55;
  padding: 4px;
}

.lock.on {
  opacity: 1;
}

.del {
  padding: 12px 0;
  border-radius: 10px;
  border: 0.5px solid var(--border);
  background: var(--surface);
  color: var(--danger);
  font-size: 15px;
}

.del.warn {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
  font-weight: 600;
}

.del:disabled {
  opacity: 0.55;
}

.toast {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 14px);
  background: rgba(20, 20, 19, 0.92);
  color: #f1efe8;
  font-size: 13px;
  padding: 10px 16px;
  border-radius: 999px;
  z-index: 20;
  max-width: 86vw;
}
</style>
