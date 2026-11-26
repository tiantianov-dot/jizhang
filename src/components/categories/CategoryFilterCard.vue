<script setup>
/**
 * CategoryFilterCard.vue — 分类管理页多维筛选卡（类型 / 来源 / 状态）
 */
defineProps({
  typeFilter: { type: String, default: 'all' },
  sourceFilter: { type: String, default: 'all' },
  archivedFilter: { type: String, default: 'all' },
})

const emit = defineEmits(['update:typeFilter', 'update:sourceFilter', 'update:archivedFilter'])
</script>

<template>
  <div class="card filters" data-blur="off">
    <div class="fgroup">
      <span class="flabel">类型</span>
      <button :class="{ on: typeFilter === 'all' }" @click="emit('update:typeFilter', 'all')">
        全部
      </button>
      <button
        :class="{ on: typeFilter === 'expense' }"
        @click="emit('update:typeFilter', 'expense')"
      >
        支出
      </button>
      <button :class="{ on: typeFilter === 'income' }" @click="emit('update:typeFilter', 'income')">
        收入
      </button>
    </div>
    <div class="fgroup">
      <span class="flabel">来源</span>
      <button :class="{ on: sourceFilter === 'all' }" @click="emit('update:sourceFilter', 'all')">
        全部
      </button>
      <button
        :class="{ on: sourceFilter === 'builtin' }"
        @click="emit('update:sourceFilter', 'builtin')"
      >
        默认
      </button>
      <button
        :class="{ on: sourceFilter === 'custom' }"
        @click="emit('update:sourceFilter', 'custom')"
      >
        自定义
      </button>
    </div>
    <div class="fgroup">
      <span class="flabel">状态</span>
      <button
        :class="{ on: archivedFilter === 'all' }"
        @click="emit('update:archivedFilter', 'all')"
      >
        全部
      </button>
      <button
        :class="{ on: archivedFilter === 'active' }"
        @click="emit('update:archivedFilter', 'active')"
      >
        未归档
      </button>
      <button
        :class="{ on: archivedFilter === 'archived' }"
        @click="emit('update:archivedFilter', 'archived')"
      >
        已归档
      </button>
    </div>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
}

.fgroup {
  display: flex;
  align-items: center;
  gap: 4px;
}

.flabel {
  flex: none;
  width: 2.6em;
  font-size: 12px;
  color: var(--text-secondary);
}

.fgroup button {
  padding: 4px 10px;
  border-radius: var(--glass-radius-pill);
  border: 1px solid transparent;
  font-size: 12px;
  color: var(--text-secondary);
}

.fgroup button.on {
  background: var(--glass-active-fill);
  border-color: var(--glass-edge-2);
  color: var(--on-glass);
  font-weight: 600;
}
</style>
