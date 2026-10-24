<script setup>
/**
 * BackupReminder.vue — 记一笔页的轻量备份提醒
 *
 * 只在「有账目 + 提醒开启 + 状态非 ok」时出现；只做提示与跳转，
 * 不在这里导出、不弹模态，避免打断记账主路径。
 */
import { computed } from 'vue'
import { useRecordsStore } from '@/stores/records'
import { useSettingsStore } from '@/stores/settings'
import { backupAgeDays, getBackupStatus, shouldShowBackupReminder } from '@/services/backupStatus'

const records = useRecordsStore()
const settings = useSettingsStore()

const status = computed(() =>
  getBackupStatus({
    lastBackupAt: settings.lastBackupAt,
    days: settings.backupReminderDays,
    now: Date.now(),
  }),
)

const visible = computed(() =>
  shouldShowBackupReminder({
    status: status.value,
    recordCount: records.count,
    enabled: settings.backupReminderEnabled,
  }),
)

const age = computed(() => backupAgeDays(settings.lastBackupAt))

const text = computed(() => {
  if (status.value === 'never') return '尚未备份，清缓存或换设备会丢账'
  if (status.value === 'stale') return `已 ${age.value} 天未备份`
  return '上次备份时间无法识别，建议重新导出'
})
</script>

<template>
  <RouterLink v-if="visible" class="reminder" to="/settings" data-testid="backup-reminder">
    <span class="dot"></span>
    <span class="text">{{ text }}</span>
    <span class="go">去备份 ›</span>
  </RouterLink>
</template>

<style scoped>
.reminder {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 8px 12px;
  border: 1px solid var(--glass-edge-2);
  border-radius: 10px;
  background: var(--glass-well);
  color: var(--text-secondary);
  font-size: 12px;
  text-decoration: none;
}

.dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--warning);
}

.text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.go {
  flex: none;
  color: var(--on-glass);
}
</style>
