import { defineStore } from 'pinia'
import * as recordsRepo from '@/repositories/records'
import * as stats from '@/services/stats'

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
    async add(data) {
      const rec = await recordsRepo.add(data)
      await this.load()
      return rec
    },
    async update(rec) {
      await recordsRepo.update(rec)
      await this.load()
    },
    /**
     * 软删除。undoable = true 时标记 lastDeletedId，供流水页展示「点这里撤销」
     * （记一笔页的即时撤销自带 id，不需要标记）。
     */
    async softDelete(id, { undoable = false } = {}) {
      await recordsRepo.softDelete(id)
      if (undoable) this.lastDeletedId = id
      await this.load()
    },
    async restore(id) {
      await recordsRepo.restore(id)
      if (this.lastDeletedId === id) this.lastDeletedId = null
      await this.load()
    },
    /** 撤销提示消失后清除标记（撤销入口已失效） */
    clearLastDeleted() {
      this.lastDeletedId = null
    },
  },
})
