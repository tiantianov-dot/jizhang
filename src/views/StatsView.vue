<script setup>
/**
 * StatsView.vue — 统计（TabBar 第三项，路由 /）
 *
 * 月份可前后切换，概览 / 支出构成环图 / 每日支出柱图 / 分类预算全部跟随所选月份。
 * 所有统计计算都在 services/stats 的纯函数里，本页只组装数据与展示（图表亦然）。
 */
import { computed, ref } from 'vue'
import { useRecordsStore } from '@/stores/records'
import { useSettingsStore } from '@/stores/settings'
import { useCategoriesStore } from '@/stores/categories'
import { fenToYuan, thisMonthStr } from '@/utils/format'
import { budgetUsage, byCategorySum, dailySums, shiftMonth } from '@/services/stats'
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

/**
 * 环图数据。分类名/emoji/颜色从 categories.byId 补齐 —— byId 查全量，
 * 因此已归档分类的历史账目也会正常出现在占比与图例里（按当前名称显示）。
 */
const donutItems = computed(() =>
  catSums.value.map(({ categoryId, sum }) => {
    const c = categories.byId(categoryId)
    return {
      value: sum,
      color: c ? c.color : '#5F5E5A',
      label: c ? `${c.emoji} ${c.name}` : '📦 未分类',
    }
  }),
)

/** 柱图数据：stats 返回 { day, sum }，这里只对齐字段名，不做计算 */
const dailyItems = computed(() =>
  dailySums(records.list, month.value).map((d) => ({ day: d.day, value: d.sum })),
)

/** 分类预算：只列未归档、且设了预算的支出分类（用量口径由 budgetUsage 统一给出） */
const budgetRows = computed(() => {
  const pairs = catSums.value.map(({ categoryId, sum }) => [categoryId, sum])
  const spentById = Object.fromEntries(pairs)
  return categories.expense
    .filter((c) => c.monthlyBudget > 0)
    .map((c) => {
      const spent = spentById[c.id] || 0
      return {
        id: c.id,
        emoji: c.emoji,
        name: c.name,
        spent,
        budget: c.monthlyBudget,
        ...budgetUsage(spent, c.monthlyBudget),
      }
    })
})

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

    <GlassPanel tier="regular" class="mbar">
      <button class="nav" @click="prevMonth">‹</button>
      <span class="mon">{{ month }}</span>
      <button class="nav" @click="nextMonth">›</button>
    </GlassPanel>

    <div class="card sums">
      <div class="sum">
        <span class="k">支出</span>
        <span class="v">¥{{ fenToYuan(expense) }}</span>
      </div>
      <div class="sum">
        <span class="k">收入</span>
        <span class="v income">¥{{ fenToYuan(income) }}</span>
      </div>
      <div class="sum">
        <span class="k">结余</span>
        <span class="v">¥{{ fenToYuan(income - expense) }}</span>
      </div>
    </div>

    <div v-if="settings.monthlyBudget" class="card">
      <div class="b-head">
        <span>月预算</span>
        <span :class="['pct', budgetState]">{{ budgetPct }}%</span>
      </div>
      <div class="bar">
        <div class="fill" :class="budgetState" :style="{ width: budgetPct + '%' }"></div>
      </div>
      <p class="placeholder">预算 ¥{{ fenToYuan(settings.monthlyBudget) }} · 80% 变黄、超支变红</p>
    </div>

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
  padding: 6px 10px;
  margin-bottom: 10px;
}

.mbar :deep(.gp-content) {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
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
  background: rgba(0, 0, 0, .22);
  border: 1px solid var(--glass-hairline);
  color: var(--text);
  font-size: 18px;
  line-height: 1;
}

.sums {
  display: flex;
  justify-content: space-between;
}

.sum {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.k {
  font-size: 12px;
  color: var(--text-secondary);
}

.v {
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.v.income {
  color: var(--income);
}

.c-head {
  font-size: 13px;
  margin-bottom: 10px;
}

.b-head {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  margin-bottom: 8px;
}

.pct.warn {
  color: var(--warning);
  font-weight: 600;
}

.pct.over {
  color: var(--danger);
  font-weight: 600;
}

.bar {
  height: 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, .35);
  overflow: hidden;
}

.fill {
  height: 100%;
  border-radius: 999px;
  background: var(--brand);
}

.fill.warn {
  background: var(--warning);
}

.fill.over {
  background: var(--danger);
}
</style>
