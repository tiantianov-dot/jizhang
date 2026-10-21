<script setup>
/**
 * StarfieldLayer.vue — 默认背景：程序化星空画布 + 16 个闪烁星点
 *
 * canvas 只在挂载与视口变化（120ms 防抖）时重绘，无 rAF。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { STAR_SEEDS, drawStarfield } from '@/services/starfield'

const canvasEl = ref(null)
let resizeTimer = 0

function draw() {
  const canvas = canvasEl.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const width = Math.max(1, rect.width)
  const height = Math.max(1, rect.height)
  const dpr = Math.min(window.devicePixelRatio || 1, 3)
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  drawStarfield(ctx, width, height)
}

function onViewportChange() {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(draw, 120)
}

onMounted(() => {
  draw()
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('orientationchange', onViewportChange)
})

onBeforeUnmount(() => {
  clearTimeout(resizeTimer)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('orientationchange', onViewportChange)
})
</script>

<template>
  <div class="starfield" aria-hidden="true">
    <canvas ref="canvasEl" />
    <i
      v-for="(s, i) in STAR_SEEDS"
      :key="i"
      :style="{
        left: s[0] + '%',
        top: s[1] + '%',
        width: s[2] + 'px',
        height: s[2] + 'px',
        '--dur': s[3] + 's',
        '--delay': s[4] + 's',
      }"
    />
  </div>
</template>

<style scoped>
.starfield {
  position: fixed;
  inset: 0;
  z-index: -2;
  overflow: hidden;
  pointer-events: none;
}

.starfield canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.starfield i {
  position: absolute;
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 5px rgba(255, 255, 255, 0.8);
  opacity: 0.35;
  animation: star-twinkle var(--dur, 4s) ease-in-out infinite alternate;
  animation-delay: var(--delay, 0s);
}

@keyframes star-twinkle {
  from {
    opacity: 0.12;
  }
  to {
    opacity: 0.85;
  }
}

@media (prefers-reduced-motion: reduce) {
  .starfield i {
    animation: none;
    opacity: 0.4;
  }
}
</style>
