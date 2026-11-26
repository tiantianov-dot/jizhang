<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useCategoriesStore } from '@/stores/categories'
import { useRecordsStore } from '@/stores/records'
import { useAppearanceStore } from '@/stores/appearance'
import { useBackgroundStore } from '@/stores/background'
import { useEntryIntake } from '@/composables/useEntryIntake'
import { useImmersive } from '@/composables/useImmersive'
import { useToast } from '@/composables/useToast'
import { fenToYuan, formatAmountBuffer, formatRecordSubline, toFen, todayStr } from '@/utils/format'
import {
  describeUndoFailure,
  describeWriteFailure,
  UNDO_MESSAGES,
  WRITE_MESSAGES,
} from '@/services/writeOutcome'
import AmountPad from '@/components/AmountPad.vue'
import BackupReminder from '@/components/BackupReminder.vue'
import CategoryGrid from '@/components/CategoryGrid.vue'
import ImmersiveLayer from '@/components/ImmersiveLayer.vue'
import RecordAmountHeader from '@/components/RecordAmountHeader.vue'
import RecordMetaBar from '@/components/RecordMetaBar.vue'

const categories = useCategoriesStore()
const records = useRecordsStore()
const appearance = useAppearanceStore()
const background = useBackgroundStore()

const type = ref('expense') // expense | income
const buffer = ref('') // 金额输入缓冲（字符串，形如 "12.3"）
const categoryId = ref('')
const note = ref('')
const date = ref(todayStr())
const isPrivate = ref(false) // 本机标记：完整备份仍包含，不代表加密或密码保护
const saving = ref(false) // 写库期间禁用 ✓，避免连点重复入账

let lastSavedId = null
const {
  message: toast,
  show: showToastMessage,
  clear: clearToast,
} = useToast({
  duration: 4000,
  onClear: () => {
    lastSavedId = null
  },
})

function showToast(msg, { undoable = false, keepUndo = false } = {}) {
  // 非撤销类提示（校验/粘贴/相机/失败）必须清掉旧撤销句柄，避免点提示误删上一笔
  if (!undoable && !keepUndo) lastSavedId = null
  showToastMessage(msg)
}

const {
  state: immersiveState,
  stream: immersiveStream,
  parallax: immersiveParallax,
  open: openImmersive,
  close: closeImmersive,
} = useImmersive({
  onCameraError: () => {
    // toast 点击即撤销上一笔；相机错误提示不应复用这个动作
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

const display = computed(() => formatAmountBuffer(buffer.value))
const subline = computed(() => formatRecordSubline(date.value, note.value))

function switchType(t) {
  type.value = t
  categoryId.value = '' // 切换收支后重取默认分类
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
    clearToast() // 仅提示类 toast（入口预填/失败反馈）没有可撤销的账目，点击即关闭
    return
  }
  const id = lastSavedId
  try {
    const { refreshFailed } = await records.softDelete(id)
    lastSavedId = null
    clearToast()
    if (refreshFailed) showToast(UNDO_MESSAGES.refreshFailed)
  } catch (err) {
    // 保留撤销句柄，用户可再点一次；不假装撤销成功
    lastSavedId = id
    showToast(describeUndoFailure(err), { keepUndo: true })
  }
}

const { pasteEntry } = useEntryIntake({
  type,
  buffer,
  categoryId,
  note,
  date,
  categories,
  onAutosave: save,
  onToast: showToast,
})
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
    <RecordAmountHeader
      :type="type"
      :display="display"
      :subline="subline"
      @switch-type="switchType"
    />

    <BackupReminder />

    <!-- 分类 chip：最近使用自动排前 -->
    <CategoryGrid v-model="activeCat" :cats="cats" />

    <!-- 备注 / 日期 / 本机标记 / 剪贴板入口 / 沉浸取景 -->
    <RecordMetaBar v-model:note="note" v-model:date="date" v-model:is-private="isPrivate">
      <template #before-lock>
        <button class="paste pill" title="从剪贴板读取记账内容" @click="pasteEntry">⌘ 粘贴</button>
      </template>
      <template #after-lock>
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
      </template>
    </RecordMetaBar>

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

.paste {
  white-space: nowrap;
}

.immersive {
  min-width: 3.6em;
  text-align: center;
  white-space: nowrap;
}
</style>
