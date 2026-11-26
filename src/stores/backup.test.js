import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { getAll, getOne, initDB, putOne } from '@/db'
import { resetDatabase, snapshotJSON } from '@/db/testIsolation'
import { getBuiltinById } from '@/services/builtinCategories'
import { useBackupStore } from '@/stores/backup'
import { useRecordsStore } from '@/stores/records'
import { useCategoriesStore } from '@/stores/categories'
import { useSettingsStore } from '@/stores/settings'
import { useAppearanceStore } from '@/stores/appearance'

const FOOD = getBuiltinById('builtin:expense:food')
const FAR_FUTURE = () => Date.now() + 1_000_000

async function fresh() {
  await resetDatabase()
  await initDB()
  setActivePinia(createPinia())
}

function withStubBrowserEnv(fn) {
  const prevDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const prevStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const props = new Map()
  const storage = new Map()
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: {
      documentElement: {
        style: {
          setProperty(name, value) {
            props.set(name, value)
          },
        },
      },
    },
  })
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
    },
  })
  return Promise.resolve()
    .then(() => fn({ cssVars: props, storage }))
    .finally(() => {
      if (prevDocument) Object.defineProperty(globalThis, 'document', prevDocument)
      else delete globalThis.document
      if (prevStorage) Object.defineProperty(globalThis, 'localStorage', prevStorage)
      else delete globalThis.localStorage
    })
}

function makeRecord(overrides = {}) {
  return {
    id: 'rec-1',
    amount: 1200,
    type: 'expense',
    categoryId: FOOD.id,
    note: '测试账目',
    date: '2026-10-24',
    createdAt: 100,
    updatedAt: 100,
    deleted: false,
    deletedAt: null,
    private: false,
    owner: 'me',
    ...overrides,
  }
}

function makePayload(overrides = {}) {
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

function injectStoreMethodFailure(methodName, failAt, errorName = 'AbortError') {
  const proto = IDBObjectStore.prototype
  const descriptor = Object.getOwnPropertyDescriptor(proto, methodName)
  let calls = 0
  Object.defineProperty(proto, methodName, {
    configurable: true,
    writable: true,
    value: function (...args) {
      calls += 1
      if (calls === failAt) throw new DOMException(`injected ${methodName} failure`, errorName)
      return descriptor.value.apply(this, args)
    },
  })
  return {
    restore: () => Object.defineProperty(proto, methodName, descriptor),
  }
}

test('refreshCounts：准确统计有效、软删、本机标记与总计，异常时置 null', async () => {
  await fresh()
  await putOne('records', makeRecord({ id: 'active-1' }))
  await putOne('records', makeRecord({ id: 'deleted-1', deleted: true, deletedAt: 200 }))
  await putOne('records', makeRecord({ id: 'private-1', private: true }))
  await putOne(
    'records',
    makeRecord({ id: 'private-deleted', deleted: true, deletedAt: 300, private: true }),
  )

  const backup = useBackupStore()
  const counts = await backup.refreshCounts()
  assert.deepEqual(counts, { active: 2, deleted: 2, private: 2, total: 4 })
  assert.deepEqual(backup.counts, { active: 2, deleted: 2, private: 2, total: 4 })

  const fault = injectStoreMethodFailure('getAll', 1, 'UnknownError')
  try {
    const failed = await backup.refreshCounts()
    assert.equal(failed, null)
    assert.equal(backup.counts, null)
  } finally {
    fault.restore()
  }
})

test('exportSnapshot：返回完整 v2 快照并同步刷新 counts，具备并发保护', async () => {
  await fresh()
  await putOne('records', makeRecord({ id: 'r-active' }))
  await putOne('records', makeRecord({ id: 'r-private', private: true }))
  await putOne('records', makeRecord({ id: 'r-deleted', deleted: true, deletedAt: 500 }))

  const backup = useBackupStore()
  const firstPromise = backup.exportSnapshot()
  assert.equal(backup.exportBusy, true)
  const concurrent = await backup.exportSnapshot()
  assert.equal(concurrent, null)

  const snapshot = await firstPromise
  assert.equal(backup.exportBusy, false)
  assert.equal(snapshot.app, 'jizhang')
  assert.equal(snapshot.version, 2)
  assert.equal(snapshot.records.length, 3)
  assert.deepEqual(backup.counts, { active: 2, deleted: 1, private: 1, total: 3 })
})

test('previewImport：合法载荷只读零写入并保存 pendingImport；非法载荷拒绝并清空 pendingImport', async () => {
  await fresh()
  const before = await snapshotJSON()
  const backup = useBackupStore()

  const valid = makePayload({
    records: [makeRecord({ id: 'import-rec-1', amount: 3500 })],
    settings: [{ key: 'monthlyBudget', value: 50000, updatedAt: FAR_FUTURE() }],
  })
  const okResult = await backup.previewImport(valid)
  assert.equal(okResult.ok, true)
  assert.equal(okResult.summary.records.added, 1)
  assert.equal(okResult.summary.settings.updated, 1)
  assert.ok(backup.pendingImport)
  assert.deepEqual(backup.pendingImport.payload, valid)
  assert.equal(await snapshotJSON(), before)

  const invalidResult = await backup.previewImport(makePayload({ version: 99 }))
  assert.equal(invalidResult.ok, false)
  assert.ok(invalidResult.errors.length > 0)
  assert.equal(backup.pendingImport, null)
  assert.equal(await snapshotJSON(), before)
})

test('confirmImport：原子落库并并行刷新 4 个业务 store 与 counts，随后清空 pendingImport', async () => {
  await withStubBrowserEnv(async ({ cssVars }) => {
    await fresh()
    const backup = useBackupStore()
    const records = useRecordsStore()
    const categories = useCategoriesStore()
    const settings = useSettingsStore()
    const appearance = useAppearanceStore()

    assert.equal(await backup.confirmImport(), null)

    const customCat = {
      id: 'custom-cat-1',
      name: '咖啡',
      emoji: '☕',
      color: '#556677',
      type: 'expense',
      monthlyBudget: 0,
      order: 999,
      archived: false,
      lastUsedAt: 0,
      createdAt: 100,
      updatedAt: 100,
    }
    const data = makePayload({
      categories: [customCat],
      records: [
        makeRecord({ id: 'imp-active', categoryId: 'custom-cat-1', amount: 2800 }),
        makeRecord({ id: 'imp-deleted', deleted: true, deletedAt: 400 }),
        makeRecord({ id: 'imp-private', private: true, amount: 900 }),
      ],
      settings: [
        { key: 'monthlyBudget', value: 123400, updatedAt: FAR_FUTURE() },
        { key: 'backupReminderDays', value: 14, updatedAt: FAR_FUTURE() },
        { key: 'uiGlassIntensity', value: 0.75, updatedAt: FAR_FUTURE() },
        { key: 'uiGlassFill', value: 0.12, updatedAt: FAR_FUTURE() },
      ],
    })

    const preview = await backup.previewImport(data)
    assert.equal(preview.ok, true)

    const summary = await backup.confirmImport()
    assert.equal(summary.records.added, 3)
    assert.equal(summary.categories.added, 1)
    assert.equal(backup.importBusy, false)
    assert.equal(backup.pendingImport, null)

    assert.equal(records.list.length, 2)
    assert.ok(categories.byId('custom-cat-1'))
    assert.equal(settings.monthlyBudget, 123400)
    assert.equal(settings.backupReminderDays, 14)
    assert.equal(appearance.glassIntensity, 0.75)
    assert.equal(appearance.glassFill, 0.12)
    assert.equal(cssVars.get('--glass-intensity'), '0.75')
    assert.equal(cssVars.get('--glass-alpha'), '0.12')
    assert.deepEqual(backup.counts, { active: 2, deleted: 1, private: 1, total: 3 })
  })
})

test('confirmImport：写库故障时原子回滚、复位 importBusy 且保留 pendingImport 以便重试', async () => {
  await fresh()
  const before = await snapshotJSON()
  const backup = useBackupStore()
  const data = makePayload({
    records: [makeRecord({ id: 'rollback-rec' })],
    settings: [{ key: 'monthlyBudget', value: 99900, updatedAt: FAR_FUTURE() }],
  })
  await backup.previewImport(data)

  const fault = injectStoreMethodFailure('put', 1, 'AbortError')
  try {
    await assert.rejects(backup.confirmImport(), /injected put failure/)
  } finally {
    fault.restore()
  }

  assert.equal(backup.importBusy, false)
  assert.ok(backup.pendingImport)
  assert.equal(await snapshotJSON(), before)
  assert.equal((await getAll('records')).length, 0)
  assert.equal((await getOne('settings', 'monthlyBudget')).value, 0)
})

test('cancelImport：非 busy 时清空 pendingImport，importBusy 为 true 时拒绝取消', async () => {
  await fresh()
  const backup = useBackupStore()
  await backup.previewImport(makePayload({ records: [makeRecord({ id: 'cancel-rec' })] }))
  assert.ok(backup.pendingImport)

  backup.importBusy = true
  assert.equal(backup.cancelImport(), false)
  assert.ok(backup.pendingImport)

  backup.importBusy = false
  assert.equal(backup.cancelImport(), true)
  assert.equal(backup.pendingImport, null)
})
