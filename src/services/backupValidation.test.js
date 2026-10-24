import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeBackup } from './backupValidation.js'

const BASE_RECORD = {
  id: 'r1',
  amount: 100,
  type: 'expense',
  categoryId: 'c1',
  note: '',
  date: '2026-10-24',
  createdAt: 1,
  updatedAt: 1,
  deleted: false,
  deletedAt: null,
  private: false,
  owner: 'me',
}

const BASE_CATEGORY = {
  id: 'c1',
  name: '自定义',
  emoji: '🍀',
  color: '#123456',
  type: 'expense',
  monthlyBudget: 0,
  order: 999,
  archived: false,
  lastUsedAt: 0,
  createdAt: 1,
  updatedAt: 1,
}

const BASE_SETTING = { key: 'monthlyBudget', value: 0, updatedAt: 1 }

function record(overrides = {}) {
  return { ...BASE_RECORD, ...overrides }
}

function category(overrides = {}) {
  return { ...BASE_CATEGORY, ...overrides }
}

function setting(overrides = {}) {
  return { ...BASE_SETTING, ...overrides }
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

test('合法 v2：保留全部字段', () => {
  const out = normalizeBackup(
    payload({ records: [record()], categories: [category()], settings: [setting()] }),
  )
  assert.deepEqual(out.errors, [])
  assert.equal(out.version, 2)
  assert.deepEqual(out.records[0], BASE_RECORD)
  assert.deepEqual(out.categories[0], BASE_CATEGORY)
  assert.deepEqual(out.settings[0], BASE_SETTING)
})

test('v1 可选字段确定性补默认值（不调用 Date.now）', () => {
  const out = normalizeBackup(
    payload({
      version: 1,
      records: [
        {
          id: 'r1',
          amount: 250,
          type: 'income',
          categoryId: 'c1',
          date: '2026-01-02',
        },
      ],
      categories: [{ id: 'c1', name: '工资', type: 'income' }],
      settings: [{ key: 'ownerName', value: '我' }],
    }),
  )
  assert.deepEqual(out.errors, [])
  assert.deepEqual(out.records[0], {
    id: 'r1',
    amount: 250,
    type: 'income',
    categoryId: 'c1',
    note: '',
    date: '2026-01-02',
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
    deletedAt: null,
    private: false,
    owner: 'me',
  })
  assert.deepEqual(out.categories[0], {
    id: 'c1',
    name: '工资',
    emoji: '📦',
    color: '#5F5E5A',
    type: 'income',
    monthlyBudget: 0,
    order: 999,
    archived: false,
    lastUsedAt: 0,
    createdAt: 0,
    updatedAt: 0,
  })
  assert.deepEqual(out.settings[0], { key: 'ownerName', value: '我', updatedAt: 0 })
})

test('根节点 / app / version / 三集合结构错误整份拒绝', () => {
  for (const [bad, code] of [
    [null, 'INVALID_ROOT'],
    [[], 'INVALID_ROOT'],
    [payload({ app: 'other' }), 'WRONG_APP'],
    [payload({ version: 3 }), 'UNSUPPORTED_VERSION'],
    [payload({ version: '2' }), 'UNSUPPORTED_VERSION'],
    [payload({ version: undefined }), 'UNSUPPORTED_VERSION'],
    [payload({ records: {} }), 'MISSING_COLLECTION'],
    [payload({ categories: null }), 'MISSING_COLLECTION'],
    [payload({ settings: 'x' }), 'MISSING_COLLECTION'],
  ]) {
    const out = normalizeBackup(bad)
    assert.ok(
      out.errors.some((item) => item.code === code),
      `应包含 ${code}`,
    )
    assert.deepEqual(out.records, [])
    assert.deepEqual(out.categories, [])
    assert.deepEqual(out.settings, [])
  }
})

test('未来版本不做任何元素解析', () => {
  const out = normalizeBackup(
    payload({ version: 3, records: [{ garbage: true }], categories: [null], settings: [1] }),
  )
  assert.deepEqual(
    out.errors.map((item) => item.code),
    ['UNSUPPORTED_VERSION'],
  )
  assert.deepEqual(out.records, [])
})

test('重复账目/分类 id 与重复 settings key 都是整文件错误', () => {
  const out = normalizeBackup(
    payload({
      records: [record(), record({ amount: 200 })],
      categories: [category(), category({ name: '另一个' })],
      settings: [setting(), setting({ value: 100 })],
    }),
  )
  assert.ok(out.errors.some((item) => item.code === 'DUPLICATE_ID'))
  assert.ok(out.errors.some((item) => item.code === 'DUPLICATE_SETTING_KEY'))
})

test('非法金额/日期/类型/引用字段整份拒绝', () => {
  const badRecords = [
    record({ amount: 0 }),
    record({ amount: -1 }),
    record({ amount: 1.5 }),
    record({ amount: '100' }),
    record({ date: '2026-02-30' }),
    record({ date: '2026/10/24' }),
    record({ type: 'transfer' }),
    record({ categoryId: '' }),
    record({ id: '' }),
  ]
  for (const bad of badRecords) {
    const out = normalizeBackup(payload({ records: [bad] }))
    assert.ok(out.errors.length > 0, `应拒绝 ${JSON.stringify(bad)}`)
    assert.deepEqual(out.records, [])
  }
})

test('内置 ID 必须已知且 type 一致', () => {
  const unknown = normalizeBackup(
    payload({ categories: [category({ id: 'builtin:expense:nope' })] }),
  )
  assert.ok(unknown.errors.some((item) => item.code === 'UNKNOWN_BUILTIN_ID'))

  const mismatch = normalizeBackup(
    payload({ categories: [category({ id: 'builtin:expense:food', type: 'income' })] }),
  )
  assert.ok(mismatch.errors.some((item) => item.code === 'BUILTIN_TYPE_MISMATCH'))

  const ok = normalizeBackup(
    payload({ categories: [category({ id: 'builtin:expense:food', name: '餐饮' })] }),
  )
  assert.deepEqual(ok.errors, [])
})

test('settings 白名单值校验；本机键与未知键允许存在但由 planner 忽略', () => {
  const bad = normalizeBackup(
    payload({
      settings: [
        setting({ key: 'monthlyBudget', value: -1 }),
        { key: 'ownerName', value: 123, updatedAt: 1 },
        { key: 'uiGlassIntensity', value: 'high', updatedAt: 1 },
        { key: 'backupReminderDays', value: 5, updatedAt: 1 },
        { key: 'backupReminderEnabled', value: 'yes', updatedAt: 1 },
      ],
    }),
  )
  assert.equal(bad.errors.filter((item) => item.code === 'INVALID_SETTING').length, 5)

  const ok = normalizeBackup(
    payload({
      settings: [
        setting({ key: 'lastBackupAt', value: '2026-10-24T00:00:00.000Z' }),
        setting({ key: 'unknownKey', value: { x: 1 } }),
        setting({ key: 'uiGlassFill', value: 0.03 }),
        setting({ key: 'backupReminderDays', value: 30 }),
        setting({ key: 'backupReminderEnabled', value: false }),
      ],
    }),
  )
  assert.deepEqual(ok.errors, [])
  assert.equal(ok.settings.length, 5)
})

test('normalize 确定性且不修改入参', () => {
  const input = payload({
    version: 1,
    records: [record({ private: undefined, owner: undefined })],
    categories: [category({ monthlyBudget: undefined })],
    settings: [setting({ updatedAt: undefined })],
  })
  const before = JSON.stringify(input)
  const a = normalizeBackup(input)
  const b = normalizeBackup(input)
  assert.deepEqual(a, b)
  assert.equal(JSON.stringify(input), before)
})
