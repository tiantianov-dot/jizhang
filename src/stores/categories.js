import { defineStore } from 'pinia'
import * as categoriesRepo from '@/repositories/categories'
import * as recordsRepo from '@/repositories/records'
import { useRecordsStore } from './records'

export const useCategoriesStore = defineStore('categories', {
  state: () => ({
    /** @type {import('@/models').Category[]} 全部分类（含已归档），最近使用排前 */
    list: [],
    /** @type {Record<string, {active:number, deleted:number, total:number}>} 分类引用数（含软删） */
    usage: {},
    bulkBusy: false,
  }),
  getters: {
    /** 未归档支出分类：最近使用优先（核心体验：分类选择压到一次点击） */
    expense: (s) => s.list.filter((c) => c.type === 'expense' && !c.archived),
    income: (s) => s.list.filter((c) => c.type === 'income' && !c.archived),
    /** 已归档分类（分类管理页的「已归档」段用） */
    archived: (s) => s.list.filter((c) => c.archived),
    /** 按 id 查分类：含已归档 —— 历史流水必须仍能显示原分类名 */
    byId: (s) => (id) => s.list.find((c) => c.id === id),
  },
  actions: {
    async load() {
      // 载入全量（含归档）：记账页靠 getter 过滤，历史流水靠 byId 查得到原名
      this.list = await categoriesRepo.listAll()
    },
    /** 一次全量聚合，供分类管理页显示「有效/回收站」 */
    async loadUsage() {
      try {
        this.usage = Object.fromEntries(await recordsRepo.categoryUsage())
      } catch {
        // 保留旧值；列表本身已可用
      }
    },
    async save(cat) {
      await categoriesRepo.save(cat)
      await this.load()
    },
    async remove(id) {
      const result = await categoriesRepo.remove(id)
      await this.load()
      return result
    },
    /**
     * 批量操作：防重入；无论全部/部分成功都同时刷新分类、账目与引用数。
     * @returns {Promise<{results: object[]}|null>} busy 时返回 null
     */
    async bulkApply({ ids, mode, targetId }) {
      if (this.bulkBusy) return null
      this.bulkBusy = true
      try {
        return await categoriesRepo.bulkCategories({ ids, mode, targetId })
      } finally {
        const records = useRecordsStore()
        await Promise.allSettled([this.load(), records.load(), this.loadUsage()])
        this.bulkBusy = false
      }
    },
  },
})
