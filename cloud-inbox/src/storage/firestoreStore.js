import { randomUUID } from 'node:crypto'

const FIRESTORE_BATCH_LIMIT = 500

async function loadDefaultFirestore() {
  const mod = await import('@google-cloud/firestore')
  const Firestore = mod.Firestore || mod.default?.Firestore || mod.default
  if (typeof Firestore !== 'function') {
    throw new Error('Unable to load Firestore constructor from @google-cloud/firestore')
  }
  return new Firestore()
}

/**
 * Firestore Native Mode 存储适配器，按需懒加载 @google-cloud/firestore。
 * @param {{ firestore?: object, collectionPrefix?: string, idGenerator?: () => string, now?: () => Date }} [opts]
 */
export function createFirestoreStore({
  firestore = null,
  collectionPrefix = '',
  idGenerator = () => randomUUID(),
  now = () => new Date(),
} = {}) {
  const prefix = typeof collectionPrefix === 'string' ? collectionPrefix.trim() : ''
  const pendingCollectionName = `${prefix}pending_entries`
  const metaCollectionName = `${prefix}inbox_meta`
  const categoriesDocId = 'categories'

  let dbPromise = firestore ? Promise.resolve(firestore) : null

  async function getDb() {
    if (!dbPromise) {
      dbPromise = loadDefaultFirestore()
    }
    return dbPromise
  }

  return {
    /**
     * @param {{ id?: string, type: 'expense'|'income', amount: number, categoryName: string, note?: string, occurredAt: string, createdAt?: string }} entry
     */
    async addPending(entry) {
      const db = await getDb()
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
      await db.collection(pendingCollectionName).doc(id).set(record)
      return { ...record }
    },

    async listPending() {
      const db = await getDb()
      const snap = await db.collection(pendingCollectionName).orderBy('createdAt', 'asc').get()
      return snap.docs.map((doc) => {
        const data = doc.data()
        return {
          id: data.id || doc.id,
          type: data.type,
          amount: data.amount,
          categoryName: data.categoryName,
          note: data.note ?? '',
          occurredAt: data.occurredAt,
          createdAt: data.createdAt,
        }
      })
    },

    /**
     * @param {string[]} ids
     */
    async ackPending(ids) {
      if (!Array.isArray(ids) || ids.length === 0) {
        return { acked: 0, ids: [] }
      }

      const uniqueIds = []
      const seen = new Set()
      for (const rawId of ids) {
        if (typeof rawId !== 'string') continue
        const id = rawId.trim()
        if (!id || seen.has(id)) continue
        seen.add(id)
        uniqueIds.push(id)
      }
      if (uniqueIds.length === 0) {
        return { acked: 0, ids: [] }
      }

      const db = await getDb()
      const collection = db.collection(pendingCollectionName)
      const deletedIds = []

      for (let i = 0; i < uniqueIds.length; i += FIRESTORE_BATCH_LIMIT) {
        const chunkIds = uniqueIds.slice(i, i + FIRESTORE_BATCH_LIMIT)
        const refs = chunkIds.map((id) => collection.doc(id))
        const snapshots = await db.getAll(...refs)
        const existingRefs = []
        for (const snap of snapshots) {
          if (snap.exists) {
            existingRefs.push(snap.ref)
            deletedIds.push(snap.id)
          }
        }
        if (existingRefs.length > 0) {
          const batch = db.batch()
          for (const ref of existingRefs) {
            batch.delete(ref)
          }
          await batch.commit()
        }
      }

      return {
        acked: deletedIds.length,
        ids: deletedIds,
      }
    },

    async getCategories() {
      const db = await getDb()
      const snap = await db.collection(metaCollectionName).doc(categoriesDocId).get()
      if (!snap.exists) return null
      const data = snap.data()
      return {
        expense: Array.isArray(data?.expense) ? [...data.expense] : [],
        income: Array.isArray(data?.income) ? [...data.income] : [],
        updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : '',
      }
    },

    /**
     * @param {{ expense: string[], income: string[], updatedAt?: string }} payload
     */
    async saveCategories({ expense, income, updatedAt }) {
      const db = await getDb()
      const saved = {
        expense: [...expense],
        income: [...income],
        updatedAt: updatedAt || now().toISOString(),
      }
      await db.collection(metaCollectionName).doc(categoriesDocId).set(saved)
      return {
        expense: [...saved.expense],
        income: [...saved.income],
        updatedAt: saved.updatedAt,
      }
    },
  }
}
