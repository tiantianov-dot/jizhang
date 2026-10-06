import { defineStore } from 'pinia'
import * as settingsRepo from '@/repositories/settings'

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    monthlyBudget: 0, // 月度总预算（分），0 = 不设
    ownerName: '',
    lastBackupAt: '', // 上次成功导出备份的 ISO 时间（空 = 从未备份），驱动设置页备份提醒
    // 预留：partnerName / syncConfig（Phase 3 双人同步）
  }),
  actions: {
    async load() {
      this.monthlyBudget = await settingsRepo.get('monthlyBudget', 0)
      this.ownerName = await settingsRepo.get('ownerName', '')
      this.lastBackupAt = await settingsRepo.get('lastBackupAt', '')
    },
    async setMonthlyBudget(fen) {
      this.monthlyBudget = fen
      await settingsRepo.set('monthlyBudget', fen)
    },
    async setLastBackupAt(iso) {
      this.lastBackupAt = iso
      await settingsRepo.set('lastBackupAt', iso)
    },
  },
})
