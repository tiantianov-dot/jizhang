<script setup>
/**
 * BackupSettingCard.vue — 数据备份卡片（组装状态区、导出与导入确认流程）
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useRecordsStore } from '@/stores/records'
import { useCategoriesStore } from '@/stores/categories'
import { useBackupStore } from '@/stores/backup'
import { stampNow } from '@/utils/format'
import { classifyShareOutcome, shouldPersistBackup } from '@/services/backupExport'
import BackupStatusSection from '@/components/settings/BackupStatusSection.vue'
import BackupImportPanel from '@/components/settings/BackupImportPanel.vue'

const emit = defineEmits(['message'])

const settings = useSettingsStore()
const records = useRecordsStore()
const categories = useCategoriesStore()
const backup = useBackupStore()

const exporting = ref(false)
const downloadPending = ref(false)
const importPanel = ref(null)

const isExporting = computed(() => exporting.value || backup.exportBusy)

async function setReminderDays(days) {
  try {
    await settings.setBackupReminderDays(days)
    emit('message', `备份提醒周期已设为 ${settings.backupReminderDays} 天`)
  } catch {
    emit('message', '提醒周期未保存，请检查浏览器存储后重试')
  }
}

async function toggleReminder() {
  try {
    await settings.setBackupReminderEnabled(!settings.backupReminderEnabled)
    emit('message', settings.backupReminderEnabled ? '已开启备份提醒' : '已关闭备份提醒')
  } catch {
    emit('message', '提醒开关未保存，请检查浏览器存储后重试')
  }
}

onMounted(() => {
  backup.refreshCounts()
})

// 冷启动直接进设置页时，本组件挂载早于 App.vue 的 initDB/load：
// 等 store 到位后再取一次，避免计数区因数据库未就绪而缺失。
watch(
  () => [records.list.length, categories.list.length],
  () => backup.refreshCounts(),
)

/** 只在文件确实已生成后调用；持久化失败不能显示成备份成功 */
async function persistBackupTime() {
  try {
    await settings.setLastBackupAt(new Date().toISOString())
    downloadPending.value = false
    return true
  } catch {
    emit('message', '备份已生成，但状态未更新')
    return false
  }
}

async function doExport() {
  if (isExporting.value) return
  exporting.value = true
  try {
    const data = await backup.exportSnapshot()
    if (!data) return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const file = new File([blob], `jizhang-backup-${stampNow()}.json`, {
      type: 'application/json',
    })
    // 优先系统分享（iOS 可存到文件/隔空投送），降级为下载。
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      let outcome = 'saved'
      try {
        await navigator.share({ files: [file], title: '记账备份' })
      } catch (err) {
        outcome = classifyShareOutcome(err)
        emit(
          'message',
          outcome === 'cancelled' ? '已取消分享，未更新备份时间' : '分享失败，未更新备份时间',
        )
        return
      }
      if (shouldPersistBackup({ method: 'share', outcome })) {
        if (await persistBackupTime()) emit('message', '已导出备份，请确认文件已保存')
      }
      return
    }

    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000) // 立即 revoke 可能截断下载，延迟释放
    // 下载无法得知用户是否真的保存成功：不自动记时间，等一次显式确认
    downloadPending.value = true
    emit('message', '已生成下载，请确认文件已保存')
  } catch (err) {
    emit('message', `导出失败：${err.message}`)
  } finally {
    exporting.value = false
  }
}

async function confirmDownloaded() {
  if (!shouldPersistBackup({ method: 'download', confirmed: true })) return
  if (await persistBackupTime()) emit('message', '备份时间已更新')
}
</script>

<template>
  <div class="card">
    <BackupStatusSection
      :last-backup-at="settings.lastBackupAt"
      :reminder-days="settings.backupReminderDays"
      :reminder-enabled="settings.backupReminderEnabled"
      :counts="backup.counts"
      :active-record-count="records.count"
      @change-days="setReminderDays"
      @toggle-reminder="toggleReminder"
    />
    <div class="row">
      <button class="btn" :disabled="isExporting" data-testid="backup-export" @click="doExport">
        {{ isExporting ? '导出中…' : '导出 JSON' }}
      </button>
      <button class="btn" @click="importPanel?.openPicker()">导入 JSON</button>
    </div>
    <button
      v-if="downloadPending"
      class="btn confirm"
      data-testid="backup-confirm-saved"
      @click="confirmDownloaded"
    >
      我已保存，更新备份时间
    </button>
    <BackupImportPanel
      ref="importPanel"
      @message="emit('message', $event)"
      @imported="emit('message', $event)"
    />
    <p class="placeholder">
      数据只存在这台设备的浏览器里（IndexedDB）。清缓存、换设备前请先导出——这是底线功能。<br />
      当前账目 {{ records.count }} 条 · 分类 {{ categories.list.length }} 个（含已归档）。
    </p>
  </div>
</template>

<style scoped>
.btn.confirm {
  width: 100%;
  margin: 6px 0 2px;
}
</style>
