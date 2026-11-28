/**
 * stores/cloudInbox.js — 云端收件箱配置、并发防重入同步与状态编排层
 *
 * 唯一对接 repositories/settings（收件箱配置/状态）与 services/cloudInbox，
 * 入库成功后并行刷新 records / categories / backup 计数，保证视图层零直连 repo。
 */
import { defineStore } from 'pinia'
import * as settingsRepo from '@/repositories/settings'
import * as cloudInboxService from '@/services/cloudInbox'
import { useBackupStore } from './backup'
import { useCategoriesStore } from './categories'
import { useRecordsStore } from './records'

export const useCloudInboxStore = defineStore('cloudInbox', {
  state: () => ({
    url: '',
    token: '',
    lastSyncAt: '',
    /** @type {'ok'|'error'|''} */
    lastResult: '',
    lastCount: 0,
    lastError: '',
    loaded: false,
    syncing: false,
    testing: false,
    syncingCategories: false,
  }),
  getters: {
    configured: (s) => cloudInboxService.isInboxConfigured({ url: s.url, token: s.token }),
  },
  actions: {
    async load() {
      const [config, status] = await Promise.all([
        settingsRepo.getCloudInboxConfig(),
        settingsRepo.getCloudInboxStatus(),
      ])
      this.url = config.url
      this.token = config.token
      this.lastSyncAt = status.lastSyncAt
      this.lastResult = status.lastResult
      this.lastCount = status.lastCount
      this.lastError = status.lastError
      this.loaded = true
    },

    async saveConfig({ url, token }) {
      const saved = await settingsRepo.setCloudInboxConfig({ url, token })
      this.url = saved.url
      this.token = saved.token
      return saved
    },

    async clearConfig() {
      await settingsRepo.clearCloudInboxConfig()
      this.url = ''
      this.token = ''
      this.lastSyncAt = ''
      this.lastResult = ''
      this.lastCount = 0
      this.lastError = ''
    },

    async testConnection(overrideConfig = null) {
      if (this.testing) {
        return { ok: false, busy: true, error: '正在测试连接…' }
      }
      this.testing = true
      try {
        const target = overrideConfig ?? { url: this.url, token: this.token }
        return await cloudInboxService.testConnection(target)
      } finally {
        this.testing = false
      }
    },

    async syncCategories(overrideConfig = null) {
      if (this.syncingCategories) {
        return { ok: false, busy: true, error: '正在同步分类…' }
      }
      this.syncingCategories = true
      try {
        const target = overrideConfig ?? { url: this.url, token: this.token }
        return await cloudInboxService.syncCategories(target)
      } finally {
        this.syncingCategories = false
      }
    },

    async persistStatus(status) {
      this.lastSyncAt = status.lastSyncAt
      this.lastResult = status.lastResult
      this.lastCount = status.lastCount
      this.lastError = status.lastError
      try {
        await settingsRepo.setCloudInboxStatus(status)
      } catch {
        // 状态持久化异常不应覆盖已完成的本地入账结果
      }
    },

    async syncNow({ silent = false } = {}) {
      if (!this.configured) {
        return {
          ok: true,
          configured: false,
          synced: 0,
          skippedDuplicates: 0,
          failed: 0,
          invalid: 0,
          acked: 0,
          ackFailed: false,
          busy: false,
        }
      }
      if (this.syncing) {
        return {
          ok: true,
          configured: true,
          synced: 0,
          skippedDuplicates: 0,
          failed: 0,
          invalid: 0,
          acked: 0,
          ackFailed: false,
          busy: true,
        }
      }

      this.syncing = true
      try {
        const result = await cloudInboxService.syncPending({
          url: this.url,
          token: this.token,
        })

        if (result.synced > 0) {
          const records = useRecordsStore()
          const categories = useCategoriesStore()
          const backup = useBackupStore()
          await Promise.allSettled([records.load(), categories.load(), backup.refreshCounts()])
        }

        const status = {
          lastSyncAt: new Date().toISOString(),
          lastResult: result.ok ? 'ok' : 'error',
          lastCount: result.synced || 0,
          lastError: result.ok
            ? result.ackFailed
              ? '已入库，但云端确认清理失败（下次自动重试）'
              : ''
            : result.error || '同步失败',
        }
        await this.persistStatus(status)

        return { ...result, busy: false }
      } catch (err) {
        const message = err?.message || '同步失败'
        await this.persistStatus({
          lastSyncAt: new Date().toISOString(),
          lastResult: 'error',
          lastCount: 0,
          lastError: message,
        })
        if (!silent) {
          return {
            ok: false,
            configured: true,
            synced: 0,
            skippedDuplicates: 0,
            failed: 0,
            invalid: 0,
            acked: 0,
            ackFailed: false,
            busy: false,
            error: message,
          }
        }
        return {
          ok: false,
          configured: true,
          synced: 0,
          skippedDuplicates: 0,
          failed: 0,
          invalid: 0,
          acked: 0,
          ackFailed: false,
          busy: false,
          error: message,
        }
      } finally {
        this.syncing = false
      }
    },
  },
})
