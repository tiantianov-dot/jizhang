<script setup>
/**
 * BackgroundLayer.vue — 上传视频背景（全屏）
 *
 * 只有 kind === 'video' 且未挂起时渲染；与 ImmersiveLayer 互斥。
 * data-bg / data-video-ready 由 background store 独占写入，这里只上报 ready。
 * 零 backdrop-filter。低电量模式拒绝自动播放时保留首帧 poster，不弹错。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useBackgroundStore } from '@/stores/background'

const background = useBackgroundStore()
const videoEl = ref(null)
const poster = ref('')

const visible = computed(
  () => background.kind === 'video' && !background.suspended && !!background.url,
)

function onLoadedData() {
  const el = videoEl.value
  if (!el) return
  background.markVideoReady()
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 180
    canvas.getContext('2d').drawImage(el, 0, 0, 320, 180)
    poster.value = canvas.toDataURL('image/jpeg', 0.6)
  } catch {
    // 取不到首帧就保留视频自身画面，不影响播放
  }
  el.play().catch(() => {})
}

watch(
  () => background.url,
  () => {
    poster.value = ''
  },
)
onBeforeUnmount(() => background.resetVideoReady())
</script>

<template>
  <video
    v-if="visible"
    ref="videoEl"
    class="bg-video"
    data-testid="bg-video"
    :src="background.url"
    :poster="poster || undefined"
    muted
    loop
    playsinline
    autoplay
    preload="auto"
    @loadeddata="onLoadedData"
  />
</template>

<style scoped>
.bg-video {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: -4;
  pointer-events: none;
}
</style>
