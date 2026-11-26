<script setup>
/**
 * StatsView.vue — 统计（TabBar 第三项，路由 /stats）
 *
 * 月份可前后切换，概览 / 支出构成环图 / 每日支出柱图 / 分类预算全部跟随所选月份。
 * 所有统计计算都在 services/stats 的纯函数里，本页只负责布局编排与状态串联。
 */
import { computed, ref } from 'vue'
import { useRecordsStore } from '@/stores/records'
import { useSettingsStore } from '@/stores/settings'
import { useCategoriesStore } from '@/stores/categories'
import { thisMonthStr } from '@/utils/format'
import {
  budgetUsage,
  buildCategoryBudgetRows,
  buildDailyChartItems,
  buildDonutItems,
  byCategorySum,
  shiftMonth,
} from '@/services/stats'
import StatsSummaryCard from '@/components/StatsSummaryCard.vue'
import MonthlyBudgetCard from '@/components/MonthlyBudgetCard.vue'
import DonutChart from '@/components/DonutChart.vue'
import BarChart from '@/components/BarChart.vue'
import CategoryBudgetList from '@/components/CategoryBudgetList.vue'
import GlassPanel from '@/components/GlassPanel.vue'

const records = useRecordsStore()
const settings = useSettingsStore()
const categories = useCategoriesStore()

/** 所选月份 YYYY-MM：默认当前月；可翻到任意过去/未来月（未来月允许查看，只是没数据） */
const month = ref(thisMonthStr())
function prevMonth() {
  month.value = shiftMonth(month.value, -1)
}
function nextMonth() {
  month.value = shiftMonth(month.value, 1)
}

const expense = computed(() => records.monthExpense(month.value))
const income = computed(() => records.monthIncome(month.value))

/** 总预算进度（口径统一走 services/stats.budgetUsage） */
const usage = computed(() => budgetUsage(expense.value, settings.monthlyBudget))
const budgetPct = computed(() => usage.value.pct)
const budgetState = computed(() => (usage.value.state === 'none' ? 'ok' : usage.value.state))

/** 支出按分类汇总（降序）：环图与分类预算共用同一口径 */
const catSums = computed(() => byCategorySum(records.list, { month: month.value, type: 'expense' }))

/** 环图、柱图与分类预算数据统一由 services/stats 纯函数组装 */
const donutItems = computed(() => buildDonutItems(catSums.value, categories.byId))
const dailyItems = computed(() => buildDailyChartItems(records.list, month.value))
const budgetRows = computed(() => buildCategoryBudgetRows(categories.expense, catSums.value))

/** 空月不显示分类预算卡（该月没有任何账目时，预算进度无意义） */
const showBudgets = computed(
  () => budgetRows.value.length > 0 && records.ofMonth(month.value).length > 0,
)
</script>

<template>
  <div class="page">
    <div class="top">
      <h2 class="page-title">统计</h2>
      <RouterLink class="entry" to="/categories">分类管理 ›</RouterLink>
    </div>

    <GlassPanel shape="chip" class="mbar">
      <button class="nav" @click="prevMonth">‹</button>
      <span class="mon">{{ month }}</span>
      <button class="nav" @click="nextMonth">›</button>
    </GlassPanel>

    <StatsSummaryCard :expense="expense" :income="income" />

    <MonthlyBudgetCard
      v-if="settings.monthlyBudget"
      :budget="settings.monthlyBudget"
      :pct="budgetPct"
      :state="budgetState"
    />

    <div class="card">
      <div class="c-head">支出构成</div>
      <DonutChart :items="donutItems" :total="expense" />
    </div>

    <div class="card">
      <div class="c-head">每日支出</div>
      <BarChart :items="dailyItems" :label="month" />
    </div>

    <CategoryBudgetList v-if="showBudgets" :items="budgetRows" />
  </div>
</template>

<style scoped>
.card + .card {
  margin-top: 10px;
}

/* 标题行：右侧挂「分类管理」入口（页内快捷入口，不动底部 Tab 结构） */
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.entry {
  display: inline-flex;
  align-items: center;
  min-height: 40px; /* 触控目标 */
  padding: 0 8px;
  margin-right: -8px; /* 文字右缘与卡片右缘对齐 */
  font-size: 13px;
  color: var(--text-secondary);
  text-decoration: none;
}

.entry:active {
  color: var(--brand);
}

.mbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 10px;
}

.mon {
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.nav {
  width: 44px;
  height: 36px;
  border-radius: var(--radius-sm);
  background: var(--glass-well);
  border: 1px solid var(--glass-edge-2);
  color: var(--text);
  font-size: 18px;
  line-height: 1;
}

.c-head {
  font-size: 13px;
  margin-bottom: 10px;
}
</style>
