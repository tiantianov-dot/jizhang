import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createFirestoreStore } from '../src/storage/firestoreStore.js'
import { createMemoryStore } from '../src/storage/memoryStore.js'

function createMockFirestore() {
  const collections = new Map()

  function ensureCollection(name) {
    if (!collections.has(name)) collections.set(name, new Map())
    return collections.get(name)
  }

  function makeDocRef(colName, id) {
    return {
      id,
      colName,
      async set(data) {
        ensureCollection(colName).set(id, structuredClone(data))
      },
      async get() {
        const col = ensureCollection(colName)
        const exists = col.has(id)
        const data = exists ? structuredClone(col.get(id)) : undefined
        return {
          id,
          ref: makeDocRef(colName, id),
          exists,
          data: () => data,
        }
      },
    }
  }

  return {
    collection(colName) {
      return {
        doc(id) {
          return makeDocRef(colName, id)
        },
        orderBy(field, dir = 'asc') {
          return {
            async get() {
              const col = ensureCollection(colName)
              const docs = Array.from(col.entries())
                .map(([id, data]) => ({ id, data: structuredClone(data) }))
                .sort((a, b) => {
                  const cmp = String(a.data[field]).localeCompare(String(b.data[field]))
                  return dir === 'desc' ? -cmp : cmp
                })
                .map((entry) => ({
                  id: entry.id,
                  data: () => entry.data,
                }))
              return { docs }
            },
          }
        },
      }
    },
    async getAll(...refs) {
      const results = []
      for (const ref of refs) {
        results.push(await ref.get())
      }
      return results
    },
    batch() {
      const deletes = []
      return {
        delete(ref) {
          deletes.push(ref)
        },
        async commit() {
          for (const ref of deletes) {
            ensureCollection(ref.colName).delete(ref.id)
          }
        },
      }
    },
  }
}

function runSharedStoreSuite(name, createStore) {
  describe(name, () => {
    it('adds, lists in ascending createdAt order, and returns defensive clones', async () => {
      let tick = 0
      const store = createStore({
        idGenerator: () => `id-${++tick}`,
        now: () => new Date(Date.UTC(2026, 10, 28, 10, tick, 0)),
      })

      const second = await store.addPending({
        id: 'b-later',
        type: 'expense',
        amount: 35.5,
        categoryName: '餐饮',
        note: '晚饭',
        occurredAt: '2026-11-28',
        createdAt: '2026-11-28T12:00:00.000Z',
      })
      const first = await store.addPending({
        id: 'a-earlier',
        type: 'income',
        amount: 500,
        categoryName: '兼职',
        note: '稿费',
        occurredAt: '2026-11-28',
        createdAt: '2026-11-28T08:00:00.000Z',
      })

      second.amount = 9999
      assert.equal(first.id, 'a-earlier')

      const listed = await store.listPending()
      assert.equal(listed.length, 2)
      assert.deepEqual(
        listed.map((item) => item.id),
        ['a-earlier', 'b-later'],
      )
      assert.equal(listed[1].amount, 35.5)
    })

    it('ackPending deletes only specified existing ids and is idempotent', async () => {
      let seq = 0
      const store = createStore({
        idGenerator: () => `entry-${++seq}`,
      })

      const item1 = await store.addPending({
        type: 'expense',
        amount: 12,
        categoryName: '交通',
        note: '地铁',
        occurredAt: '2026-11-28',
      })
      const item2 = await store.addPending({
        type: 'expense',
        amount: 24,
        categoryName: '餐饮',
        note: '午饭',
        occurredAt: '2026-11-28',
      })

      const res1 = await store.ackPending([item1.id, item1.id, 'non-existent-id'])
      assert.deepEqual(res1, { acked: 1, ids: [item1.id] })

      const remaining = await store.listPending()
      assert.deepEqual(
        remaining.map((item) => item.id),
        [item2.id],
      )

      const res2 = await store.ackPending([item1.id, 'non-existent-id'])
      assert.deepEqual(res2, { acked: 0, ids: [] })
      assert.equal((await store.listPending()).length, 1)
    })

    it('stores and retrieves synced categories cleanly', async () => {
      const store = createStore()
      assert.equal(await store.getCategories(), null)

      const saved = await store.saveCategories({
        expense: ['餐饮', '交通', '咖啡'],
        income: ['工资', '奖金'],
        updatedAt: '2026-11-28T09:00:00.000Z',
      })
      saved.expense.push('MUTATED')

      const loaded = await store.getCategories()
      assert.deepEqual(loaded, {
        expense: ['餐饮', '交通', '咖啡'],
        income: ['工资', '奖金'],
        updatedAt: '2026-11-28T09:00:00.000Z',
      })
    })
  })
}

runSharedStoreSuite('memoryStore adapter', (opts) => createMemoryStore(opts))

runSharedStoreSuite('firestoreStore adapter (mock firestore)', (opts) =>
  createFirestoreStore({
    ...opts,
    collectionPrefix: 'test_',
    firestore: createMockFirestore(),
  }),
)
