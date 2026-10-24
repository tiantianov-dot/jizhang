import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { getAll, getOne, initDB, putOne } from '@/db'
import { resetDatabase, snapshotJSON } from '@/db/testIsolation'
import { exportAll, importMerge, previewImport } from '@/repositories/backup'
import { remove, save } from '@/repositories/categories'
import { ImportValidationError } from '@/services/importPlanner'
import { BUILTIN_CATEGORIES, getBuiltinById } from '@/services/builtinCategories'

const FOOD = getBuiltinById('builtin:expense:food')
const INCOME_OTHER = getBuiltinById('builtin:income:other')
const FAR_FUTURE = () => Date.now() + 1_000_000

async function fresh() {
  await resetDatabase()
  await initDB()
}

function record(overrides = {}) {
  return {
    id: 'r1',
    amount: 100,
    type: 'expense',
    categoryId: FOOD.id,
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
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  }
}

function payload(overrides = {}) {
  return {
    app: 'jizhang',
    version: 2,
    exportedAt: '2026-10-24T00:00:00.000Z',
    records: [],
    categories: [],
    settings: [],
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

test('导出为 v2：含软删/private，settings 白名单排除本机标记', async () => {
  await fresh()
  await putOne('records', record({ id: 'active', updatedAt: 1 }))
  await putOne('records', record({ id: 'deleted', deleted: true, deletedAt: 5, updatedAt: 5 }))
  await putOne('records', record({ id: 'private', private: true, updatedAt: 2 }))
  await putOne('settings', { key: 'lastBackupAt', value: '2026-10-24', updatedAt: 1 })
  await putOne('settings', { key: 'monthlyBudget', value: 500, updatedAt: 1 })

  const data = await exportAll()
  assert.equal(data.app, 'jizhang')
  assert.equal(data.version, 2)
  assert.deepEqual(data.records.map((r) => r.id).sort(), ['active', 'deleted', 'private'])
  assert.equal(data.categories.length, 16)
  assert.deepEqual(data.settings.map((s) => s.key).sort(), ['monthlyBudget', 'ownerName'])

  const syncData = await exportAll({ purpose: 'sync' })
  assert.deepEqual(syncData.records.map((r) => r.id).sort(), ['active', 'deleted'])
})

test('previewImport 只读：summary 正确且三 store 快照不变', async () => {
  await fresh()
  const before = await snapshotJSON()
  const data = payload({
    categories: [legacyCategory(FOOD, 'new-cat', { order: 999 })],
    records: [record({ id: 'new-rec', categoryId: 'new-cat' })],
    settings: [{ key: 'monthlyBudget', value: 900, updatedAt: FAR_FUTURE() }],
  })
  const preview = await previewImport(data)
  assert.deepEqual(preview.errors, [])
  assert.equal(preview.summary.categories.added, 1)
  assert.equal(preview.summary.records.added, 1)
  assert.equal(preview.summary.settings.updated, 1)
  assert.equal(await snapshotJSON(), before)
})

test('核心回归：本地固定 ID + v1 另一套随机默认 ID → 匹配不新增、账目引用被改写', async () => {
  await fresh()
  const legacyCategories = BUILTIN_CATEGORIES.map((c, index) => legacyCategory(c, `old-${index}`))
  const data = payload({
    version: 1,
    categories: legacyCategories,
    records: [
      record({ id: 'r-food', categoryId: 'old-0', type: 'expense' }),
      record({ id: 'r-other', categoryId: 'old-15', type: 'income' }),
    ],
  })

  const summary = await importMerge(data)
  assert.equal(summary.categories.matched, 16)
  assert.equal(summary.categories.added, 0)
  assert.equal(summary.records.added, 2)

  const categories = await getAll('categories')
  assert.equal(categories.length, 16)
  const records = await getAll('records')
  assert.equal(records.find((r) => r.id === 'r-food').categoryId, FOOD.id)
  assert.equal(records.find((r) => r.id === 'r-other').categoryId, INCOME_OTHER.id)
})

test('同一文件重复导入：第二次零新增/零更新，数据库内容不变', async () => {
  await fresh()
  const data = payload({
    categories: [legacyCategory(FOOD, 'extra', { order: 999 })],
    records: [record({ id: 'extra-rec', categoryId: 'extra' })],
    settings: [{ key: 'monthlyBudget', value: 900, updatedAt: FAR_FUTURE() }],
  })

  const first = await importMerge(data)
  assert.equal(first.categories.added, 1)
  assert.equal(first.records.added, 1)
  assert.equal(first.settings.updated, 1)
  const afterFirst = await snapshotJSON()

  const second = await importMerge(data)
  assert.equal(second.categories.added, 0)
  assert.equal(second.categories.updated, 0)
  assert.equal(second.records.added, 0)
  assert.equal(second.records.updated, 0)
  assert.equal(second.settings.updated, 0)
  assert.equal(await snapshotJSON(), afterFirst)
})

test('v1 字段补全：缺省的可选字段按默认值落库', async () => {
  await fresh()
  const summary = await importMerge(
    payload({
      version: 1,
      categories: [{ id: 'c1', name: '自定义', type: 'expense' }],
      records: [
        {
          id: 'r1',
          amount: 300,
          type: 'expense',
          categoryId: 'c1',
          date: '2026-10-01',
        },
      ],
    }),
  )
  assert.equal(summary.records.added, 1)
  const rec = (await getAll('records')).find((r) => r.id === 'r1')
  assert.equal(rec.note, '')
  assert.equal(rec.private, false)
  assert.equal(rec.owner, 'me')
  assert.equal(rec.deleted, false)
  assert.equal(rec.deletedAt, null)
  const cat = (await getAll('categories')).find((c) => c.id === 'c1')
  assert.equal(cat.monthlyBudget, 0)
  assert.equal(cat.order, 999)
  assert.equal(cat.archived, false)
  assert.equal(cat.lastUsedAt, 0)
})

test('未来版本 / 悬空引用 / 跨类型引用：整份拒绝且快照不变', async () => {
  await fresh()
  const before = await snapshotJSON()

  await assert.rejects(
    importMerge(payload({ version: 3, records: [record()] })),
    (err) => err instanceof ImportValidationError,
  )
  const dangling = await previewImport(payload({ records: [record({ categoryId: 'missing' })] }))
  assert.ok(dangling.errors.some((item) => item.code === 'DANGLING_CATEGORY'))
  await assert.rejects(
    importMerge(payload({ records: [record({ categoryId: 'missing' })] })),
    (err) => err instanceof ImportValidationError,
  )
  await assert.rejects(
    importMerge(
      payload({
        categories: [legacyCategory(FOOD, 'c1')],
        records: [record({ categoryId: 'c1', type: 'income' })],
      }),
    ),
    (err) => err instanceof ImportValidationError,
  )

  assert.equal(await snapshotJSON(), before)
})

test('第 2 次 put 失败：三 store 全部回滚；无故障时同一文件可成功', async () => {
  await fresh()
  const before = await snapshotJSON()
  const data = payload({
    categories: [legacyCategory(FOOD, 'fault-cat', { order: 999 })],
    records: [record({ id: 'fault-rec', categoryId: 'fault-cat' })],
    settings: [{ key: 'monthlyBudget', value: 1234, updatedAt: FAR_FUTURE() }],
  })

  const injection = injectPutFailureAt(2)
  try {
    await assert.rejects(importMerge(data), /injected put failure/)
    assert.ok(injection.calls() >= 2, '故障注入必须真的执行到第 2 次 put')
  } finally {
    injection.restore()
  }

  assert.equal(await snapshotJSON(), before)
  assert.equal(await getOne('categories', 'fault-cat'), undefined)
  assert.equal(await getOne('records', 'fault-rec'), undefined)

  const summary = await importMerge(data)
  assert.equal(summary.records.added, 1)
  assert.equal((await getAll('records')).find((r) => r.id === 'fault-rec').categoryId, 'fault-cat')
  assert.equal((await getOne('settings', 'monthlyBudget')).value, 1234)
})

test('settings 严格 LWW；lastBackupAt/迁移标记即使更新更晚也不导入', async () => {
  await fresh()
  await putOne('settings', { key: 'monthlyBudget', value: 5000, updatedAt: 2000 })
  await putOne('settings', { key: 'lastBackupAt', value: 'local-keep', updatedAt: 1 })
  const beforeMarkers = await snapshotJSON()

  const older = await importMerge(
    payload({
      settings: [
        { key: 'monthlyBudget', value: 100, updatedAt: 1000 },
        { key: 'lastBackupAt', value: 'evil', updatedAt: FAR_FUTURE() },
        { key: 'builtinIdentityVersion', value: 99, updatedAt: FAR_FUTURE() },
        { key: 'seedVersion', value: 99, updatedAt: FAR_FUTURE() },
      ],
    }),
  )
  assert.equal(older.settings.updated, 0)
  assert.equal((await getOne('settings', 'monthlyBudget')).value, 5000)
  assert.equal((await getOne('settings', 'lastBackupAt')).value, 'local-keep')
  assert.equal((await getOne('settings', 'builtinIdentityVersion')).value, 1)
  assert.equal((await getOne('settings', 'seedVersion')).value, 1)

  const newer = await importMerge(
    payload({
      settings: [{ key: 'monthlyBudget', value: 7000, updatedAt: 3000 }],
    }),
  )
  assert.equal(newer.settings.updated, 1)
  assert.equal((await getOne('settings', 'monthlyBudget')).value, 7000)
  assert.notEqual(await snapshotJSON(), beforeMarkers)
})

test('v2 改名默认分类仍按固定 ID 更新（身份不靠名称）', async () => {
  await fresh()
  const summary = await importMerge(
    payload({
      categories: [
        {
          ...legacyCategory(FOOD, FOOD.id),
          name: '吃喝',
          emoji: '🍜',
          updatedAt: FAR_FUTURE(),
        },
      ],
    }),
  )
  assert.equal(summary.categories.updated, 1)
  const stored = await getOne('categories', FOOD.id)
  assert.equal(stored.name, '吃喝')
  assert.equal(stored.type, 'expense')
  assert.equal(stored.id, FOOD.id)
})

test('默认分类删除在 repository 硬拒绝；保存时类型锁定为 canonical', async () => {
  await fresh()
  await putOne('records', record({ id: 'ref', categoryId: FOOD.id }))

  await assert.rejects(remove(FOOD.id), /内置分类受保护/)
  assert.equal((await getOne('categories', FOOD.id)).archived, false)

  const renamed = { ...(await getOne('categories', FOOD.id)), name: '改名', type: 'income' }
  await save(renamed)
  const stored = await getOne('categories', FOOD.id)
  assert.equal(stored.name, '改名')
  assert.equal(stored.type, 'expense')

  await assert.rejects(remove('missing-category'), /分类不存在/)
})

test('导出→清库→导入完整恢复：固定 ID、软删/private、设置 LWW 均保留', async () => {
  await fresh()
  await putOne('records', record({ id: 'keep', updatedAt: 1 }))
  await putOne('records', record({ id: 'tomb', deleted: true, deletedAt: 5, updatedAt: 5 }))
  await putOne('records', record({ id: 'secret', private: true, updatedAt: 2 }))
  await putOne('settings', { key: 'monthlyBudget', value: 8800, updatedAt: FAR_FUTURE() })
  const exported = await exportAll()

  await fresh()
  const summary = await importMerge(exported)
  assert.equal(summary.records.added, 3)
  const records = await getAll('records')
  assert.equal(records.find((r) => r.id === 'tomb').deleted, true)
  assert.equal(records.find((r) => r.id === 'tomb').deletedAt, 5)
  assert.equal(records.find((r) => r.id === 'secret').private, true)
  assert.equal((await getAll('categories')).length, 16)
  assert.equal((await getOne('settings', 'monthlyBudget')).value, 8800)
})
