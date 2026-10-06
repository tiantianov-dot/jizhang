<script setup>
/**
 * DonutChart.vue — 支出构成环图（手写 SVG，无图表库）
 *
 * 只做几何与展示：数据形状由 props 传入（已按金额降序、含分类颜色）。
 * 环段用 stroke-dasharray 实现：dash = 该段弧长，gap = 周长 - 弧长；
 * 只有一段时 gap = 0，自然画成满环。total 为 0 时不出图，显示占位。
 */
import { computed } from 'vue'
import { fmtFen } from '@/utils/format'

const props = defineProps({
  /** @type {{ value: number, color: string, label: string }[]} 已按金额降序 */
  items: { type: Array, default: () => [] },
  /** 总额（分） */
  total: { type: Number, default: 0 },
})

const R = 48
const C = 2 * Math.PI * R // 环周长：dasharray 的分母

/** 每段的弧长与起始偏移（offset 取负值，让 dash 从 12 点方向顺次排开） */
const segments = computed(() => {
  if (!props.total) return []
  let acc = 0
  return props.items.map((it) => {
    const len = (it.value / props.total) * C
    const seg = { ...it, len, offset: acc }
    acc += len
    return seg
  })
})

const legend = computed(() => props.items.slice(0, 5))
const restCount = computed(() => Math.max(0, props.items.length - 5))

function pct(value) {
  return props.total ? Math.round((value / props.total) * 100) : 0
}
</script>

<template>
  <div class="donut-wrap">
    <svg v-if="total" class="donut" viewBox="0 0 120 120">
      <g transform="rotate(-90 60 60)">
        <circle
          v-for="(s, i) in segments"
          :key="i"
          class="seg"
          cx="60"
          cy="60"
          r="48"
          :stroke="s.color"
          :stroke-dasharray="`${s.len} ${C - s.len}`"
          :stroke-dashoffset="-s.offset"
        />
      </g>
      <text class="total" x="60" y="58">{{ fmtFen(total) }}</text>
      <text class="cap" x="60" y="72">总支出</text>
    </svg>
    <p v-else class="placeholder">本月还没有支出</p>

    <ul v-if="total" class="legend">
      <li v-for="(it, i) in legend" :key="i" class="lg-row">
        <span class="dot" :style="{ background: it.color }"></span>
        <span class="lb">{{ it.label }}</span>
        <span class="amt">{{ fmtFen(it.value) }}</span>
        <span class="pc">{{ pct(it.value) }}%</span>
      </li>
      <li v-if="restCount" class="lg-row rest">+{{ restCount }} 项</li>
    </ul>
  </div>
</template>

<style scoped>
.donut-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.donut {
  width: 150px;
  height: 150px;
  margin: 0 auto;
  display: block;
}

.seg {
  fill: none;
  stroke-width: 16;
}

.total {
  text-anchor: middle;
  font-size: 16px;
  font-weight: 600;
  fill: var(--text);
}

.cap {
  text-anchor: middle;
  font-size: 9px;
  fill: var(--text-secondary);
}

.legend {
  list-style: none;
  margin: 0;
  padding: 0;
}

.lg-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  font-size: 13px;
}

.dot {
  flex: none;
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.lb {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.amt,
.pc {
  font-variant-numeric: tabular-nums;
}

.pc {
  width: 4em;
  text-align: right;
  color: var(--text-secondary);
}

.rest {
  color: var(--text-secondary);
  font-size: 12px;
  justify-content: flex-end;
}
</style>
