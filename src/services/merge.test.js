import test from 'node:test'
import assert from 'node:assert/strict'
import { isNewer, mergeCategories, mergeRecords } from './merge.js'

const rec = (id, updatedAt, extra = {}) => ({
  id,
  updatedAt,
  amount: 100,
  type: 'expense',
  categoryId: 'c1',
  note: '',
  date: '2026-10-19',
  createdAt: 1,
  deleted: false,
  private: false,
  owner: 'me',
  ...extra,
})

test('isNewer：严格大于才更新，缺失 updatedAt 视为 0', () => {
  assert.equal(isNewer({ updatedAt: 2 }, { updatedAt: 1 }), true)
  assert.equal(isNewer({ updatedAt: 1 }, { updatedAt: 1 }), false)
  assert.equal(isNewer({ updatedAt: 1 }, {}), true)
  assert.equal(isNewer({}, {}), false)
})

test('mergeRecords：新增 / 更新 / 同值跳过 / 无效行拒绝', () => {
  const local = [rec('a', 10), rec('b', 20)]
  const remote = [
    rec('a', 11),
    rec('b', 20),
    rec('c', 30),
    { id: 'd' },
    { amount: 1 },
    null,
  ]

  const out = mergeRecords(local, remote)
  assert.deepEqual(
    { added: out.added, updated: out.updated, skipped: out.skipped, rejected: out.rejected },
    { added: 2, updated: 1, skipped: 1, rejected: 2 },
  )
  assert.deepEqual(
    out.puts.map((r) => r.id),
    ['a', 'c', 'd'],
  )
})

test('mergeRecords：注入业务校验后无效行不进 puts', () => {
  const out = mergeRecords([], [rec('ok', 1), rec('bad', 2, { amount: -1 })], {
    isValid: (r) => Number.isInteger(r.amount) && r.amount >= 0,
  })
  assert.equal(out.added, 1)
  assert.equal(out.rejected, 1)
  assert.deepEqual(
    out.puts.map((r) => r.id),
    ['ok'],
  )
})

test('mergeRecords：重复 id 只应用一次', () => {
  const out = mergeRecords([], [rec('x', 1), rec('x', 2)])
  assert.equal(out.added, 1)
  assert.equal(out.rejected, 1)
})

test('mergeCategories：同规则，远端新者覆盖', () => {
  const local = [{ id: 'c', updatedAt: 5, name: '餐饮' }]
  const out = mergeCategories(local, [{ id: 'c', updatedAt: 6, name: '吃饭' }])
  assert.equal(out.updated, 1)
  assert.equal(out.puts[0].name, '吃饭')
})

test('不修改入参（纯函数）', () => {
  const local = [rec('a', 1)]
  const remote = [rec('a', 2, { note: 'new' })]
  const snapshot = JSON.stringify([local, remote])
  mergeRecords(local, remote)
  assert.equal(JSON.stringify([local, remote]), snapshot)
})
