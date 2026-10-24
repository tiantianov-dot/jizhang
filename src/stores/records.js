import { defineStore } from 'pinia'
import * as recordsRepo from '@/repositories/records'
import * as stats from '@/services/stats'

/**
 * 写库成功后 reload 失败不能当成“未保存”：返回 refreshFailed，
 * 由 UI 显示“已保存，列表暂未刷新”，避免用户重复提交。
 */
async function reloadQuietly(store) {
  try {
    await store.load()
    return false
  } catch {
    return true
  }
}

export const useRecordsStore = defineStore('records', {
  state: () => ({
    /** @type {import('@/models').RecordItem[]} 未删除记录，日期倒序 */
    list: [],
    /** 最近一次「可撤销」软删除的 id：编辑页删除后跳回流水页，由流水页展示撤销入口 */
    lastDeletedId: null,
  }),
  getters: {
    count: (s) => s.list.length,
    /** 按月过滤：month 形如 "2026-10"（统计口径统一走 services/stats） */
    ofMonth: (s) => (month) => stats.filterByMonth(s.list, month),
    monthExpense: (s) => (month) => stats.monthExpense(s.list, month),
    monthIncome: (s) => (month) => stats.monthIncome(s.list, month),
  },
  actions: {
    async load() {
      this.list = await recordsRepo.list()
    },
    /** @returns {Promise<{record: object, refreshFailed: boolean}>} */
    async add(data) {
      const record = await recordsRepo.add(data)
      const refreshFailed = await reloadQuietly(this)
      return { record, refreshFailed }
    },
    /** @returns {Promise<{record: object, refreshFailed: boolean}>} */
    async update(rec) {
      const record = await recordsRepo.update(rec)
      const refreshFailed = await reloadQuietly(this)
      return { record, refreshFailed }
    },
    /**
     * 软删除。undoable = true 时标记 lastDeletedId，供流水页展示「点这里撤销」
     * （记一笔页的即时撤销自带 id，不需要标记）。
     * @returns {Promise<{record: object|null, refreshFailed: boolean}>}
     */
    async softDelete(id, { undoable = false } = {}) {
      const record = await recordsRepo.softDelete(id)
      if (undoable && record) this.lastDeletedId = id
      const refreshFailed = await reloadQuietly(this)
      return { record, refreshFailed }
    },
    /** @returns {Promise<{record: object|null, refreshFailed: boolean}>} */
    async restore(id) {
      const record = await recordsRepo.restore(id)
      if (this.lastDeletedId === id) this.lastDeletedId = null
      const refreshFailed = await reloadQuietly(this)
      return { record, refreshFailed }
    },
    /** 撤销提示消失后清除标记（撤销入口已失效） */
    clearLastDeleted() {
      this.lastDeletedId = null
    },
  },
})
