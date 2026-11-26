<script setup>
/**
 * StatsSummaryCard.vue — 统计页月度收支概览卡（支出 / 收入 / 结余）
 *
 * 单根 <div class="card sums">，以保证父视图 scoped `.card + .card` 兄弟间距生效。
 */
import { fenToYuan } from '@/utils/format'

defineProps({
  /** 当月支出（分） */
  expense: { type: Number, default: 0 },
  /** 当月收入（分） */
  income: { type: Number, default: 0 },
})
</script>

<template>
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
</template>

<style scoped>
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
</style>
