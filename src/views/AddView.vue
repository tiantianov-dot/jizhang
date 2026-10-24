<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCategoriesStore } from '@/stores/categories'
import { useRecordsStore } from '@/stores/records'
import { useAppearanceStore } from '@/stores/appearance'
import { useBackgroundStore } from '@/stores/background'
import { useImmersive } from '@/composables/useImmersive'
import { toFen, fenToYuan, fenToInput, todayStr } from '@/utils/format'
import { parseEntryQuery, parseEntryJson } from '@/services/entry'
import {
  describeUndoFailure,
  describeWriteFailure,
  UNDO_MESSAGES,
  WRITE_MESSAGES,
} from '@/services/writeOutcome'
import AmountPad from '@/components/AmountPad.vue'
import CategoryGrid from '@/components/CategoryGrid.vue'
import GlassPanel from '@/components/GlassPanel.vue'
import ImmersiveLayer from '@/components/ImmersiveLayer.vue'

const route = useRoute()
const router = useRouter()
const categories = useCategoriesStore()
const records = useRecordsStore()
const appearance = useAppearanceStore()
const background = useBackgroundStore()

const type = ref('expense') // expense | income
const buffer = ref('') // 金额输入缓冲（字符串，形如 "12.3"）
const categoryId = ref('')
const note = ref('')
const date = ref(todayStr())
const isPrivate = ref(false) // 私密账单：只存本地，永不同步（Phase 3 同步时跳过）
const saving = ref(false) // 写库期间禁用 ✓，避免连点重复入账
const toast = ref('')

let toastTimer = null
let lastSavedId = null

const {
  state: immersiveState,
  stream: immersiveStream,
  parallax: immersiveParallax,
  open: openImmersive,
  close: closeImmersive,
} = useImmersive({
  onCameraError: () => {
    // toast 点击即撤销上一笔；相机错误提示不应复用这个动作
    lastSavedId = null
    showToast('相机不可用，已退出沉浸背景')
  },
})

const immersiveLabel = computed(() => {
  if (immersiveState.value === 'requesting') return '启动中…'
  if (immersiveState.value === 'closed') return '取景'
  return '关闭'
})

/** L2 已取消：V5 全部区块使用同一套真玻璃 */

function toggleImmersive() {
  if (immersiveState.value === 'closed') openImmersive()
  else closeImmersive()
}

// 场景联动只走 previewIntensity：临时偏移不写库，退出即恢复持久值
watch(
  immersiveState,
  (next, prev) => {
    if (next === prev) return
    background.setSuspended(next !== 'closed')
    if (next === 'closed') appearance.previewIntensity(appearance.glassIntensity)
    else if (prev === 'closed') {
      appearance.previewIntensity(Math.max(0, appearance.glassIntensity - 0.25))
    }
  },
  { flush: 'sync' },
)

onBeforeUnmount(() => {
  background.setSuspended(false)
  appearance.previewIntensity(appearance.glassIntensity)
})

const cats = computed(() => (type.value === 'expense' ? categories.expense : categories.income))

// 默认选中最近使用的分类（数据层已按 lastUsedAt 排序）；点击才落到 categoryId
const activeCat = computed({
  get: () => categoryId.value || (cats.value[0] && cats.value[0].id) || '',
  set: (id) => {
    categoryId.value = id
  },
})

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

function switchType(t) {
  type.value = t
  categoryId.value = '' // 切换收支后重取默认分类
}

/* ---------- 统一入口协议：URL 参数 / 剪贴板 JSON（解析在 services/entry.js） ---------- */

/** 入口给的分类名。store 载入后才能映射成 id，见 resolveEntryCat */
const entryCatName = ref('')
const CLIP_EMPTY = '剪贴板里没有可识别的记账内容'

/**
 * 分类名 → categoryId。只在「未归档」分类里找：已归档分类不再出现在记账页，
 * 匹配进去会把账记到不该记的分类上；并且必须是当前收支类型，避免跨类型挂载。
 */
function findCategoryId(name, catType) {
  const hit = categories.list.find((c) => !c.archived && c.type === catType && c.name === name)
  return hit ? hit.id : ''
}

/**
 * 解析待填入的分类名。冷启动时本页早于 App.vue 的 store 初始化，
 * categories.list 还是空的 → 先记住名字，等列表到位（下面的 watch）再落成 id。
 */
function resolveEntryCat() {
  if (!entryCatName.value || categoryId.value) return
  const id = findCategoryId(entryCatName.value, type.value)
  if (id) {
    categoryId.value = id
    entryCatName.value = ''
  }
}

/** 草稿 → 表单。任何字段无效都静默跳过（不覆盖用户已有的输入、不阻塞手动记账） */
function applyDraft(draft) {
  if (draft.valid.type) type.value = draft.type
  if (draft.valid.amount) buffer.value = fenToInput(draft.amount)
  if (draft.valid.note) note.value = draft.note
  if (draft.valid.date) date.value = draft.date
  entryCatName.value = draft.valid.category ? draft.categoryName : ''
  resolveEntryCat()
  // 自动入账：金额有效才触发（金额没解析出来时保持预填态，回落手动确认）。
  // 冷启动时分类 store 可能未就绪 → 挂起，等 watch categories.list 到位后再存，
  // 尽量让通知里匹配的分类先落到 categoryId，匹配不上则由 activeCat 回落最近使用。
  if (draft.autosave && draft.valid.amount) {
    if (categories.list.length) save()
    else autosavePending = true
  }
}

let autosavePending = false

// store 载入后补一次分类映射（冷启动经快捷指令打开时走这条）；挂起的自动入账也在这里放行
watch(
  () => categories.list,
  () => {
    resolveEntryCat()
    if (autosavePending && categories.list.length) {
      autosavePending = false
      save()
    }
  },
)

/**
 * URL 参数入口。用 watch(immediate) 而不是 onMounted：iOS 上 PWA 已停在记一笔页时，
 * 快捷指令只是把地址从 `#/` 换成 `#/?amount=…`，路由记录不变 → 组件不会重新挂载，
 * onMounted 不会触发，参数会被丢掉。
 * 参数是一次性的：读完立刻从地址栏清掉，避免刷新重复预填、也避免链接带着残留参数被分享。
 */
watch(
  () => route.query,
  (q) => {
    if (!q || !Object.keys(q).length) return
    const draft = parseEntryQuery(q)
    router.replace({ query: {} })
    if (!Object.values(draft.valid).some(Boolean)) return
    applyDraft(draft)
  },
  { immediate: true },
)

/**
 * 剪贴板入口。iOS 读取剪贴板必须有用户手势，所以按钮常驻、点击时才读；
 * 读取失败或内容不是记账 JSON 都走同一个失败提示，且不影响页面状态。
 */
async function pasteEntry() {
  let text
  try {
    text = await navigator.clipboard.readText()
  } catch {
    showToast(CLIP_EMPTY)
    return
  }
  const draft = parseEntryJson(text)
  if (!draft) {
    showToast(CLIP_EMPTY)
    return
  }
  const hadInput = !!buffer.value || !!note.value
  applyDraft(draft)
  showToast(hadInput ? '已覆盖原输入' : '已从剪贴板填入')
}

function showToast(msg, { undoable = false, keepUndo = false } = {}) {
  // 非撤销类提示（校验/粘贴/相机/失败）必须清掉旧撤销句柄，避免点提示误删上一笔
  if (!undoable && !keepUndo) lastSavedId = null
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 4000)
}

async function save() {
  if (saving.value) return
  const fen = toFen(buffer.value || '0')
  if (fen <= 0) {
    showToast('先输入金额')
    return
  }
  if (!activeCat.value) {
    showToast('先选一个分类')
    return
  }
  const cat = categories.byId(activeCat.value)
  saving.value = true
  // 新一次保存开始前清掉旧撤销句柄：失败提示不能被误点成“撤销上一笔”
  lastSavedId = null
  try {
    const { record, refreshFailed } = await records.add({
      amount: fen,
      type: type.value,
      categoryId: activeCat.value,
      note: note.value.trim(),
      date: date.value,
      private: isPrivate.value,
    })
    // 写库成功后才清空输入；失败（catch）保留金额/备注/日期/分类
    buffer.value = ''
    note.value = ''
    if (refreshFailed) {
      showToast(WRITE_MESSAGES.refreshFailed)
      return
    }
    lastSavedId = record.id
    showToast(`已记 ${cat ? cat.name : ''} ¥${fenToYuan(fen)}，点这里撤销`, { undoable: true })
  } catch (err) {
    showToast(describeWriteFailure(err).message)
  } finally {
    saving.value = false
  }
}

async function undo() {
  if (!lastSavedId) {
    toast.value = '' // 仅提示类 toast（入口预填/失败反馈）没有可撤销的账目，点击即关闭
    return
  }
  const id = lastSavedId
  try {
    const { refreshFailed } = await records.softDelete(id)
    lastSavedId = null
    toast.value = ''
    if (refreshFailed) showToast(UNDO_MESSAGES.refreshFailed)
  } catch (err) {
    // 保留撤销句柄，用户可再点一次；不假装撤销成功
    showToast(describeUndoFailure(err), { keepUndo: true })
  }
}
</script>

<template>
  <div class="page add">
    <ImmersiveLayer
      v-if="immersiveState !== 'closed'"
      :state="immersiveState"
      :stream="immersiveStream"
      :parallax="immersiveParallax"
    />

    <!-- 收支切换 + 金额 -->
    <GlassPanel shape="panel" class="head">
      <div class="seg">
        <button :class="{ on: type === 'expense' }" @click="switchType('expense')">支出</button>
        <button :class="{ on: type === 'income' }" @click="switchType('income')">收入</button>
      </div>
      <div class="amount" :class="type"><span class="cur">¥</span>{{ display }}</div>
      <div class="sub">{{ subline }}</div>
    </GlassPanel>

    <!-- 分类 chip：最近使用自动排前 -->
    <CategoryGrid v-model="activeCat" :cats="cats" />

    <!-- 备注 / 日期 / 私密 / 剪贴板入口 -->
    <GlassPanel shape="chip" class="meta">
      <input v-model="note" class="note" placeholder="备注（可选）" maxlength="30" />
      <div class="right">
        <input v-model="date" class="date" type="date" />
        <button class="paste pill" title="从剪贴板读取记账内容" @click="pasteEntry">⌘ 粘贴</button>
        <button
          class="lock pill"
          :class="{ on: isPrivate }"
          title="私密账单：不同步"
          @click="isPrivate = !isPrivate"
        >
          {{ isPrivate ? '🔒' : '🔓' }}
        </button>
        <button
          class="immersive pill"
          :class="{ on: immersiveState !== 'closed' }"
          data-testid="immersive-toggle"
          :title="immersiveState === 'closed' ? '开启沉浸背景' : '关闭沉浸背景'"
          :aria-label="immersiveState === 'closed' ? '开启沉浸背景' : '关闭沉浸背景'"
          :aria-busy="immersiveState === 'requesting'"
          @click="toggleImmersive"
        >
          {{ immersiveLabel }}
        </button>
      </div>
    </GlassPanel>

    <!-- 数字键盘 -->
    <AmountPad v-model:buffer="buffer" :saving="saving" @save="save" />

    <!-- 保存反馈：点击撤销 -->
    <button v-if="toast" class="toast" @click="undo">{{ toast }}</button>
  </div>
</template>

<style scoped>
.add {
  display: flex;
  flex-direction: column;
  gap: 10px;
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

.meta .paste {
  white-space: nowrap;
}

.meta .lock {
  font-size: 17px;
  opacity: 0.55;
}

.meta .lock.on {
  opacity: 1;
}

.meta .immersive {
  min-width: 3.6em;
  text-align: center;
  white-space: nowrap;
}
</style>
