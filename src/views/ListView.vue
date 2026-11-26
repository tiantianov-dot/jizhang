<script setup>
/**
 * ListView.vue — 流水（TabBar 第二项，路由 /list）
 *
 * 按月浏览 + 备注搜索 + 分类筛选。三者均为浏览态（不进 URL、不进 store），
 * 过滤/聚合全部走 services/stats 纯函数，本页只负责布局编排与状态串联：
 * filterByMonth → filterByCategoryIds → searchRecords → groupByDay。
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useRecordsStore } from '@/stores/records'
import { useCategoriesStore } from '@/stores/categories'
import { thisMonthStr } from '@/utils/format'
import {
  filterByCategoryIds,
  filterByMonth,
  groupByDay,
  searchRecords,
  shiftMonth,
  sumAmount,
} from '@/services/stats'
import CategoryFilterSheet from '@/components/CategoryFilterSheet.vue'
import ListMonthBar from '@/components/ListMonthBar.vue'
import ListFilterBar from '@/components/ListFilterBar.vue'
import RecordDayGroup from '@/components/RecordDayGroup.vue'

const router = useRouter()
const records = useRecordsStore()
const categories = useCategoriesStore()

const month = ref(thisMonthStr())
function prevMonth() {
  month.value = shiftMonth(month.value, -1)
}
function nextMonth() {
  month.value = shiftMonth(month.value, 1)
}

const input = ref('')
const keyword = ref('')
const catId = ref('')
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

function onSearchSubmit() {
  clearTimeout(debounceTimer)
  keyword.value = input.value
}

/** 选中分类被归档/删除后回落「全部」，避免按钮与列表过滤状态矛盾 */
const activeCat = computed(() => {
  const c = categories.byId(catId.value)
  return c && !c.archived ? c : null
})

const filterId = computed({
  get: () => (activeCat.value ? activeCat.value.id : ''),
  set: (v) => {
    catId.value = v
  },
})

const inMonth = computed(() => filterByMonth(records.list, month.value))
const filtered = computed(() =>
  searchRecords(filterByCategoryIds(inMonth.value, filterId.value), keyword.value),
)
const groups = computed(() => groupByDay(filtered.value))
const expenseSum = computed(() => sumAmount(filtered.value, 'expense'))
const incomeSum = computed(() => sumAmount(filtered.value, 'income'))
const emptyText = computed(() => (inMonth.value.length ? '没有匹配的账目' : '本月没有账目'))

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
  { immediate: true },
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

onUnmounted(() => {
  clearTimeout(debounceTimer)
  clearTimeout(undoTimer)
})
</script>

<template>
  <div class="page">
    <h2 class="page-title">流水</h2>

    <!-- 全库为空：保留原有引导文案（与「本月没有账目」严格区分） -->
    <p v-if="!records.count" class="placeholder">
      还没有账目。去「记一笔」试试：选分类 → 按金额 → ✓，三次点击完成。
    </p>

    <template v-else>
      <ListMonthBar
        :month="month"
        :expense-sum="expenseSum"
        :income-sum="incomeSum"
        @prev="prevMonth"
        @next="nextMonth"
      />

      <ListFilterBar
        v-model="input"
        :active-category="activeCat"
        @submit="onSearchSubmit"
        @open-filter="sheetOpen = true"
      />

      <p v-if="!filtered.length" class="placeholder">{{ emptyText }}</p>

      <RecordDayGroup
        v-for="g in groups"
        :key="g.day"
        :day="g.day"
        :day-expense="g.dayExpense"
        :items="g.items"
        :resolve-category="categories.byId"
        @select="openRecord"
      />
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
