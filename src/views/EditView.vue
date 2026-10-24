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
import { toFen, fenToYuan, fenToInput, todayStr } from '@/utils/format'
import {
  describeDeleteFailure,
  describeWriteFailure,
  DELETE_MESSAGES,
  WRITE_MESSAGES,
} from '@/services/writeOutcome'
import AmountPad from '@/components/AmountPad.vue'
import CategoryGrid from '@/components/CategoryGrid.vue'
import GlassPanel from '@/components/GlassPanel.vue'

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

/** 头卡副行：今天 / M月D日，有备注时用「 · 」连接 */
const subline = computed(() => {
  const day = date.value === todayStr() ? '今天' : ''
  const [, m, d] = (date.value || '').split('-')
  const label = day || (m && d ? `${Number(m)}月${Number(d)}日` : '')
  const n = note.value.trim()
  return n ? [label, n].filter(Boolean).join(' · ') : label
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
    <div class="topbar">
      <button class="back" @click="router.back()">‹ 返回</button>
      <h2 class="page-title">编辑</h2>
    </div>

    <!-- 收支切换 + 金额 -->
    <GlassPanel shape="panel" class="head">
      <div class="seg">
        <button :class="{ on: type === 'expense' }" @click="switchType('expense')">支出</button>
        <button :class="{ on: type === 'income' }" @click="switchType('income')">收入</button>
      </div>
      <div class="amount" :class="type"><span class="cur">¥</span>{{ display }}</div>
      <div class="sub">{{ subline }}</div>
    </GlassPanel>

    <!-- 分类：保留原分类；原分类已归档时降级显示「未分类」 -->
    <CategoryGrid v-model="categoryId" :cats="cats" />

    <!-- 备注 / 日期 / 私密 -->
    <GlassPanel shape="chip" class="meta">
      <input v-model="note" class="note" placeholder="备注（可选）" maxlength="30" />
      <div class="right">
        <input v-model="date" class="date" type="date" />
        <button
          class="lock pill"
          :class="{ on: isPrivate }"
          title="私密账单：不同步"
          @click="isPrivate = !isPrivate"
        >
          {{ isPrivate ? '🔒' : '🔓' }}
        </button>
      </div>
    </GlassPanel>

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
  border-radius: var(--glass-radius-panel);
  padding: 13px 16px 15px;
  margin-top: 2px;
  overflow: visible;
}

.head .seg {
  display: inline-flex;
  padding: 3px;
  border-radius: 999px;
  background: var(--glass-well);
}

.head .seg button {
  appearance: none;
  -webkit-appearance: none;
  border: 0;
  background: transparent;
  color: var(--on-glass-2);
  font-size: 12px;
  padding: 5px 14px;
  border-radius: 999px;
}

.head .seg button.on {
  background: var(--glass-active-fill);
  color: var(--on-glass);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    0 1px 4px rgba(0, 0, 0, 0.18);
}

.head .amount {
  margin-top: 9px;
  font-size: 44px;
  font-weight: 250;
  letter-spacing: -1.6px;
  line-height: 1.04;
  font-variant-numeric: tabular-nums;
}

.head .amount .cur {
  font-size: 24px;
  opacity: 0.68;
  margin-right: 3px;
  letter-spacing: 0;
}

.head .amount.income {
  color: var(--income);
}

.head .sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--on-glass-2);
}

.meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 14px;
  color: var(--on-glass-2);
  font-size: 12px;
  text-shadow: var(--on-glass-shadow);
  box-shadow: var(--glass-lift-shadow);
}

.meta .right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

.meta .pill {
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--glass-well);
  color: var(--on-glass-2);
  font-size: 12px;
  line-height: 1.2;
}

.meta .note {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--on-glass);
  font-size: 14px;
  padding: 2px 0;
}

.meta .date {
  border: none;
  outline: none;
  background: transparent;
  color: var(--on-glass-2);
  font-size: 12px;
  width: 7.8em;
  flex: none;
}

.meta .pill.on {
  background: var(--glass-active-fill);
  color: var(--on-glass);
}

.meta .lock {
  font-size: 17px;
  opacity: 0.55;
}

.meta .lock.on {
  opacity: 1;
}

/* danger 语义靠红色底/描边承载，文字用纯白保证深底可读 */
.del {
  padding: 12px 0;
  border-radius: 10px;
  border: 1px solid rgba(163, 45, 45, 0.55);
  background: rgba(163, 45, 45, 0.22);
  color: #fff;
  font-size: 15px;
}

.del.warn {
  /* 填充态不能跟 --danger 走亮红：白字在 #ff6b6b 上不足 4.5:1 */
  background: #c0392b;
  border-color: #c0392b;
  color: #fff;
  font-weight: 600;
}

.del:disabled {
  opacity: 0.55;
}
</style>
