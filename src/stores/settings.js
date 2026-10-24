import { defineStore } from 'pinia'
import * as settingsRepo from '@/repositories/settings'
import { DEFAULT_REMINDER_DAYS } from '@/services/backupStatus'

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    monthlyBudget: 0, // 月度总预算（分），0 = 不设
    ownerName: '',
    lastBackupAt: '', // 上次成功导出备份的 ISO 时间（空 = 从未备份），驱动设置页备份提醒
    backupReminderDays: DEFAULT_REMINDER_DAYS, // 3/7/14/30
    backupReminderEnabled: true,
    // 预留：partnerName / syncConfig（Phase 3 双人同步）
  }),
  actions: {
    async load() {
      this.monthlyBudget = await settingsRepo.get('monthlyBudget', 0)
      this.ownerName = await settingsRepo.get('ownerName', '')
      this.lastBackupAt = await settingsRepo.get('lastBackupAt', '')
      this.backupReminderDays = await settingsRepo.getBackupReminderDays()
      this.backupReminderEnabled = await settingsRepo.getBackupReminderEnabled()
    },
    async setMonthlyBudget(fen) {
      this.monthlyBudget = fen
      await settingsRepo.set('monthlyBudget', fen)
    },
    async setLastBackupAt(iso) {
      // 先落库再更新内存：持久化失败时不能假装备份时间已更新
      await settingsRepo.set('lastBackupAt', iso)
      this.lastBackupAt = iso
    },
    async setBackupReminderDays(days) {
      this.backupReminderDays = await settingsRepo.setBackupReminderDays(days)
    },
    async setBackupReminderEnabled(enabled) {
      this.backupReminderEnabled = await settingsRepo.setBackupReminderEnabled(enabled)
    },
  },
})
