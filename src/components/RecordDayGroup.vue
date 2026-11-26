<script setup>
/**
 * RecordDayGroup.vue — 流水页单日账目分组卡
 *
 * 单根 <div class="group">，内部为 data-blur="off" 长列表扁平卡；
 * private 标记仅作本机标注，逐字保留合规 title / aria-label 与「本」字样。
 */
import { fenToYuan } from '@/utils/format'

defineProps({
  /** 分组日期 YYYY-MM-DD */
  day: { type: String, required: true },
  /** 当日支出合计（分） */
  dayExpense: { type: Number, default: 0 },
  /** 当日账目列表 */
  items: { type: Array, default: () => [] },
  /** 根据 categoryId 解析分类对象（含已归档） */
  resolveCategory: { type: Function, required: true },
})

const emit = defineEmits(['select'])
</script>

<template>
  <div class="group">
    <div class="day-head">
      <span>{{ day }}</span>
      <span v-if="dayExpense" class="day-sum">支 ¥{{ fenToYuan(dayExpense) }}</span>
    </div>
    <div class="card rows" data-blur="off">
      <button v-for="r in items" :key="r.id" class="row" @click="emit('select', r)">
        <span class="emoji">{{ resolveCategory(r.categoryId)?.emoji || '📦' }}</span>
        <span class="main">
          <span class="cat">{{ resolveCategory(r.categoryId)?.name || '未分类' }}</span>
          <span v-if="r.note" class="note">{{ r.note }}</span>
        </span>
        <span
          v-if="r.private"
          class="lock"
          title="本机标记：完整备份仍包含；不代表加密或密码保护"
          aria-label="本机标记：完整备份仍包含；不代表加密或密码保护"
          >本</span
        >
        <span class="amt" :class="r.type">
          {{ r.type === 'expense' ? '-' : '+' }}{{ fenToYuan(r.amount) }}
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.group {
  margin-bottom: 14px;
}

.day-head {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--on-glass-2);
  padding: 0 4px 6px;
}

.day-sum {
  font-variant-numeric: tabular-nums;
}

/* 长列表：外壳是一张 off 材质卡，行扁平、只用 edge-2 分隔 */
.rows {
  padding: 2px 12px;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  text-align: left;
  padding: 10px 2px;
  border-radius: 0;
  border-bottom: 1px solid var(--glass-edge-2);
}

.row:last-child {
  border-bottom: none;
}

.emoji {
  font-size: 20px;
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.cat {
  font-size: 14px;
}

.note {
  font-size: 12px;
  color: var(--on-glass-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lock {
  font-size: 12px;
  opacity: 0.6;
}

.amt {
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.amt.income {
  color: var(--income);
}
</style>
