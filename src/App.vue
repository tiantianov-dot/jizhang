<script setup>
import { onMounted, ref } from 'vue'
import { initDB } from '@/db'
import { useCategoriesStore } from '@/stores/categories'
import { useRecordsStore } from '@/stores/records'
import { useSettingsStore } from '@/stores/settings'
import TabBar from '@/components/TabBar.vue'

const categories = useCategoriesStore()
const records = useRecordsStore()
const settings = useSettingsStore()

/** IndexedDB 初始化失败（无痕模式/存储被禁用）时展示兜底说明，而不是白屏 */
const bootError = ref(false)

onMounted(async () => {
  try {
    await initDB()
    await Promise.all([categories.load(), records.load(), settings.load()])
  } catch (err) {
    console.error('[jizhang] initDB failed:', err)
    bootError.value = true
  }
})
</script>

<template>
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
