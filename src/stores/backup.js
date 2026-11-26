/**
 * stores/backup.js — 备份导出、计数披露与导入预览/确认的唯一状态编排层
 *
 * 唯一对接 repositories/backup，彻底消除视图与组件对 repository 的跨层直连。
 */
import { defineStore } from 'pinia'
import * as backupRepo from '@/repositories/backup'
import { summarizeBackup } from '@/services/backupSummary'
import { useRecordsStore } from './records'
import { useCategoriesStore } from './categories'
import { useSettingsStore } from './settings'
import { useAppearanceStore } from './appearance'

export const useBackupStore = defineStore('backup', {
  state: () => ({
    /** @type {{ active: number, deleted: number, private: number, total: number } | null} */
    counts: null,
    exportBusy: false,
    importBusy: false,
    /** @type {{ payload: object, summary: object } | null} */
    pendingImport: null,
  }),
  actions: {
    /** 与导出同源：直接统计 exportAll 的 records，异常时置空 */
    async refreshCounts() {
      try {
        const data = await backupRepo.exportAll()
        this.counts = summarizeBackup(data.records)
        return this.counts
      } catch {
        this.counts = null
        return null
      }
    },

    /**
     * 导出完整本地换机快照并同步刷新计数；并发调用时返回 null。
     * @returns {Promise<object|null>}
     */
    async exportSnapshot() {
      if (this.exportBusy) return null
      this.exportBusy = true
      try {
        const data = await backupRepo.exportAll()
        this.counts = summarizeBackup(data.records)
        return data
      } finally {
        this.exportBusy = false
      }
    },

    /**
     * 只读导入预览：校验失败清空 pendingImport，合法时保存待确认载荷。
     * @returns {Promise<{ ok: true, summary: object } | { ok: false, errors: object[] }>}
     */
    async previewImport(payload) {
      try {
        const preview = await backupRepo.previewImport(payload)
        if (preview.errors.length) {
          this.pendingImport = null
          return { ok: false, errors: preview.errors }
        }
        this.pendingImport = { payload, summary: preview.summary }
        return { ok: true, summary: preview.summary }
      } catch (err) {
        this.pendingImport = null
        throw err
      }
    },

    /**
     * 确认导入：原子落库 → 并行重载 4 个业务 store → 刷新计数 → 清空待确认态。
     * @returns {Promise<object|null>} 无待导入项或正在导入时返回 null
     */
    async confirmImport() {
      if (!this.pendingImport || this.importBusy) return null
      this.importBusy = true
      try {
        const summary = await backupRepo.importMerge(this.pendingImport.payload)
        const records = useRecordsStore()
        const categories = useCategoriesStore()
        const settings = useSettingsStore()
        const appearance = useAppearanceStore()
        await Promise.all([records.load(), categories.load(), settings.load(), appearance.load()])
        await this.refreshCounts()
        this.pendingImport = null
        return summary
      } finally {
        this.importBusy = false
      }
    },

    /** 取消待导入预览；正在写入时拒绝取消 */
    cancelImport() {
      if (this.importBusy) return false
      this.pendingImport = null
      return true
    },
  },
})
