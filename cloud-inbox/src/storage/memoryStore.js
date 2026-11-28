import { randomUUID } from 'node:crypto'

/**
 * 内存存储适配器，供本地开发与离线单元测试使用，接口与 firestoreStore 严格同构。
 * @param {{ idGenerator?: () => string, now?: () => Date }} [opts]
 */
export function createMemoryStore({
  idGenerator = () => randomUUID(),
  now = () => new Date(),
} = {}) {
  const entries = new Map()
  let categoriesMeta = null

  return {
    /**
     * @param {{ id?: string, type: 'expense'|'income', amount: number, categoryName: string, note?: string, occurredAt: string, createdAt?: string }} entry
     */
    async addPending(entry) {
      const id = entry.id || idGenerator()
      const createdAt = entry.createdAt || now().toISOString()
      const record = {
        id,
        type: entry.type,
        amount: entry.amount,
        categoryName: entry.categoryName,
        note: entry.note ?? '',
        occurredAt: entry.occurredAt,
        createdAt,
      }
      entries.set(id, record)
      return { ...record }
    },

    async listPending() {
      return Array.from(entries.values())
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((item) => ({ ...item }))
    },

    /**
     * @param {string[]} ids
     */
    async ackPending(ids) {
      if (!Array.isArray(ids) || ids.length === 0) {
        return { acked: 0, ids: [] }
      }
      const deletedIds = []
      const seen = new Set()
      for (const rawId of ids) {
        if (typeof rawId !== 'string') continue
        const id = rawId.trim()
        if (!id || seen.has(id)) continue
        seen.add(id)
        if (entries.delete(id)) {
          deletedIds.push(id)
        }
      }
      return {
        acked: deletedIds.length,
        ids: deletedIds,
      }
    },

    async getCategories() {
      if (!categoriesMeta) return null
      return {
        expense: [...categoriesMeta.expense],
        income: [...categoriesMeta.income],
        updatedAt: categoriesMeta.updatedAt,
      }
    },

    /**
     * @param {{ expense: string[], income: string[], updatedAt?: string }} payload
     */
    async saveCategories({ expense, income, updatedAt }) {
      const saved = {
        expense: [...expense],
        income: [...income],
        updatedAt: updatedAt || now().toISOString(),
      }
      categoriesMeta = saved
      return {
        expense: [...saved.expense],
        income: [...saved.income],
        updatedAt: saved.updatedAt,
      }
    },
  }
}
