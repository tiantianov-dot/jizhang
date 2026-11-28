import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { getAll, getOne, initDB } from '@/db'
import { resetDatabase } from '@/db/testIsolation'
import * as categoriesRepo from '@/repositories/categories'
import * as recordsRepo from '@/repositories/records'
import { getBuiltinById } from '@/services/builtinCategories'
import {
  buildCategoriesPayload,
  isInboxConfigured,
  makeCloudRecordId,
  mapCloudItemToRecordInput,
  normalizeInboxUrl,
  syncCategories,
  syncPending,
  testConnection,
} from '@/services/cloudInbox'
import { todayStr } from '@/utils/format'

const FOOD = getBuiltinById('builtin:expense:food')
const EXPENSE_OTHER = getBuiltinById('builtin:expense:other')
const INCOME_OTHER = getBuiltinById('builtin:income:other')
const SALARY = getBuiltinById('builtin:income:salary')

async function fresh() {
  await resetDatabase()
  await initDB()
}

test('URL 规整、配置检查与未归档分类负载构造', () => {
  assert.equal(normalizeInboxUrl(' https://inbox.example.test/// '), 'https://inbox.example.test')
  assert.equal(normalizeInboxUrl('http://127.0.0.1:8080/'), 'http://127.0.0.1:8080')
  assert.equal(normalizeInboxUrl('ftp://inbox.example.test'), '')
  assert.equal(normalizeInboxUrl('https://user:pass@inbox.example.test'), '')
  assert.equal(normalizeInboxUrl('not-a-url'), '')

  assert.equal(isInboxConfigured({ url: 'https://inbox.example.test', token: 'abc' }), true)
  assert.equal(isInboxConfigured({ url: 'https://inbox.example.test', token: '   ' }), false)
  assert.equal(isInboxConfigured({ url: 'ftp://bad', token: 'abc' }), false)

  assert.equal(makeCloudRecordId('  item-1 '), 'cloud:item-1')
  assert.equal(makeCloudRecordId(''), '')

  const payload = buildCategoriesPayload([
    { name: '餐饮', type: 'expense', archived: false },
    { name: '旧餐饮', type: 'expense', archived: true },
    { name: '餐饮', type: 'expense', archived: false },
    { name: '工资', type: 'income', archived: false },
    { name: '旧兼职', type: 'income', archived: true },
  ])
  assert.deepEqual(payload, { expense: ['餐饮'], income: ['工资'] })
})

test('mapCloudItemToRecordInput：金额转整数分、分类匹配、归档跳过并回落内置「其他」', () => {
  const categories = [
    { ...FOOD, archived: false },
    { ...EXPENSE_OTHER, archived: false },
    { id: 'arch-1', name: '奶茶', type: 'expense', archived: true },
    { ...SALARY, archived: false },
    { ...INCOME_OTHER, archived: false },
  ]

  const mapped = mapCloudItemToRecordInput(
    {
      id: 'c1',
      type: 'expense',
      amount: 28.5,
      categoryName: '餐饮',
      note: ' 瑞幸咖啡\n拿铁 ',
      occurredAt: '2026-11-28T09:30:00+08:00',
    },
    categories,
  )
  assert.deepEqual(mapped, {
    id: 'cloud:c1',
    amount: 2850,
    type: 'expense',
    categoryId: FOOD.id,
    note: '瑞幸咖啡 拿铁',
    date: '2026-11-28',
    private: false,
  })

  // 已归档同名分类不应命中，回落至内置「其他」；非法日期回落今天
  const fallback = mapCloudItemToRecordInput(
    {
      id: 'c2',
      type: 'expense',
      amount: '15.20',
      categoryName: '奶茶',
      note: '',
      occurredAt: '2026-02-30',
    },
    categories,
  )
  assert.equal(fallback.categoryId, EXPENSE_OTHER.id)
  assert.equal(fallback.amount, 1520)
  assert.equal(fallback.date, todayStr())

  assert.equal(
    mapCloudItemToRecordInput({ id: 'c3', type: 'expense', amount: 0 }, categories),
    null,
  )
  assert.equal(
    mapCloudItemToRecordInput({ id: 'c4', type: 'expense', amount: 0.001 }, categories),
    null,
  )
  assert.equal(
    mapCloudItemToRecordInput({ id: 'c5', type: 'transfer', amount: 10 }, categories),
    null,
  )
  assert.equal(mapCloudItemToRecordInput({ id: '', type: 'expense', amount: 10 }, categories), null)
})

test('syncPending：未配置零请求；正常入库整数分并仅在成功后 /ack，且不改分类 updatedAt', async () => {
  await fresh()
  let fetchCalls = 0
  const unconfigured = await syncPending(
    { url: '', token: '' },
    {
      fetchImpl: async () => {
        fetchCalls += 1
        return new Response('{}', { status: 200 })
      },
    },
  )
  assert.equal(unconfigured.configured, false)
  assert.equal(fetchCalls, 0)

  const beforeFood = await getOne('categories', FOOD.id)
  const calls = []
  const mockFetch = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null })
    if (url.endsWith('/pending')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'p1',
              type: 'expense',
              amount: 28.5,
              categoryName: '餐饮',
              note: '瑞幸咖啡',
              occurredAt: '2026-11-28',
            },
            {
              id: 'p2',
              type: 'income',
              amount: 100,
              categoryName: '未匹配分类',
              note: '返现',
              occurredAt: '2026-11-28',
            },
          ],
        }),
        { status: 200 },
      )
    }
    if (url.endsWith('/ack')) {
      return new Response(JSON.stringify({ acked: 2, ids: ['p1', 'p2'] }), { status: 200 })
    }
    throw new Error(`unexpected url ${url}`)
  }

  const res = await syncPending(
    { url: 'https://inbox.example.test', token: 'tok-ok' },
    { fetchImpl: mockFetch },
  )
  assert.equal(res.ok, true)
  assert.equal(res.synced, 2)
  assert.equal(res.acked, 2)
  assert.equal(res.ackFailed, false)
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1].body, { ids: ['p1', 'p2'] })

  const stored1 = await getOne('records', 'cloud:p1')
  const stored2 = await getOne('records', 'cloud:p2')
  assert.equal(stored1.amount, 2850)
  assert.equal(stored1.categoryId, FOOD.id)
  assert.equal(stored2.amount, 10000)
  assert.equal(stored2.categoryId, INCOME_OTHER.id)

  const afterFood = await getOne('categories', FOOD.id)
  assert.ok(afterFood.lastUsedAt > 0)
  assert.equal(afterFood.updatedAt, beforeFood.updatedAt)
})

test('syncPending：同 ID 重复拉取（含本地软删后）幂等不重复入账且补发 /ack', async () => {
  await fresh()
  let ackShouldFail = true
  const ackPayloads = []

  const mockFetch = async (url, init) => {
    if (url.endsWith('/pending')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'dup-1',
              type: 'expense',
              amount: 16,
              categoryName: '餐饮',
              note: '午饭',
              occurredAt: '2026-11-28',
            },
          ],
        }),
        { status: 200 },
      )
    }
    if (url.endsWith('/ack')) {
      const body = JSON.parse(init.body)
      ackPayloads.push(body)
      if (ackShouldFail) {
        return new Response('server error', { status: 500 })
      }
      return new Response(JSON.stringify({ acked: body.ids.length, ids: body.ids }), {
        status: 200,
      })
    }
    throw new Error(`unexpected url ${url}`)
  }

  // 第 1 次：本地入库成功，但 /ack 失败
  const first = await syncPending(
    { url: 'https://inbox.example.test', token: 'tok' },
    { fetchImpl: mockFetch },
  )
  assert.equal(first.synced, 1)
  assert.equal(first.ackFailed, true)
  assert.equal((await getAll('records')).length, 1)

  // 用户软删除该记录
  await recordsRepo.softDelete('cloud:dup-1')
  assert.equal((await getOne('records', 'cloud:dup-1')).deleted, true)

  // 第 2 次：云端仍返回 dup-1，不能重复写库也不能复活软删记录，而应幂等补发 /ack
  ackShouldFail = false
  const second = await syncPending(
    { url: 'https://inbox.example.test', token: 'tok' },
    { fetchImpl: mockFetch },
  )
  assert.equal(second.ok, true)
  assert.equal(second.synced, 0)
  assert.equal(second.skippedDuplicates, 1)
  assert.equal(second.acked, 1)
  assert.equal(second.ackFailed, false)
  assert.deepEqual(ackPayloads[1], { ids: ['dup-1'] })
  assert.equal((await getAll('records')).length, 1)
  assert.equal((await getOne('records', 'cloud:dup-1')).deleted, true)
})

test('syncPending：本地写库失败时绝不调用 /ack；部分失败仅 ack 成功条目', async () => {
  await fresh()
  const ackedBatches = []

  const mockFetch = async (url, init) => {
    if (url.endsWith('/pending')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'ok-1',
              type: 'expense',
              amount: 12,
              categoryName: '餐饮',
              note: '早饭',
              occurredAt: '2026-11-28',
            },
            {
              id: 'fail-2',
              type: 'expense',
              amount: 20,
              categoryName: '餐饮',
              note: '坏账',
              occurredAt: '2026-11-28',
            },
          ],
        }),
        { status: 200 },
      )
    }
    if (url.endsWith('/ack')) {
      const body = JSON.parse(init.body)
      ackedBatches.push(body.ids)
      return new Response(JSON.stringify({ acked: body.ids.length, ids: body.ids }), {
        status: 200,
      })
    }
    throw new Error(`unexpected url ${url}`)
  }

  const partialRepo = {
    existingIds: recordsRepo.existingIds,
    async add(rec) {
      if (rec.id === 'cloud:fail-2') throw new Error('disk full')
      return recordsRepo.add(rec)
    },
  }

  const partialRes = await syncPending(
    { url: 'https://inbox.example.test', token: 'tok' },
    { fetchImpl: mockFetch, recordsRepo: partialRepo },
  )
  assert.equal(partialRes.ok, false)
  assert.equal(partialRes.synced, 1)
  assert.equal(partialRes.failed, 1)
  assert.deepEqual(ackedBatches, [['ok-1']])
  assert.ok(await getOne('records', 'cloud:ok-1'))
  assert.equal(await getOne('records', 'cloud:fail-2'), undefined)

  // 全部本地写库失败时绝不能调用 /ack
  const ackedAllFail = []
  const allFailFetch = async (url, init) => {
    if (url.endsWith('/pending')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'fail-only',
              type: 'expense',
              amount: 10,
              categoryName: '餐饮',
              note: '失败',
              occurredAt: '2026-11-28',
            },
          ],
        }),
        { status: 200 },
      )
    }
    if (url.endsWith('/ack')) {
      ackedAllFail.push(init.body)
      return new Response('{}', { status: 200 })
    }
    throw new Error('unexpected')
  }
  const allFailRes = await syncPending(
    { url: 'https://inbox.example.test', token: 'tok' },
    {
      fetchImpl: allFailFetch,
      recordsRepo: {
        existingIds: async () => new Set(),
        add: async () => {
          throw new Error('write error')
        },
      },
    },
  )
  assert.equal(allFailRes.ok, false)
  assert.equal(allFailRes.failed, 1)
  assert.equal(ackedAllFail.length, 0)
})

test('syncCategories 过滤归档分类并推送 PUT /categories；testConnection 覆盖 200/401/网络异常', async () => {
  await fresh()
  const archivedCat = await categoriesRepo.save({
    name: '已归档自定义',
    emoji: '🗂️',
    color: '#123456',
    type: 'expense',
  })
  await categoriesRepo.save({ ...archivedCat, archived: true })
  await categoriesRepo.save({
    name: '咖啡',
    emoji: '☕',
    color: '#654321',
    type: 'expense',
    archived: false,
  })

  let sentPayload = null
  const catRes = await syncCategories(
    { url: 'https://inbox.example.test', token: 'tok' },
    {
      fetchImpl: async (url, init) => {
        assert.equal(url, 'https://inbox.example.test/categories')
        assert.equal(init.method, 'PUT')
        sentPayload = JSON.parse(init.body)
        return new Response(
          JSON.stringify({
            ok: true,
            expenseCount: 12,
            incomeCount: 5,
            updatedAt: '2026-11-28T00:00:00Z',
          }),
          { status: 200 },
        )
      },
    },
  )
  assert.equal(catRes.ok, true)
  assert.ok(sentPayload.expense.includes('咖啡'))
  assert.equal(sentPayload.expense.includes('已归档自定义'), false)
  assert.equal(sentPayload.expense.length, 12)
  assert.equal(sentPayload.income.length, 5)

  const connOk = await testConnection(
    { url: 'https://inbox.example.test', token: 'tok' },
    {
      fetchImpl: async () =>
        new Response(JSON.stringify({ items: [{ id: '1' }] }), { status: 200 }),
    },
  )
  assert.deepEqual(connOk, { ok: true, pendingCount: 1 })

  const conn401 = await testConnection(
    { url: 'https://inbox.example.test', token: 'bad' },
    { fetchImpl: async () => new Response('{"error":"unauthorized"}', { status: 401 }) },
  )
  assert.equal(conn401.ok, false)
  assert.equal(conn401.code, 'UNAUTHORIZED')

  const connNetErr = await testConnection(
    { url: 'https://inbox.example.test', token: 'tok' },
    {
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch')
      },
    },
  )
  assert.equal(connNetErr.ok, false)
  assert.equal(connNetErr.code, 'NETWORK_ERROR')
})
