/**
 * db/sanity.test.js — B0 测试基建自检
 *
 * 硬断言：
 * 1. `@/` alias loader 能解析真实源码（本文件通过 `@/db` 导入）
 * 2. fake-indexeddb 能驱动真实 initDB，首次播种 16 个分类
 * 3. resetDatabase 让用例互相隔离
 * 4. 无故障 put 对照写入成功；第 N 次 put 抛错时事务 abort，三 store 快照不变
 */
import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { getAll, initDB, open, putOne, tx } from '@/db'
import { resetDatabase, snapshotJSON } from '@/db/testIsolation'

const STORE_COUNT = 16
const EXPENSE_COUNT = 11
const INCOME_COUNT = 5

async function freshInit() {
  await resetDatabase()
  await initDB()
}

function record(id) {
  return {
    id,
    amount: 100,
    type: 'expense',
    categoryId: 'c',
    note: '',
    date: '2026-10-24',
    createdAt: 1,
    updatedAt: 1,
    deleted: false,
    deletedAt: null,
    private: false,
    owner: 'me',
  }
}

test('alias loader 生效：@/db 解析到真实模块', () => {
  assert.equal(typeof initDB, 'function')
  assert.equal(typeof getAll, 'function')
  assert.equal(typeof putOne, 'function')
})

test('真实 initDB 首次播种 16 个分类（11 支出 + 5 收入）', async () => {
  await freshInit()
  const categories = await getAll('categories')
  assert.equal(categories.length, STORE_COUNT)
  assert.equal(categories.filter((c) => c.type === 'expense').length, EXPENSE_COUNT)
  assert.equal(categories.filter((c) => c.type === 'income').length, INCOME_COUNT)
})

test('两个用例互相隔离：前一个用例的写入不会污染后一个', async (t) => {
  await t.test('用例 A：写入 1 条账目后本用例可见', async () => {
    await freshInit()
    await putOne('records', record('isolation-a'))
    const rows = await getAll('records')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].id, 'isolation-a')
  })

  await t.test('用例 B：重置后看不到用例 A 的账目', async () => {
    await freshInit()
    assert.deepEqual(await getAll('records'), [])
    assert.equal((await getAll('categories')).length, STORE_COUNT)
  })
})

test('对照：回调抛错但不 abort 时，已排队的 put 仍会提交（证明负例不是 0 对 0）', async () => {
  await freshInit()
  const db = await open()
  const t = db.transaction('records', 'readwrite')
  t.objectStore('records').put(record('no-abort'))
  // 事务外同步抛错不会自动回滚，已排队的请求仍会提交
  try {
    throw new Error('control: throw without abort')
  } catch {}
  await new Promise((resolve, reject) => {
    t.oncomplete = resolve
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
  assert.deepEqual(
    (await getAll('records')).map((r) => r.id),
    ['no-abort'],
  )
})

test('无故障 put 写入成功；第 2 次 put 抛错时事务整体 abort（非 0 对 0）', async () => {
  await freshInit()

  // 正对照：证明写入路径本身有效
  await tx('records', 'readwrite', (store) => {
    store.put(record('ok-1'))
    store.put(record('ok-2'))
  })
  const baselineJSON = await snapshotJSON()
  const baseline = JSON.parse(baselineJSON)
  assert.equal(baseline.records.length, 2)
  assert.equal(baseline.categories.length, STORE_COUNT)

  // 负例：第 2 次 put 同步抛错；tx 必须 abort，第一次 put 也不能落盘
  let puts = 0
  await assert.rejects(
    tx('records', 'readwrite', (store) => {
      const put = (value) => {
        puts += 1
        if (puts === 2) throw new Error('injected put failure')
        return store.put(value)
      }
      put(record('boom-1'))
      put(record('boom-2'))
    }),
    /injected put failure/,
  )

  assert.equal(puts, 2, '故障注入必须真的执行到第 2 次 put')
  assert.equal(await snapshotJSON(), baselineJSON, 'abort 后三 store 快照必须与故障前完全一致')
})
