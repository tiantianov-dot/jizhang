<script setup>
/**
 * BarChart.vue — 每日支出柱状图（手写 SVG，无图表库）
 *
 * 只做几何与展示：柱高按当月最大值等比缩放；max = 0（整月无支出）时所有柱
 * 高度为 0，即全部落在基线 —— 不做除法，SVG 属性里不会出现 NaN/Infinity。
 * 今天所在的天用品牌色高亮，其余用低饱和变体（同色 + 降透明度，深浅色主题均适用）。
 */
import { computed } from 'vue'
import { thisMonthStr, todayStr } from '@/utils/format'

const props = defineProps({
  /** @type {{ day: number, value: number }[]} 全月各天（缺的天补 0） */
  items: { type: Array, default: () => [] },
  /** 所属月份 YYYY-MM：仅当它是当前月时才高亮今天 */
  label: { type: String, default: '' },
})

const W = 360
const BASE = 112 // 基线 y
const MAX_H = 100 // 最高柱高

const max = computed(() => props.items.reduce((m, it) => Math.max(m, it.value), 0))

const todayDay = computed(() =>
  props.label === thisMonthStr() ? Number(todayStr().slice(8, 10)) : 0,
)

const bars = computed(() => {
  const n = props.items.length
  if (!n) return []
  const slot = W / n
  const width = slot * 0.62
  return props.items.map((it, i) => {
    const h = max.value > 0 ? (it.value / max.value) * MAX_H : 0
    return {
      day: it.day,
      x: i * slot + (slot - width) / 2,
      y: BASE - h,
      width,
      h,
      today: it.day === todayDay.value,
    }
  })
})

const days = computed(() => props.items.length)
</script>

<template>
  <div class="bar-wrap">
    <template v-if="days">
      <svg class="chart" viewBox="0 0 360 120" preserveAspectRatio="none">
        <rect
          v-for="b in bars"
          :key="b.day"
          class="bar"
          :class="{ today: b.today }"
          :x="b.x"
          :y="b.y"
          :width="b.width"
          :height="b.h"
        />
        <line class="axis" x1="0" :y1="BASE" x2="360" :y2="BASE" />
      </svg>
      <div class="scale">
        <span>1 日</span>
        <span>{{ days }} 日</span>
      </div>
    </template>
    <p v-else class="placeholder">本月还没有支出</p>
  </div>
</template>

<style scoped>
.bar-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chart {
  display: block;
  width: 100%;
  height: 120px;
}

.bar {
  fill: var(--brand);
  opacity: 0.35;
}

/* 今天：品牌色满饱和（低饱和变体靠透明度实现，深浅色主题都不用另配色值） */
.bar.today {
  opacity: 1;
}

.axis {
  stroke: var(--border);
  stroke-width: 1;
}

.scale {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-secondary);
}
</style>
