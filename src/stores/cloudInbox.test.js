import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { initDB } from '@/db'
import { resetDatabase } from '@/db/testIsolation'
import { useBackupStore } from '@/stores/backup'
import { useCategoriesStore } from '@/stores/categories'
import { useCloudInboxStore } from '@/stores/cloudInbox'
import { useRecordsStore } from '@/stores/records'

async function fresh() {
  await resetDatabase()
  await initDB()
  setActivePinia(createPinia())
}

function withStubFetch(mockFetch, fn) {
  const prevDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch')
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    value: mockFetch,
  })
  return Promise.resolve()
    .then(() => fn())
    .finally(() => {
      if (prevDescriptor) Object.defineProperty(globalThis, 'fetch', prevDescriptor)
      else delete globalThis.fetch
    })
}

test('未配置时零请求；配置保存、加载与清除正确持久化', async () => {
  await fresh()
  let calls = 0
  await withStubFetch(
    async () => {
      calls += 1
      return new Response('{}', { status: 200 })
    },
    async () => {
      const store = useCloudInboxStore()
      await store.load()
      assert.equal(store.loaded, true)
      assert.equal(store.configured, false)

      const res = await store.syncNow({ silent: true })
      assert.equal(res.configured, false)
      assert.equal(res.synced, 0)
      assert.equal(calls, 0)

      await store.saveConfig({ url: 'https://inbox.example.test/', token: 'tok-1' })
      assert.equal(store.url, 'https://inbox.example.test')
      assert.equal(store.token, 'tok-1')
      assert.equal(store.configured, true)

      setActivePinia(createPinia())
      const reloaded = useCloudInboxStore()
      await reloaded.load()
      assert.equal(reloaded.url, 'https://inbox.example.test')
      assert.equal(reloaded.token, 'tok-1')

      await reloaded.clearConfig()
      assert.equal(reloaded.configured, false)
      assert.equal(reloaded.url, '')
      assert.equal(reloaded.token, '')
    },
  )
})

test('syncNow 具备并发防重入锁，入库后自动刷新 records/categories/backup 并持久化状态', async () => {
  await fresh()
  let pendingRequests = 0
  let releasePending
  const pendingGate = new Promise((resolve) => {
    releasePending = resolve
  })

  await withStubFetch(
    async (url, init) => {
      if (url.endsWith('/pending')) {
        pendingRequests += 1
        await pendingGate
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 's-1',
                type: 'expense',
                amount: 32.5,
                categoryName: '餐饮',
                note: '云端同步测试',
                occurredAt: '2026-11-28',
              },
            ],
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/ack')) {
        const body = JSON.parse(init.body)
        return new Response(JSON.stringify({ acked: body.ids.length, ids: body.ids }), {
          status: 200,
        })
      }
      throw new Error(`unexpected ${url}`)
    },
    async () => {
      const cloudInbox = useCloudInboxStore()
      const records = useRecordsStore()
      const categories = useCategoriesStore()
      const backup = useBackupStore()
      await Promise.all([records.load(), categories.load(), backup.refreshCounts()])
      await cloudInbox.saveConfig({ url: 'https://inbox.example.test', token: 'tok-sync' })

      const firstPromise = cloudInbox.syncNow({ silent: true })
      assert.equal(cloudInbox.syncing, true)
      const secondResult = await cloudInbox.syncNow({ silent: true })
      assert.equal(secondResult.busy, true)
      assert.equal(secondResult.synced, 0)

      releasePending()
      const firstResult = await firstPromise
      assert.equal(pendingRequests, 1)
      assert.equal(firstResult.ok, true)
      assert.equal(firstResult.synced, 1)
      assert.equal(cloudInbox.syncing, false)

      assert.equal(records.list.length, 1)
      assert.equal(records.list[0].id, 'cloud:s-1')
      assert.equal(records.list[0].amount, 3250)
      assert.equal(backup.counts.total, 1)
      assert.equal(cloudInbox.lastResult, 'ok')
      assert.equal(cloudInbox.lastCount, 1)
      assert.ok(cloudInbox.lastSyncAt)
    },
  )
})

test('静默同步遇网络异常不抛错并记录错误状态', async () => {
  await fresh()
  await withStubFetch(
    async () => {
      throw new TypeError('network down')
    },
    async () => {
      const cloudInbox = useCloudInboxStore()
      await cloudInbox.saveConfig({ url: 'https://inbox.example.test', token: 'tok-err' })
      const res = await cloudInbox.syncNow({ silent: true })
      assert.equal(res.ok, false)
      assert.equal(res.synced, 0)
      assert.equal(cloudInbox.lastResult, 'error')
      assert.ok(cloudInbox.lastError.includes('无法连接'))
      assert.equal(cloudInbox.syncing, false)
    },
  )
})
