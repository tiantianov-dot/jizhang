import { defineStore } from 'pinia'
import * as categoriesRepo from '@/repositories/categories'

export const useCategoriesStore = defineStore('categories', {
  state: () => ({
    /** @type {import('@/models').Category[]} 全部分类（含已归档），最近使用排前 */
    list: [],
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
    async save(cat) {
      await categoriesRepo.save(cat)
      await this.load()
    },
    async remove(id) {
      const result = await categoriesRepo.remove(id)
      await this.load()
      return result
    },
  },
})
