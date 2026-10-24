import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { atomicWrite, getAll, getOne, initDB } from '@/db'
import { resetDatabase } from '@/db/testIsolation'
import {
  archiveOrRemoveOne,
  bulkCategories,
  migrateAndRemoveOne,
  remove,
} from '@/repositories/categories'
import {
  aggregateCategoryUsage,
  categoryUsage,
  planCategoryMigration,
} from '@/repositories/records'
import { getBuiltinById } from '@/services/builtinCategories'

const FOOD = getBuiltinById('builtin:expense:food')

async function fresh() {
  await resetDatabase()
  await initDB()
}

function category(id, overrides = {}) {
  return {
    id,
    name: id,
    emoji: '🍀',
    color: '#123456',
    type: 'expense',
    monthlyBudget: 0,
    order: 999,
    archived: false,
    lastUsedAt: 0,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function record(id, categoryId, overrides = {}) {
  return {
    id,
    amount: 100,
    type: 'expense',
    categoryId,
    note: '',
    date: '2026-10-24',
    createdAt: 1,
    updatedAt: 1,
    deleted: false,
    deletedAt: null,
    private: false,
    owner: 'me',
    ...overrides,
  }
}

function sumByCategory(records) {
  const sums = new Map()
  for (const r of records) {
    sums.set(r.categoryId, (sums.get(r.categoryId) || 0) + r.amount)
  }
  return sums
}

function injectPutFailureAt(failAt, errorName) {
  const proto = IDBObjectStore.prototype
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'put')
  let calls = 0
  Object.defineProperty(proto, 'put', {
    configurable: true,
    writable: true,
    value: function (...args) {
      calls += 1
      if (calls === failAt) throw new DOMException('injected put failure', errorName)
      return descriptor.value.apply(this, args)
    },
  })
  return {
    calls: () => calls,
    restore: () => Object.defineProperty(proto, 'put', descriptor),
  }
}

test('无引用硬删；有 active 或仅软删引用都归档', async () => {
  await fresh()
  await atomicWrite({
    puts: {
      categories: [category('c-empty'), category('c-active'), category('c-deleted')],
      records: [
        record('r-active', 'c-active'),
        record('r-deleted', 'c-deleted', { deleted: true, deletedAt: 5 }),
      ],
    },
  })

  assert.equal(await archiveOrRemoveOne('c-empty'), 'deleted')
  assert.equal(await getOne('categories', 'c-empty'), undefined)

  assert.equal(await archiveOrRemoveOne('c-active'), 'archived')
  assert.equal((await getOne('categories', 'c-active')).archived, true)

  assert.equal(await archiveOrRemoveOne('c-deleted'), 'archived')
  assert.equal((await getOne('categories', 'c-deleted')).archived, true)
})

test('默认分类：remove/archive/migrate 直接调用都硬拒绝；bulk 返回 protected', async () => {
  await fresh()
  await assert.rejects(remove(FOOD.id), /内置分类受保护/)
  await assert.rejects(archiveOrRemoveOne(FOOD.id), /内置分类受保护/)
  await assert.rejects(migrateAndRemoveOne(FOOD.id, FOOD.id), /内置分类受保护/)

  const out = await bulkCategories({ ids: [FOOD.id], mode: 'archive-remove' })
  assert.deepEqual(
    out.results.map((r) => r.status),
    ['protected'],
  )
  assert.equal((await getOne('categories', FOOD.id)).archived, false)
})

test('迁移 active + 软删 + private：全部改挂目标、源删除、目标 lastUsedAt 不刷新', async () => {
  await fresh()
  await atomicWrite({
    puts: {
      categories: [
        category('src', { lastUsedAt: 11, updatedAt: 11 }),
        category('dst', { lastUsedAt: 123, updatedAt: 22 }),
      ],
      records: [
        record('r1', 'src', { amount: 100, updatedAt: 1 }),
        record('r2', 'src', { amount: 200, deleted: true, deletedAt: 5, private: true }),
        record('r3', 'dst', { amount: 50 }),
      ],
    },
  })
  const beforeSums = sumByCategory(await getAll('records'))

  assert.equal(await migrateAndRemoveOne('src', 'dst'), 'migrated-deleted')
  assert.equal(await getOne('categories', 'src'), undefined)
  const target = await getOne('categories', 'dst')
  assert.equal(target.lastUsedAt, 123)
  assert.equal(target.updatedAt, 22)

  const records = await getAll('records')
  assert.equal(records.find((r) => r.id === 'r1').categoryId, 'dst')
  assert.equal(records.find((r) => r.id === 'r1').updatedAt > 1, true)
  assert.equal(records.find((r) => r.id === 'r2').categoryId, 'dst')
  assert.equal(records.find((r) => r.id === 'r2').deleted, true)
  assert.equal(records.find((r) => r.id === 'r2').deletedAt, 5)
  assert.equal(records.find((r) => r.id === 'r2').private, true)
  assert.equal(records.find((r) => r.id === 'r3').categoryId, 'dst')

  const afterSums = sumByCategory(records)
  assert.equal(afterSums.get('src'), undefined)
  assert.equal(afterSums.get('dst'), beforeSums.get('dst') + beforeSums.get('src'))
})

test('迁移目标校验：已归档/跨类型/自身/不存在/源内置都拒绝且零写入', async () => {
  await fresh()
  await atomicWrite({
    puts: {
      categories: [
        category('src'),
        category('archived-target', { archived: true }),
        category('income-target', { type: 'income' }),
      ],
    },
  })

  await assert.rejects(migrateAndRemoveOne('src', 'archived-target'), /已归档/)
  await assert.rejects(migrateAndRemoveOne('src', 'income-target'), /收支类型不一致/)
  await assert.rejects(migrateAndRemoveOne('src', 'src'), /源分类本身/)
  await assert.rejects(migrateAndRemoveOne('src', 'missing'), /迁移目标不存在/)
  await assert.rejects(migrateAndRemoveOne('missing', 'src'), /源分类不存在/)
  await assert.rejects(migrateAndRemoveOne(FOOD.id, 'src'), /内置分类受保护/)
  assert.ok(await getOne('categories', 'src'))
})

test('批量 archive-remove：第二项 put 失败时第一项保留、结果逐项可见', async () => {
  await fresh()
  await atomicWrite({
    puts: {
      categories: [category('bulk-a'), category('bulk-b')],
      records: [record('ra', 'bulk-a'), record('rb', 'bulk-b')],
    },
  })

  const injection = injectPutFailureAt(2, 'AbortError')
  let out
  try {
    out = await bulkCategories({ ids: ['bulk-a', 'bulk-b'], mode: 'archive-remove' })
    assert.ok(injection.calls() >= 2)
  } finally {
    injection.restore()
  }

  assert.deepEqual(
    out.results.map((r) => ({ id: r.id, status: r.status })),
    [
      { id: 'bulk-a', status: 'archived' },
      { id: 'bulk-b', status: 'failed' },
    ],
  )
  assert.equal((await getOne('categories', 'bulk-a')).archived, true)
  assert.equal((await getOne('categories', 'bulk-b')).archived, false)
  assert.match(out.results[1].error, /injected put failure/)
})

test('批量 migrate：金额按分类分组守恒，软删记录也迁移', async () => {
  await fresh()
  await atomicWrite({
    puts: {
      categories: [category('s1'), category('s2'), category('target')],
      records: [
        record('a', 's1', { amount: 100 }),
        record('b', 's1', { amount: 200, deleted: true, deletedAt: 3 }),
        record('c', 's2', { amount: 300 }),
        record('d', 'target', { amount: 50 }),
      ],
    },
  })
  const before = sumByCategory(await getAll('records'))

  const out = await bulkCategories({
    ids: ['s1', 's2'],
    mode: 'migrate-remove',
    targetId: 'target',
  })
  assert.deepEqual(
    out.results.map((r) => ({ id: r.id, status: r.status })),
    [
      { id: 's1', status: 'migrated-deleted' },
      { id: 's2', status: 'migrated-deleted' },
    ],
  )
  assert.equal(await getOne('categories', 's1'), undefined)
  assert.equal(await getOne('categories', 's2'), undefined)

  const afterRecords = await getAll('records')
  const after = sumByCategory(afterRecords)
  assert.equal(after.get('s1'), undefined)
  assert.equal(after.get('s2'), undefined)
  assert.equal(after.get('target'), before.get('target') + before.get('s1') + before.get('s2'))
  assert.equal(afterRecords.find((r) => r.id === 'b').deleted, true)
})

test('批量边界：空选择直接返回；目标在源集合内整批拒绝；默认项 protected', async () => {
  await fresh()
  assert.deepEqual(await bulkCategories({ ids: [], mode: 'archive-remove' }), { results: [] })

  await assert.rejects(
    bulkCategories({ ids: ['x', 'y'], mode: 'migrate-remove', targetId: 'y' }),
    /目标不能在被选分类中/,
  )

  await atomicWrite({ puts: { categories: [category('x')] } })
  const out = await bulkCategories({ ids: [FOOD.id, 'x'], mode: 'archive-remove' })
  assert.deepEqual(
    out.results.map((r) => r.status),
    ['protected', 'deleted'],
  )
})

test('categoryUsage 一次聚合 active/deleted/total；planCategoryMigration 含软删且不改入参', async () => {
  await fresh()
  await atomicWrite({
    puts: {
      records: [
        record('a', 'c1'),
        record('b', 'c1', { deleted: true, deletedAt: 2 }),
        record('c', 'c2', { amount: 300 }),
      ],
    },
  })
  const usage = await categoryUsage()
  assert.deepEqual(usage.get('c1'), { active: 1, deleted: 1, total: 2 })
  assert.deepEqual(usage.get('c2'), { active: 1, deleted: 0, total: 1 })

  const records = await getAll('records')
  const snapshot = JSON.stringify(records)
  const writes = planCategoryMigration(records, 'c1', 'c2', 999)
  assert.equal(JSON.stringify(records), snapshot)
  assert.equal(writes.length, 2)
  assert.ok(writes.every((r) => r.categoryId === 'c2' && r.updatedAt === 999))
  assert.equal(aggregateCategoryUsage(records).get('c1').total, 2)
})
