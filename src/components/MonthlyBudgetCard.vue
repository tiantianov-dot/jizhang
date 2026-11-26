<script setup>
/**
 * MonthlyBudgetCard.vue — 统计页月度总预算进度卡
 *
 * 单根 <div class="card">，由父级通过 v-if="settings.monthlyBudget" 控制挂载，
 * 确保未设预算时不额外渲染 .bar 元素，同时保持父视图 `.card + .card` 兄弟间距生效。
 */
import { fenToYuan } from '@/utils/format'

defineProps({
  /** 月预算（分） */
  budget: { type: Number, required: true },
  /** 预算使用百分比（0..100） */
  pct: { type: Number, default: 0 },
  /** 预算状态：ok / warn / over */
  state: {
    type: String,
    default: 'ok',
    validator: (v) => ['ok', 'warn', 'over'].includes(v),
  },
})
</script>

<template>
  <div class="card">
    <div class="b-head">
      <span>月预算</span>
      <span :class="['pct', state]">{{ pct }}%</span>
    </div>
    <div class="bar">
      <div class="fill" :class="state" :style="{ width: pct + '%' }"></div>
    </div>
    <p class="placeholder">预算 ¥{{ fenToYuan(budget) }} · 80% 变黄、超支变红</p>
  </div>
</template>

<style scoped>
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
  border-radius: var(--glass-radius-pill);
  background: var(--glass-well);
  overflow: hidden;
}

.fill {
  height: 100%;
  border-radius: var(--glass-radius-pill);
  background: var(--brand);
}

.fill.warn {
  background: var(--warning);
}

.fill.over {
  background: var(--danger);
}
</style>
