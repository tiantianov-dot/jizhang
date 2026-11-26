<script setup>
/**
 * CategoryListCard.vue — 分类管理列表卡（含多选、内置保护标注、引用计数与编辑/恢复入口）
 */
import { isBuiltinCategory } from '@/services/builtinCategories'

const props = defineProps({
  items: { type: Array, default: () => [] },
  selectedIds: { type: Set, default: () => new Set() },
  usageMap: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['toggle', 'edit', 'restore'])

function isSelected(id) {
  return props.selectedIds instanceof Set ? props.selectedIds.has(id) : false
}

function usageOf(c) {
  return props.usageMap[c.id] || { active: 0, deleted: 0, total: 0 }
}
</script>

<template>
  <div class="card rows" data-blur="off">
    <div
      v-for="c in items"
      :key="c.id"
      class="row"
      :class="{ muted: c.archived, picked: isSelected(c.id) }"
    >
      <input
        class="check"
        type="checkbox"
        :checked="isSelected(c.id)"
        :disabled="isBuiltinCategory(c)"
        :aria-label="`选择 ${c.name}`"
        @change="emit('toggle', c.id)"
      />
      <span class="emoji">{{ c.emoji }}</span>
      <span class="main">
        <span class="name">
          {{ c.name }}
          <span v-if="isBuiltinCategory(c)" class="tag">内置，受保护</span>
        </span>
        <span class="sub">
          {{ c.type === 'expense' ? '支出' : '收入' }} · 有效 {{ usageOf(c).active }} / 回收站
          {{ usageOf(c).deleted }}
        </span>
      </span>
      <button v-if="c.archived" class="act" @click="emit('restore', c)">恢复</button>
      <button v-else class="act" @click="emit('edit', c)">编辑</button>
    </div>
    <p v-if="!items.length" class="placeholder">没有符合条件的分类</p>
  </div>
</template>

<style scoped>
.rows {
  padding: 2px 12px;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 8px 0;
  border-bottom: 1px solid var(--glass-edge-2);
}

.row:last-child {
  border-bottom: none;
}

.row.picked {
  background: var(--glass-active-fill);
}

.row.muted .name,
.row.muted .emoji {
  color: var(--text-secondary);
  opacity: 0.75;
}

.check {
  flex: none;
  width: 18px;
  height: 18px;
  accent-color: var(--brand);
}

.check:disabled {
  opacity: 0.45;
}

.emoji {
  font-size: 20px;
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.name {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag {
  margin-left: 4px;
  padding: 1px 5px;
  border-radius: var(--glass-radius-pill);
  border: 1px solid var(--glass-edge-2);
  font-size: 10px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.sub {
  font-size: 11px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.act {
  flex: none;
  font-size: 13px;
  color: var(--on-glass);
  padding: 8px 0 8px 10px;
}
</style>
