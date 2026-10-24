import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeBackup } from './backupSummary.js'

test('active/deleted/private/total 与数组逐项一致', () => {
  const records = [
    { id: 'a', deleted: false, private: false },
    { id: 'b', deleted: true, private: false },
    { id: 'c', deleted: false, private: true },
    { id: 'd', deleted: true, private: true },
    { id: 'e' },
  ]
  const summary = summarizeBackup(records)
  assert.deepEqual(summary, {
    active: records.filter((r) => r.deleted !== true).length,
    deleted: records.filter((r) => r.deleted === true).length,
    private: records.filter((r) => r.private === true).length,
    total: records.length,
  })
  assert.deepEqual(summary, { active: 3, deleted: 2, private: 2, total: 5 })
  assert.equal(summary.active + summary.deleted, summary.total)
})

test('空数组 / 非数组输入返回全零，不抛错', () => {
  assert.deepEqual(summarizeBackup([]), { active: 0, deleted: 0, private: 0, total: 0 })
  assert.deepEqual(summarizeBackup(null), { active: 0, deleted: 0, private: 0, total: 0 })
  assert.deepEqual(summarizeBackup(undefined), { active: 0, deleted: 0, private: 0, total: 0 })
  assert.deepEqual(summarizeBackup({ length: 3 }), { active: 0, deleted: 0, private: 0, total: 0 })
})

test('完整本机备份的软删与 private 记录都被计入，不从有效计数中重复扣减', () => {
  const records = [
    { id: 'tomb', deleted: true, deletedAt: 5, private: false },
    { id: 'secret-tomb', deleted: true, deletedAt: 6, private: true },
    { id: 'secret', deleted: false, private: true },
  ]
  const summary = summarizeBackup(records)
  assert.equal(summary.total, 3)
  assert.equal(summary.active, 1)
  assert.equal(summary.deleted, 2)
  assert.equal(summary.private, 2)
  assert.equal(summary.active + summary.deleted, summary.total)
})
