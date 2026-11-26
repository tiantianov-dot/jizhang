<script setup>
/**
 * BackupStatusSection.vue — 备份健康度、提醒周期/开关与完整备份计数披露区
 *
 * 采用 Fragment 根结构，使每行与披露段保持为外层 .card 的直接子元素（维持 glass.css .card > * 层级）。
 */
import { computed } from 'vue'
import { formatLocalDateTime } from '@/utils/format'
import {
  DEFAULT_REMINDER_DAYS,
  REMINDER_DAYS,
  backupAgeDays,
  getBackupStatus,
} from '@/services/backupStatus'
import { formatBackupStatusText } from '@/services/backupFormat'

const props = defineProps({
  lastBackupAt: { type: String, default: '' },
  reminderDays: { type: Number, default: DEFAULT_REMINDER_DAYS },
  reminderEnabled: { type: Boolean, default: true },
  counts: { type: Object, default: null },
  activeRecordCount: { type: Number, default: 0 },
})

const emit = defineEmits(['change-days', 'toggle-reminder'])

const backupStatus = computed(() =>
  getBackupStatus({
    lastBackupAt: props.lastBackupAt,
    days: props.reminderDays,
    now: Date.now(),
  }),
)

const backupAge = computed(() => backupAgeDays(props.lastBackupAt))

const backupStatusText = computed(() =>
  formatBackupStatusText({
    status: backupStatus.value,
    ageDays: backupAge.value,
    reminderDays: props.reminderDays,
  }),
)

const lastBackupText = computed(() => {
  if (!props.lastBackupAt) return '尚未备份'
  return formatLocalDateTime(props.lastBackupAt) || '时间无法识别'
})

function onDaysChange(e) {
  emit('change-days', Number(e.target.value))
}
</script>

<template>
  <div class="row">
    <span>数据备份</span>
    <span class="cur" data-testid="backup-last-at">上次导出：{{ lastBackupText }}</span>
  </div>
  <!-- 事实状态：空账本也显示「尚未备份」；关闭提醒时只隐藏警示，仍保留上次导出时间 -->
  <div
    v-if="reminderEnabled"
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
      :value="reminderDays"
      aria-label="备份提醒周期"
      data-testid="backup-days"
      @change="onDaysChange"
    >
      <option v-for="d in REMINDER_DAYS" :key="d" :value="d">{{ d }} 天</option>
    </select>
  </div>
  <div class="row">
    <span>备份提醒</span>
    <button
      class="btn"
      :aria-pressed="reminderEnabled"
      data-testid="backup-reminder-toggle"
      @click="emit('toggle-reminder')"
    >
      {{ reminderEnabled ? '已开启' : '已关闭' }}
    </button>
  </div>
  <p v-if="counts" class="backup-disclosure" data-testid="backup-counts">
    有效 {{ counts.active }} · 回收站 {{ counts.deleted }} · 本机标记 {{ counts.private }} ·
    备份总计 {{ counts.total }}
  </p>
  <p v-if="counts" class="backup-disclosure dim">
    列表只显示有效账目（{{ activeRecordCount }} 条）；回收站与 🔒
    本机标记记录仍会写入完整备份，用于换机完整恢复，不代表加密或密码保护。
  </p>
</template>

<style scoped>
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
  border-radius: var(--radius-sm);
  background: var(--glass-well);
  color: var(--text);
  font-size: 13px;
  padding: 6px 10px;
  outline: none;
}
</style>
