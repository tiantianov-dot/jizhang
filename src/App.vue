<script setup>
import { onMounted, ref } from 'vue'
import { initDB } from '@/db'
import { useCategoriesStore } from '@/stores/categories'
import { useRecordsStore } from '@/stores/records'
import { useSettingsStore } from '@/stores/settings'
import { useAppearanceStore } from '@/stores/appearance'
import { usePolarity } from '@/composables/usePolarity'
import TabBar from '@/components/TabBar.vue'

const categories = useCategoriesStore()
const records = useRecordsStore()
const settings = useSettingsStore()
const appearance = useAppearanceStore()

usePolarity()

// 合成星点：只闪烁、不漂移；位置固定，避免每次挂载重排
const stars = [
  { x: 7, y: 10, s: 1.5, dur: 3.8, delay: 0 },
  { x: 22, y: 6, s: 1, dur: 5.4, delay: 1.2 },
  { x: 37, y: 14, s: 2, dur: 4.2, delay: 0.6 },
  { x: 52, y: 8, s: 1, dur: 6.1, delay: 2.1 },
  { x: 68, y: 12, s: 1.5, dur: 3.4, delay: 0.3 },
  { x: 84, y: 7, s: 1, dur: 5.8, delay: 1.7 },
  { x: 93, y: 18, s: 2, dur: 4.8, delay: 0.9 },
  { x: 12, y: 26, s: 1, dur: 6.4, delay: 2.6 },
  { x: 29, y: 33, s: 1.5, dur: 3.9, delay: 1.4 },
  { x: 44, y: 24, s: 1, dur: 5.1, delay: 0.2 },
  { x: 61, y: 30, s: 1.5, dur: 4.5, delay: 1.9 },
  { x: 76, y: 23, s: 1, dur: 6.7, delay: 0.7 },
  { x: 88, y: 36, s: 1.5, dur: 3.6, delay: 2.3 },
  { x: 18, y: 44, s: 1, dur: 5.6, delay: 0.4 },
  { x: 57, y: 47, s: 1, dur: 6.2, delay: 1.6 },
  { x: 81, y: 52, s: 1.5, dur: 4.1, delay: 2.8 },
]

/** IndexedDB 初始化失败（无痕模式/存储被禁用）时展示兜底说明，而不是白屏 */
const bootError = ref(false)

onMounted(async () => {
  try {
    await initDB()
    await Promise.all([categories.load(), records.load(), settings.load(), appearance.load()])
  } catch (err) {
    console.error('[jizhang] initDB failed:', err)
    bootError.value = true
  }
})
</script>

<template>
  <div class="starfield" aria-hidden="true">
    <i
      v-for="(s, i) in stars"
      :key="i"
      :style="{
        left: s.x + '%',
        top: s.y + '%',
        width: s.s + 'px',
        height: s.s + 'px',
        '--star-dur': s.dur + 's',
        '--star-delay': s.delay + 's',
      }"
    />
  </div>

  <div v-if="bootError" class="page boot-error">
    <div class="card">
      <p class="title">本地数据库启动失败</p>
      <p class="placeholder">
        记账数据依赖浏览器 IndexedDB。请确认：未处于无痕/隐私模式、未禁用站点存储，然后刷新重试。<br />
        若仍失败，请先在能正常打开的设备上导出备份，再清理本站数据。
      </p>
    </div>
  </div>
  <template v-else>
    <RouterView />
    <TabBar />
  </template>
</template>

<style scoped>
.boot-error {
  display: flex;
  align-items: center;
  justify-content: center;
}

.boot-error .title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 8px;
}
</style>
