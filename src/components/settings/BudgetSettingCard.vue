<script setup>
/**
 * BudgetSettingCard.vue — 月度总预算设置卡片
 */
import { ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { toFen } from '@/utils/format'

const emit = defineEmits(['message'])

const settings = useSettingsStore()
const budgetInput = ref('')

async function saveBudget() {
  const fen = toFen(budgetInput.value || '0')
  await settings.setMonthlyBudget(fen)
  budgetInput.value = ''
  emit('message', fen > 0 ? '预算已保存' : '已取消预算')
}
</script>

<template>
  <div class="card">
    <div class="row">
      <span>月度总预算</span>
      <span class="cur">{{
        settings.monthlyBudget ? '¥' + (settings.monthlyBudget / 100).toFixed(2) : '未设置'
      }}</span>
    </div>
    <div class="row">
      <input
        v-model="budgetInput"
        class="input"
        type="number"
        inputmode="decimal"
        placeholder="输入金额（元），0 = 取消"
      />
      <button class="btn" @click="saveBudget">保存</button>
    </div>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0;
  font-size: 14px;
}

.cur {
  color: var(--text-secondary);
  font-size: 13px;
}

.input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--glass-edge-2);
  border-radius: 8px;
  background: var(--glass-well);
  color: var(--text);
  font-size: 14px;
  padding: 8px 10px;
  outline: none;
}

.btn {
  background: var(--glass-fill);
  border: 1px solid var(--glass-edge-2);
  color: var(--on-glass);
  font-size: 13px;
  padding: 8px 16px;
  border-radius: 8px;
  white-space: nowrap;
  text-shadow: var(--on-glass-shadow);
}

.btn:active {
  filter: brightness(1.25);
}
</style>
