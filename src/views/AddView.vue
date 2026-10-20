<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCategoriesStore } from '@/stores/categories'
import { useRecordsStore } from '@/stores/records'
import { useAppearanceStore } from '@/stores/appearance'
import { useImmersive } from '@/composables/useImmersive'
import { toFen, fenToYuan, fenToInput, todayStr } from '@/utils/format'
import { parseEntryQuery, parseEntryJson } from '@/services/entry'
import AmountPad from '@/components/AmountPad.vue'
import CategoryGrid from '@/components/CategoryGrid.vue'
import GlassPanel from '@/components/GlassPanel.vue'
import ImmersiveLayer from '@/components/ImmersiveLayer.vue'

const route = useRoute()
const router = useRouter()
const categories = useCategoriesStore()
const records = useRecordsStore()
const appearance = useAppearanceStore()

const type = ref('expense') // expense | income
const buffer = ref('') // 金额输入缓冲（字符串，形如 "12.3"）
const categoryId = ref('')
const note = ref('')
const date = ref(todayStr())
const isPrivate = ref(false) // 私密账单：只存本地，永不同步（Phase 3 同步时跳过）
const saving = ref(false) // 写库期间禁用 ✓，避免连点重复入账
const toast = ref('')

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

function toggleImmersive() {
  if (immersiveState.value === 'closed') openImmersive()
  else closeImmersive()
}

// 场景联动只走 previewIntensity：临时偏移不写库，退出即恢复持久值
watch(
  immersiveState,
  (next, prev) => {
    if (next === prev) return
    if (next === 'closed') appearance.previewIntensity(appearance.glassIntensity)
    else if (prev === 'closed') {
      appearance.previewIntensity(Math.max(0.3, appearance.glassIntensity - 0.25))
    }
  },
  { flush: 'sync' },
)

onBeforeUnmount(() => {
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

let toastTimer = null
function showToast(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 4000)
}

let lastSavedId = null

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
  try {
    const rec = await records.add({
      amount: fen,
      type: type.value,
      categoryId: activeCat.value,
      note: note.value.trim(),
      date: date.value,
      private: isPrivate.value,
    })
    lastSavedId = rec.id
    buffer.value = ''
    note.value = ''
    showToast(`已记 ${cat ? cat.name : ''} ¥${fenToYuan(fen)}，点这里撤销`)
  } finally {
    saving.value = false
  }
}

async function undo() {
  if (!lastSavedId) {
    toast.value = '' // 仅提示类 toast（入口预填反馈）没有可撤销的账目，点击即关闭
    return
  }
  await records.softDelete(lastSavedId)
  lastSavedId = null
  toast.value = ''
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
    <GlassPanel tier="clear" class="head card">
      <div class="seg">
        <button :class="{ on: type === 'expense' }" @click="switchType('expense')">支出</button>
        <button :class="{ on: type === 'income' }" @click="switchType('income')">收入</button>
      </div>
      <div class="amount" :class="type">¥ {{ display }}</div>
    </GlassPanel>

    <!-- 分类大按钮平铺：最近使用自动排前 -->
    <CategoryGrid v-model="activeCat" :cats="cats" />

    <!-- 备注 / 日期 / 私密 / 剪贴板入口 -->
    <div class="meta card">
      <input v-model="note" class="note" placeholder="备注（可选）" maxlength="30" />
      <input v-model="date" class="date" type="date" />
      <button class="paste" title="从剪贴板读取记账内容" @click="pasteEntry">⌘ 粘贴</button>
      <button
        class="lock"
        :class="{ on: isPrivate }"
        title="私密账单：不同步"
        @click="isPrivate = !isPrivate"
      >
        {{ isPrivate ? '🔒' : '🔓' }}
      </button>
      <button
        class="immersive"
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

/* GlassPanel 的内容层垫在 blur/border 之上，布局落在它身上 */
.head :deep(.gp-content) {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.seg {
  display: flex;
  background: rgba(0, 0, 0, .22);
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
  background: rgba(255, 255, 255, .14);
  color: var(--text);
  font-weight: 600;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .12), 0 1px 4px rgba(0, 0, 0, .25);
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

.paste {
  flex: none;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  color: var(--text-secondary);
  background: transparent;
  border: 0.5px solid var(--border);
  border-radius: 999px;
  padding: 6px 9px;
}

.paste:active {
  background: rgba(var(--panel-fill-rgb), .08);
}

.lock {
  font-size: 17px;
  opacity: 0.55;
  padding: 4px;
}

.lock.on {
  opacity: 1;
}

.immersive {
  flex: none;
  min-width: 3.6em;
  padding: 6px 9px;
  border: 0.5px solid var(--border);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1;
  text-align: center;
  white-space: nowrap;
}

.immersive.on {
  border-color: var(--glass-edge-3);
  background: rgba(var(--panel-fill-rgb), calc(.04 + .06 * var(--glass-intensity)));
  color: var(--text);
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
