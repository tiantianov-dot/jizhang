import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { getOne, initDB } from '@/db'
import { resetDatabase, snapshotJSON } from '@/db/testIsolation'
import * as recordsRepo from '@/repositories/records'
import { classifyWriteError } from '@/services/writeOutcome'
import { getBuiltinById } from '@/services/builtinCategories'
import { useRecordsStore } from '@/stores/records'

const FOOD = getBuiltinById('builtin:expense:food')

async function fresh() {
  await resetDatabase()
  await initDB()
}

function input(overrides = {}) {
  return {
    amount: 100,
    type: 'expense',
    categoryId: FOOD.id,
    note: '测试备注',
    date: '2026-10-24',
    private: false,
    ...overrides,
  }
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

test('add：记录与分类 lastUsedAt 在同一事务提交，且不改分类 updatedAt', async () => {
  await fresh()
  const before = await getOne('categories', FOOD.id)
  const rec = await recordsRepo.add(input())

  assert.ok(rec.id)
  assert.equal((await getOne('records', rec.id)).amount, 100)
  const after = await getOne('categories', FOOD.id)
  assert.ok(after.lastUsedAt > 0)
  assert.equal(after.updatedAt, before.updatedAt)
})

test('add：第 2 次 put（分类）失败时记录也不落盘（原子回滚）', async () => {
  await fresh()
  const before = await snapshotJSON()
  const injection = injectPutFailureAt(2, 'AbortError')
  try {
    await assert.rejects(recordsRepo.add(input()), (err) => classifyWriteError(err) === 'failed')
    assert.ok(injection.calls() >= 2)
  } finally {
    injection.restore()
  }
  assert.equal(await snapshotJSON(), before)
})

test('add：明确 AbortError 归 failed；UnknownError 归 unknown；两者都不留半成品', async () => {
  await fresh()

  const beforeAbort = await snapshotJSON()
  const abort = injectPutFailureAt(1, 'AbortError')
  try {
    await assert.rejects(recordsRepo.add(input()), (err) => classifyWriteError(err) === 'failed')
  } finally {
    abort.restore()
  }
  assert.equal(await snapshotJSON(), beforeAbort)

  const beforeUnknown = await snapshotJSON()
  const unknown = injectPutFailureAt(1, 'UnknownError')
  try {
    await assert.rejects(recordsRepo.add(input()), (err) => classifyWriteError(err) === 'unknown')
  } finally {
    unknown.restore()
  }
  assert.equal(await snapshotJSON(), beforeUnknown)
})

test('update：写入失败快照不变，成功才刷新 updatedAt', async () => {
  await fresh()
  const rec = await recordsRepo.add(input())
  const before = await snapshotJSON()

  const injection = injectPutFailureAt(1, 'AbortError')
  try {
    await assert.rejects(
      recordsRepo.update({ ...rec, amount: 200 }),
      (err) => classifyWriteError(err) === 'failed',
    )
  } finally {
    injection.restore()
  }
  assert.equal(await snapshotJSON(), before)

  const updated = await recordsRepo.update({ ...rec, amount: 200 })
  assert.equal(updated.amount, 200)
  assert.ok(updated.updatedAt >= rec.updatedAt)
  assert.equal((await getOne('records', rec.id)).amount, 200)
})

test('store.add：写库成功后 reload 失败返回已保存实体 + refreshFailed', async () => {
  await fresh()
  setActivePinia(createPinia())
  const store = useRecordsStore()
  store.load = async () => {
    throw new Error('reload failed')
  }

  const result = await store.add(input())
  assert.equal(result.refreshFailed, true)
  assert.ok(result.record.id)
  assert.equal((await getOne('records', result.record.id)).amount, 100)
})

test('store.softDelete：reload 失败仍标记 lastDeletedId 并返回 refreshFailed', async () => {
  await fresh()
  const rec = await recordsRepo.add(input())
  setActivePinia(createPinia())
  const store = useRecordsStore()
  store.load = async () => {
    throw new Error('reload failed')
  }

  const result = await store.softDelete(rec.id, { undoable: true })
  assert.equal(result.refreshFailed, true)
  assert.equal(store.lastDeletedId, rec.id)
  assert.equal((await getOne('records', rec.id)).deleted, true)
})

test('store.add：reload 正常时 refreshFailed=false', async () => {
  await fresh()
  setActivePinia(createPinia())
  const store = useRecordsStore()

  const result = await store.add(input())
  assert.equal(result.refreshFailed, false)
  assert.equal(store.list.length, 1)
})
