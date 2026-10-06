<script setup>
/**
 * CategoryBudgetList.vue — 分类预算进度列表（统计页用）
 *
 * 纯展示：spent/budget/pct/state 由调用方用 services/stats.budgetUsage 算好后传入，
 * 本组件不参与计算。整行可点，跳到分类管理页去改预算。
 */
import { fmtFen } from '@/utils/format'

defineProps({
  /** @type {{ id: string, emoji: string, name: string, spent: number, budget: number, pct: number, state: string }[]} */
  items: { type: Array, default: () => [] },
})
</script>

<template>
  <div class="card">
    <div class="c-head">分类预算</div>
    <RouterLink v-for="b in items" :key="b.id" class="brow" to="/categories">
      <span class="b-top">
        <span class="b-name">{{ b.emoji }} {{ b.name }}</span>
        <span class="b-amt" :class="b.state">{{ fmtFen(b.spent) }} / {{ fmtFen(b.budget) }}</span>
      </span>
      <span class="bar">
        <span class="fill" :class="b.state" :style="{ width: b.pct + '%' }"></span>
      </span>
    </RouterLink>
  </div>
</template>

<style scoped>
.c-head {
  font-size: 13px;
  margin-bottom: 10px;
}

.brow {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  min-height: 44px;
  justify-content: center;
  padding: 8px 0;
  border-bottom: 0.5px solid var(--border);
  text-decoration: none;
  color: inherit;
}

.brow:last-child {
  border-bottom: none;
}

.b-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}

.b-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.b-amt {
  flex: none;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.b-amt.warn {
  color: var(--warning);
}

.b-amt.over {
  color: var(--danger);
  font-weight: 600;
}

.bar {
  display: block;
  height: 8px;
  border-radius: 999px;
  background: var(--bg);
  overflow: hidden;
}

.fill {
  display: block;
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
