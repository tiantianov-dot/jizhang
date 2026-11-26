<script setup>
import { onMounted, ref, watch } from 'vue'
import { playMediaSafely } from '@/utils/media'

const props = defineProps({
  state: { type: String, default: 'closed' },
  stream: { type: Object, default: null },
  parallax: { type: Object, default: () => ({ x: 0, y: 0 }) },
})

const videoEl = ref(null)

function bindStream() {
  const el = videoEl.value
  if (!el) return
  el.srcObject = props.stream || null
  if (props.stream) playMediaSafely(el)
}

watch(() => props.stream, bindStream)
onMounted(bindStream)
</script>

<template>
  <div class="immersive" :data-state="state" aria-hidden="true">
    <div
      class="immersive-shift"
      :style="{ '--im-x': `${parallax.x}px`, '--im-y': `${parallax.y}px` }"
    >
      <video
        ref="videoEl"
        class="immersive-video"
        data-testid="immersive-video"
        autoplay
        playsinline
        muted
      />
    </div>
    <div class="immersive-dim" data-testid="immersive-dim" />
  </div>
</template>

<style scoped>
.immersive {
  position: fixed;
  inset: 0;
  z-index: var(--z-bg-immersive);
  pointer-events: none;
}

.immersive-shift {
  position: absolute;
  inset: -10px;
  transform: translate3d(var(--im-x, 0px), var(--im-y, 0px), 0);
}

.immersive-video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: translateZ(0);
  will-change: transform;
}

.immersive-dim {
  position: absolute;
  inset: 0;
  background: rgba(6, 8, 14, 0.3);
}
</style>
