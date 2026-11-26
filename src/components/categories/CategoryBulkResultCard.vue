<script setup>
/**
 * CategoryBulkResultCard.vue — 分类批量操作逐项结果卡
 */
import { describeBulkStatus } from '@/services/categoryManagement'

defineProps({
  results: { type: Array, default: () => [] },
})
</script>

<template>
  <div class="card result" data-blur="off">
    <div class="result-title">批量结果</div>
    <p v-for="r in results" :key="r.id" class="result-row" :class="r.status">
      {{ r.name }}：{{ describeBulkStatus(r.status) }}
      <span v-if="r.error" class="result-error">（{{ r.error }}）</span>
    </p>
  </div>
</template>

<style scoped>
.result {
  padding: 12px;
}

.result-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 6px;
}

.result-row {
  margin: 2px 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.result-row.failed,
.result-row.protected {
  color: var(--warning);
}

.result-error {
  color: var(--text-secondary);
}
</style>
