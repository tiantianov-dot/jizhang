<script setup>
/**
 * RecordAmountHeader.vue — 记一笔 / 编辑页共用金额头卡
 *
 * 单根 GlassPanel(panel.head)：包含支出/收入切换、金额展示与日期备注副行。
 * 视觉样式与原 AddView / EditView 的 .head 区块完全一致。
 */
import GlassPanel from './GlassPanel.vue'

defineProps({
  /** 收支类型：'expense' | 'income' */
  type: { type: String, default: 'expense' },
  /** 金额展示串（不含 ¥ 前缀，如 "0.00"） */
  display: { type: String, default: '0.00' },
  /** 日期与备注副行文案 */
  subline: { type: String, default: '' },
})

const emit = defineEmits(['switch-type'])

function switchType(next) {
  emit('switch-type', next)
}
</script>

<template>
  <GlassPanel shape="panel" class="head">
    <div class="seg">
      <button :class="{ on: type === 'expense' }" @click="switchType('expense')">支出</button>
      <button :class="{ on: type === 'income' }" @click="switchType('income')">收入</button>
    </div>
    <div class="amount" :class="type"><span class="cur">¥</span>{{ display }}</div>
    <div class="sub">{{ subline }}</div>
  </GlassPanel>
</template>

<style scoped>
.head {
  border-radius: var(--glass-radius-panel);
  padding: 13px 16px 15px;
  margin-top: 2px;
  overflow: visible;
}

.head .seg {
  display: inline-flex;
  padding: 3px;
  border-radius: var(--glass-radius-pill);
  background: var(--glass-well);
}

.head .seg button {
  appearance: none;
  -webkit-appearance: none;
  border: 0;
  background: transparent;
  color: var(--on-glass-2);
  font-size: 12px;
  padding: 5px 14px;
  border-radius: var(--glass-radius-pill);
}

.head .seg button.on {
  background: var(--glass-active-fill);
  color: var(--on-glass);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    0 1px 4px rgba(0, 0, 0, 0.18);
}

.head .amount {
  margin-top: 9px;
  font-size: 44px;
  font-weight: 250;
  letter-spacing: -1.6px;
  line-height: 1.04;
  font-variant-numeric: tabular-nums;
}

.head .amount .cur {
  font-size: 24px;
  opacity: 0.68;
  margin-right: 3px;
  letter-spacing: 0;
}

.head .amount.income {
  color: var(--income);
}

.head .sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--on-glass-2);
}
</style>
