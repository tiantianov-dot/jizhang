<script setup>
/**
 * BackupSettingCard.vue — 数据备份卡片（健康度三态、提醒配置、计数披露、导出与导入组装）
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useRecordsStore } from '@/stores/records'
import { useCategoriesStore } from '@/stores/categories'
import { stampNow } from '@/utils/format'
import * as backup from '@/repositories/backup'
import { backupAgeDays, getBackupStatus } from '@/services/backupStatus'
import { classifyShareOutcome, shouldPersistBackup } from '@/services/backupExport'
import { summarizeBackup } from '@/services/backupSummary'
import BackupImportPanel from '@/components/settings/BackupImportPanel.vue'

const emit = defineEmits(['message'])

const settings = useSettingsStore()
const records = useRecordsStore()
const categories = useCategoriesStore()

const exportBusy = ref(false)
const downloadPending = ref(false)
const backupCounts = ref(null)
const importPanel = ref(null)

const backupStatus = computed(() =>
  getBackupStatus({
    lastBackupAt: settings.lastBackupAt,
    days: settings.backupReminderDays,
    now: Date.now(),
  }),
)

const backupAge = computed(() => backupAgeDays(settings.lastBackupAt))

const backupStatusText = computed(() => {
  if (backupStatus.value === 'never') return '尚未备份'
  if (backupStatus.value === 'stale') {
    return `已 ${backupAge.value} 天未备份（周期 ${settings.backupReminderDays} 天）`
  }
  if (backupStatus.value === 'ok') {
    return backupAge.value === 0 ? '上次备份：今天' : `上次备份：${backupAge.value} 天前`
  }
  return '上次备份时间无法识别，建议重新导出'
})

/** ISO → 本地 YYYY-MM-DD HH:mm；无法解析返回空串 */
function formatBackupTime(iso) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const lastBackupText = computed(() => {
  if (!settings.lastBackupAt) return '尚未备份'
  return formatBackupTime(settings.lastBackupAt) || '时间无法识别'
})

async function setReminderDays(e) {
  const days = Number(e.target.value)
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

/** 与导出同源：直接统计 exportAll 的 records，避免和列表的有效账目口径混淆 */
async function refreshBackupCounts() {
  try {
    const data = await backup.exportAll()
    backupCounts.value = summarizeBackup(data.records)
  } catch {
    backupCounts.value = null
  }
}

onMounted(() => {
  refreshBackupCounts()
})

// 冷启动直接进设置页时，本组件挂载早于 App.vue 的 initDB/load：
// 等 store 到位后再取一次，避免计数区因数据库未就绪而缺失。
watch(
  () => [records.list.length, categories.list.length],
  () => refreshBackupCounts(),
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
  if (exportBusy.value) return
  exportBusy.value = true
  try {
    const data = await backup.exportAll()
    backupCounts.value = summarizeBackup(data.records)
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
    exportBusy.value = false
  }
}

async function confirmDownloaded() {
  if (!shouldPersistBackup({ method: 'download', confirmed: true })) return
  if (await persistBackupTime()) emit('message', '备份时间已更新')
}

async function onImported(message) {
  await refreshBackupCounts()
  emit('message', message)
}
</script>

<template>
  <div class="card">
    <div class="row">
      <span>数据备份</span>
      <span class="cur" data-testid="backup-last-at">上次导出：{{ lastBackupText }}</span>
    </div>
    <!-- 事实状态：空账本也显示「尚未备份」；关闭提醒时只隐藏警示，仍保留上次导出时间 -->
    <div
      v-if="settings.backupReminderEnabled"
      class="row bstat"
      data-testid="backup-status"
      :data-status="backupStatus"
    >
      <span class="dot" :class="backupStatus"></span>
      <span :class="backupStatus === 'ok' ? 'dim' : 'warn'">{{ backupStatusText }}</span>
    </div>
    <div class="row">
      <span>提醒周期</span>
      <select
        class="select"
        :value="settings.backupReminderDays"
        aria-label="备份提醒周期"
        data-testid="backup-days"
        @change="setReminderDays"
      >
        <option v-for="d in [3, 7, 14, 30]" :key="d" :value="d">{{ d }} 天</option>
      </select>
    </div>
    <div class="row">
      <span>备份提醒</span>
      <button
        class="btn"
        :aria-pressed="settings.backupReminderEnabled"
        data-testid="backup-reminder-toggle"
        @click="toggleReminder"
      >
        {{ settings.backupReminderEnabled ? '已开启' : '已关闭' }}
      </button>
    </div>
    <p v-if="backupCounts" class="backup-disclosure" data-testid="backup-counts">
      有效 {{ backupCounts.active }} · 回收站 {{ backupCounts.deleted }} · 本机标记
      {{ backupCounts.private }} · 备份总计 {{ backupCounts.total }}
    </p>
    <p v-if="backupCounts" class="backup-disclosure dim">
      列表只显示有效账目（{{ records.count }} 条）；回收站与 🔒
      本机标记记录仍会写入完整备份，用于换机完整恢复，不代表加密或密码保护。
    </p>
    <div class="row">
      <button class="btn" :disabled="exportBusy" data-testid="backup-export" @click="doExport">
        {{ exportBusy ? '导出中…' : '导出 JSON' }}
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
      @imported="onImported"
    />
    <p class="placeholder">
      数据只存在这台设备的浏览器里（IndexedDB）。清缓存、换设备前请先导出——这是底线功能。<br />
      当前账目 {{ records.count }} 条 · 分类 {{ categories.list.length }} 个（含已归档）。
    </p>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0;
  font-size: 14px;
}

.cur {
  color: var(--text-secondary);
  font-size: 13px;
}

.bstat {
  justify-content: flex-start;
  font-size: 13px;
}

.backup-disclosure {
  margin: 2px 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 8px;
}

.dot.never {
  background: var(--danger);
}

.dot.stale,
.dot.unknown {
  background: var(--warning);
}

.dot.ok {
  background: var(--brand);
  opacity: 0.6;
}

.dot.never + span {
  color: var(--danger);
}

.dot.stale + span {
  color: var(--warning);
}

.warn {
  color: var(--warning);
}

.dim {
  color: var(--text-secondary);
}

.select {
  border: 1px solid var(--glass-edge-2);
  border-radius: 8px;
  background: var(--glass-well);
  color: var(--text);
  font-size: 13px;
  padding: 6px 10px;
  outline: none;
}

.btn {
  background: var(--glass-fill);
  border: 1px solid var(--glass-edge-2);
  color: var(--on-glass);
  font-size: 13px;
  padding: 8px 16px;
  border-radius: 8px;
  white-space: nowrap;
  text-shadow: var(--on-glass-shadow);
}

.btn.confirm {
  width: 100%;
  margin: 6px 0 2px;
}

.btn:disabled {
  opacity: 0.55;
}

.btn:active {
  filter: brightness(1.25);
}
</style>
