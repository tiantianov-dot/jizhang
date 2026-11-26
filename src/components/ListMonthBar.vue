<script setup>
/**
 * ListMonthBar.vue — 流水页月份切换与当月合计条
 *
 * 左侧 ‹ 月份 ›，右侧展示当前筛选口径下的支出 / 收入合计；
 * 单根 <GlassPanel shape="chip" class="mbar">，自带与筛选行的下边距。
 */
import { fmtFen } from '@/utils/format'
import GlassPanel from './GlassPanel.vue'

defineProps({
  /** 当前所选月份 YYYY-MM */
  month: { type: String, required: true },
  /** 当前筛选结果支出合计（分） */
  expenseSum: { type: Number, default: 0 },
  /** 当前筛选结果收入合计（分） */
  incomeSum: { type: Number, default: 0 },
})

const emit = defineEmits(['prev', 'next'])
</script>

<template>
  <GlassPanel shape="chip" class="mbar">
    <div class="mnav">
      <button class="nav" @click="emit('prev')">‹</button>
      <span class="mon">{{ month }}</span>
      <button class="nav" @click="emit('next')">›</button>
    </div>
    <span class="msum">
      <span>支 {{ fmtFen(expenseSum) }}</span>
      <span class="income">收 {{ fmtFen(incomeSum) }}</span>
    </span>
  </GlassPanel>
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
  border-radius: var(--radius-sm);
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
</style>
