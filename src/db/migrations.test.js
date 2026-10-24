import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { atomicWrite, getAll, getOne, initDB, putOne } from '@/db'
import {
  BUILTIN_IDENTITY_KEY,
  BUILTIN_IDENTITY_VERSION,
  migrateBuiltinIdentity,
} from '@/db/migrations'
import { SEED_MARKER_KEY, SEED_VERSION, seedIfEmpty } from '@/db/seed'
import { resetDatabase, snapshotJSON } from '@/db/testIsolation'
import { BUILTIN_CATEGORIES, getBuiltinById } from '@/services/builtinCategories'

function legacyCategory(canonical, id, overrides = {}) {
  return {
    id,
    name: canonical.name,
    emoji: canonical.emoji,
    color: canonical.color,
    type: canonical.type,
    monthlyBudget: 0,
    order: canonical.order,
    archived: false,
    lastUsedAt: 0,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  }
}

function record(overrides = {}) {
  return {
    id: 'r1',
    amount: 100,
    type: 'expense',
    categoryId: 'old-0',
    note: '备注',
    date: '2026-10-01',
    createdAt: 1,
    updatedAt: 1,
    deleted: false,
    deletedAt: null,
    private: false,
    owner: 'me',
    ...overrides,
  }
}

function injectPutFailureAt(failAt) {
  const proto = IDBObjectStore.prototype
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'put')
  let calls = 0
  Object.defineProperty(proto, 'put', {
    configurable: true,
    writable: true,
    value: function (...args) {
      calls += 1
      if (calls === failAt) throw new DOMException('injected put failure', 'DataError')
      return descriptor.value.apply(this, args)
    },
  })
  return {
    calls: () => calls,
    restore: () => Object.defineProperty(proto, 'put', descriptor),
  }
}

async function writeLegacyDatabase({ categories, records = [], settings = [] }) {
  await resetDatabase()
  await atomicWrite({
    puts: {
      categories,
      records,
      settings,
    },
  })
}

test('首次 initDB：16 个固定内置 ID + seedVersion/builtinIdentityVersion 标记', async () => {
  await resetDatabase()
  await initDB()

  const categories = await getAll('categories')
  assert.equal(categories.length, 16)
  assert.deepEqual(categories.map((c) => c.id).sort(), BUILTIN_CATEGORIES.map((c) => c.id).sort())
  assert.equal((await getOne('settings', SEED_MARKER_KEY))?.value, SEED_VERSION)
  assert.equal((await getOne('settings', BUILTIN_IDENTITY_KEY))?.value, BUILTIN_IDENTITY_VERSION)
})

test('旧库 rekey：分类换固定 ID，账目（含软删/private）改写引用，设置不被重置', async () => {
  const legacyCategories = BUILTIN_CATEGORIES.map((c, index) => legacyCategory(c, `old-${index}`))
  const custom = legacyCategory(getBuiltinById('builtin:expense:food'), 'custom-1', {
    name: '自定义',
    emoji: '🍀',
    color: '#123456',
    order: 999,
  })
  await writeLegacyDatabase({
    categories: [...legacyCategories, custom],
    records: [
      record({ id: 'r1', categoryId: 'old-0', private: true }),
      record({
        id: 'r2',
        categoryId: 'old-0',
        deleted: true,
        deletedAt: 5,
        owner: 'partner',
      }),
      record({ id: 'r3', categoryId: 'custom-1', updatedAt: 7 }),
    ],
    settings: [{ key: 'monthlyBudget', value: 12345, updatedAt: 1 }],
  })

  await initDB()

  const food = getBuiltinById('builtin:expense:food')
  const categories = await getAll('categories')
  const byId = new Map(categories.map((c) => [c.id, c]))
  assert.equal(categories.length, 17)
  assert.equal(byId.has('old-0'), false)
  assert.equal(byId.has(food.id), true)
  assert.equal(byId.get(food.id).name, food.name)
  assert.equal(byId.get(food.id).monthlyBudget, 0)
  assert.equal(byId.has('custom-1'), true)

  const records = await getAll('records')
  const byRecord = new Map(records.map((r) => [r.id, r]))
  assert.equal(byRecord.get('r1').categoryId, food.id)
  assert.equal(byRecord.get('r1').private, true)
  assert.equal(byRecord.get('r1').deleted, false)
  assert.ok(byRecord.get('r1').updatedAt > 1)
  assert.equal(byRecord.get('r2').categoryId, food.id)
  assert.equal(byRecord.get('r2').deleted, true)
  assert.equal(byRecord.get('r2').deletedAt, 5)
  assert.equal(byRecord.get('r2').owner, 'partner')
  assert.equal(byRecord.get('r3').categoryId, 'custom-1')
  assert.equal(byRecord.get('r3').updatedAt, 7)

  assert.equal((await getOne('settings', 'monthlyBudget'))?.value, 12345)
  assert.equal((await getOne('settings', BUILTIN_IDENTITY_KEY))?.value, 1)

  // 幂等：标记存在后再次调用不产生任何变化
  const before = await snapshotJSON()
  const second = await migrateBuiltinIdentity()
  assert.equal(second.skipped, true)
  assert.equal(await snapshotJSON(), before)
})

test('同指纹多候选：不 rekey、标记仍写入、账目不动', async () => {
  const food = getBuiltinById('builtin:expense:food')
  await writeLegacyDatabase({
    categories: [
      legacyCategory(food, 'dup-1'),
      legacyCategory(food, 'dup-2'),
      legacyCategory(getBuiltinById('builtin:expense:transport'), 'transport-1'),
    ],
    records: [record({ id: 'dup-record', categoryId: 'dup-1' })],
    settings: [{ key: 'monthlyBudget', value: 1, updatedAt: 1 }],
  })

  await initDB()

  const categories = await getAll('categories')
  const ids = new Set(categories.map((c) => c.id))
  assert.equal(ids.has(food.id), false)
  assert.equal(ids.has('dup-1'), true)
  assert.equal(ids.has('dup-2'), true)
  // 其它无歧义的默认项仍然迁移
  assert.equal(ids.has('builtin:expense:transport'), true)
  assert.equal(ids.has('transport-1'), false)

  const dupRecord = (await getAll('records')).find((r) => r.id === 'dup-record')
  assert.equal(dupRecord.categoryId, 'dup-1')
  assert.equal((await getOne('settings', BUILTIN_IDENTITY_KEY))?.value, 1)
})

test('改名的旧默认分类保留为自定义；目标固定 ID 已存在时不合并随机副本', async () => {
  const food = getBuiltinById('builtin:expense:food')

  await writeLegacyDatabase({
    categories: [legacyCategory(food, 'renamed-1', { name: '吃饭' })],
    settings: [{ key: 'monthlyBudget', value: 1, updatedAt: 1 }],
  })
  await initDB()
  const renamedIds = new Set((await getAll('categories')).map((c) => c.id))
  assert.equal(renamedIds.has('renamed-1'), true)
  assert.equal(renamedIds.has(food.id), false)

  await writeLegacyDatabase({
    categories: [legacyCategory(food, food.id), legacyCategory(food, 'random-duplicate')],
    records: [record({ id: 'dup', categoryId: 'random-duplicate' })],
    settings: [{ key: 'monthlyBudget', value: 1, updatedAt: 1 }],
  })
  await initDB()
  const ids = new Set((await getAll('categories')).map((c) => c.id))
  assert.equal(ids.has('random-duplicate'), true)
  assert.equal((await getAll('records')).find((r) => r.id === 'dup').categoryId, 'random-duplicate')
})

test('迁移事务失败：分类/账目/标记全部回滚，重试可成功', async () => {
  const legacyCategories = BUILTIN_CATEGORIES.map((c, index) => legacyCategory(c, `old-${index}`))
  await writeLegacyDatabase({
    categories: legacyCategories,
    records: [record({ id: 'r1', categoryId: 'old-0' })],
    settings: [{ key: 'monthlyBudget', value: 99, updatedAt: 1 }],
  })
  const before = await snapshotJSON()

  const injection = injectPutFailureAt(2)
  try {
    await assert.rejects(migrateBuiltinIdentity(), /injected put failure/)
    assert.ok(injection.calls() >= 2, '故障注入必须真的触发')
  } finally {
    injection.restore()
  }

  assert.equal(await snapshotJSON(), before)
  assert.equal(await getOne('settings', BUILTIN_IDENTITY_KEY), undefined)

  const result = await migrateBuiltinIdentity()
  assert.equal(result.skipped, false)
  assert.equal(result.rekeyed.length, 16)
  assert.equal((await getOne('settings', BUILTIN_IDENTITY_KEY))?.value, 1)
  assert.equal(
    (await getAll('records')).find((r) => r.id === 'r1').categoryId,
    getBuiltinById('builtin:expense:food').id,
  )
})

test('删光分类后不复种，预算/ownerName 不被重置', async () => {
  await resetDatabase()
  await initDB()
  await putOne('settings', { key: 'monthlyBudget', value: 5000, updatedAt: 10 })
  await putOne('settings', { key: 'ownerName', value: '我', updatedAt: 10 })
  const categories = await getAll('categories')
  await atomicWrite({ deletes: { categories: categories.map((c) => c.id) } })
  assert.equal((await getAll('categories')).length, 0)

  await initDB()
  await seedIfEmpty()

  assert.equal((await getAll('categories')).length, 0)
  assert.equal((await getOne('settings', 'monthlyBudget'))?.value, 5000)
  assert.equal((await getOne('settings', 'ownerName'))?.value, '我')
})

test('空分类但有设置（旧库删光分类）：不播种分类，只补缺失默认值', async () => {
  await resetDatabase()
  await atomicWrite({
    puts: {
      settings: [{ key: 'monthlyBudget', value: 7000, updatedAt: 1 }],
    },
  })

  await initDB()

  assert.equal((await getAll('categories')).length, 0)
  assert.equal((await getOne('settings', 'monthlyBudget'))?.value, 7000)
  assert.equal((await getOne('settings', 'ownerName'))?.value, '')
  assert.equal((await getOne('settings', SEED_MARKER_KEY))?.value, SEED_VERSION)
  assert.equal((await getOne('settings', BUILTIN_IDENTITY_KEY))?.value, 1)
})

test('旧库缺设置：只补缺失键，已有预算与分类保留', async () => {
  const custom = legacyCategory(getBuiltinById('builtin:expense:food'), 'custom-only', {
    name: '自定义',
    order: 999,
  })
  await writeLegacyDatabase({
    categories: [custom],
    settings: [{ key: 'monthlyBudget', value: 7000, updatedAt: 1 }],
  })

  await initDB()

  const categories = await getAll('categories')
  assert.equal(categories.length, 1)
  assert.equal(categories[0].id, 'custom-only')
  assert.equal((await getOne('settings', 'monthlyBudget'))?.value, 7000)
  assert.equal((await getOne('settings', 'ownerName'))?.value, '')
})
