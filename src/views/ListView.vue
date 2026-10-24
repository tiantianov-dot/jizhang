<script setup>
/**
 * ListView.vue — 流水（TabBar 第二项，路由 /list）
 *
 * 按月浏览 + 备注搜索 + 分类筛选。三者都是「浏览态」，只存在组件本地 state
 * （不进 URL、不进 store）。过滤/搜索全部走 services/stats 的纯函数，本页只组装：
 * filterByMonth → filterByCategoryIds → searchRecords → groupByDay。
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useRecordsStore } from '@/stores/records'
import { useCategoriesStore } from '@/stores/categories'
import { fenToYuan, fmtFen, thisMonthStr } from '@/utils/format'
import {
  filterByCategoryIds,
  filterByMonth,
  groupByDay,
  searchRecords,
  shiftMonth,
  sumAmount,
} from '@/services/stats'
import CategoryFilterSheet from '@/components/CategoryFilterSheet.vue'
import GlassPanel from '@/components/GlassPanel.vue'

const router = useRouter()
const records = useRecordsStore()
const categories = useCategoriesStore()

/* ---------- 月份切换（与统计页同一交互范式；两处细节不同，按计划不抽公共组件） ---------- */

/** 所选月份 YYYY-MM：默认当前月，可翻到任意过去/未来月（未来月只是没数据） */
const month = ref(thisMonthStr())
function prevMonth() {
  month.value = shiftMonth(month.value, -1)
}
function nextMonth() {
  month.value = shiftMonth(month.value, 1)
}

/* ---------- 搜索（300ms 防抖）与分类筛选 ---------- */

const input = ref('') // 输入框即时值
const keyword = ref('') // 防抖后真正生效的关键词
const searchEl = ref(null)
const catId = ref('') // 分类筛选选中 id，'' = 全部
const sheetOpen = ref(false)
let debounceTimer = null

watch(input, (v) => {
  clearTimeout(debounceTimer)
  if (!v.trim()) {
    keyword.value = '' // 清空搜索框：取消挂起的过滤，立即恢复
    return
  }
  debounceTimer = setTimeout(() => {
    keyword.value = v
  }, 300)
})

/** 回车：关键词立即生效，并 blur 收起 iOS 键盘（不等防抖） */
function onSearchSubmit() {
  clearTimeout(debounceTimer)
  keyword.value = input.value
  searchEl.value?.blur()
}

onUnmounted(() => clearTimeout(debounceTimer))

/**
 * 生效的分类筛选。选中分类被归档/删除后回落「全部」（与 CategoryGrid 对失效 id 的
 * 降级同源：查不到就不认这个 id），避免「按钮显示全部、列表却还被筛着」的自相矛盾。
 */
const activeCat = computed(() => {
  const c = categories.byId(catId.value)
  return c && !c.archived ? c : null
})

/** 弹层的选中态以「生效值」为准，失效 id 不会被高亮 */
const filterId = computed({
  get: () => (activeCat.value ? activeCat.value.id : ''),
  set: (v) => {
    catId.value = v
  },
})

/* ---------- 过滤链路 ---------- */

const inMonth = computed(() => filterByMonth(records.list, month.value))
const filtered = computed(() =>
  searchRecords(filterByCategoryIds(inMonth.value, filterId.value), keyword.value),
)
/** 按天分组（输入已按日期倒序；groupByDay 结构不变） */
const groups = computed(() => groupByDay(filtered.value))

/** 当月合计随筛选联动（与列表主体同一口径） */
const expenseSum = computed(() => sumAmount(filtered.value, 'expense'))
const incomeSum = computed(() => sumAmount(filtered.value, 'income'))

/** 空态文案：「本月没有账目」只说明本月无数据；筛选排除光了叫「没有匹配的账目」 */
const emptyText = computed(() => (inMonth.value.length ? '没有匹配的账目' : '本月没有账目'))

function catOf(r) {
  return categories.byId(r.categoryId)
}

/** 整行可点：进入编辑页（触控区由 .row 的 min-height 保证 ≥44px） */
function openRecord(r) {
  router.push(`/record/${r.id}`)
}

// 编辑页软删除后会置 records.lastDeletedId，这里展示 4 秒撤销入口
const undoId = ref('')
let undoTimer = null

watch(
  () => records.lastDeletedId,
  (id) => {
    if (!id) return
    undoId.value = id
    clearTimeout(undoTimer)
    undoTimer = setTimeout(dismissUndo, 4000)
  },
  { immediate: true }, // 删除后跳回本页时是「先置标记再挂载」，需要挂载即判定
)

function dismissUndo() {
  clearTimeout(undoTimer)
  undoId.value = ''
  records.clearLastDeleted()
}

async function undoDelete() {
  if (!undoId.value) return
  const id = undoId.value
  dismissUndo()
  await records.restore(id)
}

onUnmounted(() => clearTimeout(undoTimer))
</script>

<template>
  <div class="page">
    <h2 class="page-title">流水</h2>

    <!-- 全库为空：保留原有引导文案（与「本月没有账目」严格区分） -->
    <p v-if="!records.count" class="placeholder">
      还没有账目。去「记一笔」试试：选分类 → 按金额 → ✓，三次点击完成。
    </p>

    <template v-else>
      <GlassPanel shape="chip" class="mbar">
        <div class="mnav">
          <button class="nav" @click="prevMonth">‹</button>
          <span class="mon">{{ month }}</span>
          <button class="nav" @click="nextMonth">›</button>
        </div>
        <span class="msum">
          <span>支 {{ fmtFen(expenseSum) }}</span>
          <span class="income">收 {{ fmtFen(incomeSum) }}</span>
        </span>
      </GlassPanel>

      <div class="filters">
        <form class="search" @submit.prevent="onSearchSubmit">
          <input
            ref="searchEl"
            v-model="input"
            class="input"
            type="search"
            inputmode="search"
            enterkeyhint="search"
            placeholder="搜备注"
          />
        </form>
        <button class="fbtn" :class="{ on: !!activeCat }" @click="sheetOpen = true">
          {{ activeCat ? `${activeCat.emoji} ${activeCat.name}` : '全部' }}
        </button>
      </div>

      <p v-if="!filtered.length" class="placeholder">{{ emptyText }}</p>

      <div v-for="g in groups" :key="g.day" class="group">
        <div class="day-head">
          <span>{{ g.day }}</span>
          <span v-if="g.dayExpense" class="day-sum">支 ¥{{ fenToYuan(g.dayExpense) }}</span>
        </div>
        <div class="card rows" data-blur="off">
          <button v-for="r in g.items" :key="r.id" class="row" @click="openRecord(r)">
            <span class="emoji">{{ catOf(r)?.emoji || '📦' }}</span>
            <span class="main">
              <span class="cat">{{ catOf(r)?.name || '未分类' }}</span>
              <span v-if="r.note" class="note">{{ r.note }}</span>
            </span>
            <span
              v-if="r.private"
              class="lock"
              title="本机标记：完整备份仍包含；不代表加密或密码保护"
              aria-label="本机标记：完整备份仍包含；不代表加密或密码保护"
            >本</span>
            <span class="amt" :class="r.type">
              {{ r.type === 'expense' ? '-' : '+' }}{{ fenToYuan(r.amount) }}
            </span>
          </button>
        </div>
      </div>
    </template>

    <!-- 删除撤销入口：编辑页删除并跳回本页后展示 4 秒 -->
    <button v-if="undoId" class="toast" @click="undoDelete">已删除，点这里撤销</button>

    <CategoryFilterSheet
      v-if="sheetOpen"
      v-model="filterId"
      :expense="categories.expense"
      :income="categories.income"
      @close="sheetOpen = false"
    />
  </div>
</template>

<style scoped>
/* 月份切换条：左侧 ‹ 月 ›，右端当月合计（与统计页 .mbar 同款观感） */
.mbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 10px;
}

.mnav {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mon {
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.nav {
  width: 44px;
  height: 36px;
  border-radius: 8px;
  background: var(--glass-well);
  border: 1px solid var(--glass-edge-2);
  color: var(--on-glass);
  font-size: 18px;
  line-height: 1;
}

.msum {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: var(--on-glass-2);
  font-variant-numeric: tabular-nums;
}

.msum .income {
  color: var(--income);
}

/* 筛选行：搜索框 + 分类筛选入口 */
.filters {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.search {
  flex: 1;
  min-width: 0;
}

.input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--glass-edge-2);
  background: var(--glass-well);
  color: var(--on-glass);
  font-size: 16px; /* ≥16px：防 iOS 聚焦输入框时页面自动放大 */
  appearance: none;
}

.input::placeholder {
  color: var(--on-glass-2);
}

.fbtn {
  flex: none;
  max-width: 45%;
  height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--glass-edge-2);
  background: var(--glass-well);
  color: var(--on-glass-2);
  font-size: 13px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.fbtn.on {
  color: var(--on-glass);
  border-color: var(--glass-edge-3);
  background: var(--glass-active-fill);
  font-weight: 600;
}

.group {
  margin-bottom: 14px;
}

.day-head {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--on-glass-2);
  padding: 0 4px 6px;
}

.day-sum {
  font-variant-numeric: tabular-nums;
}

/* 长列表：外壳是一张 off 材质卡，行扁平、只用 edge-2 分隔 */
.rows {
  padding: 2px 12px;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  text-align: left;
  padding: 10px 2px;
  border-radius: 0;
  border-bottom: 1px solid var(--glass-edge-2);
}

.row:last-child {
  border-bottom: none;
}

.emoji {
  font-size: 20px;
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.cat {
  font-size: 14px;
}

.note {
  font-size: 12px;
  color: var(--on-glass-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lock {
  font-size: 12px;
  opacity: 0.6;
}

.amt {
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.amt.income {
  color: var(--income);
}
</style>
