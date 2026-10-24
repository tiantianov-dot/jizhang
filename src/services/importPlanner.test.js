import test from 'node:test'
import assert from 'node:assert/strict'
import { BUILTIN_CATEGORIES, getBuiltinById } from './builtinCategories.js'
import { planImport } from './importPlanner.js'

function builtinLocal() {
  return BUILTIN_CATEGORIES.map((c) => ({
    id: c.id,
    name: c.name,
    emoji: c.emoji,
    color: c.color,
    type: c.type,
    monthlyBudget: 0,
    order: c.order,
    archived: false,
    lastUsedAt: 0,
    createdAt: 1,
    updatedAt: 1,
  }))
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

function record(overrides = {}) {
  return {
    id: 'r1',
    amount: 100,
    type: 'expense',
    categoryId: 'c1',
    note: '',
    date: '2026-10-24',
    createdAt: 10,
    updatedAt: 10,
    deleted: false,
    deletedAt: null,
    private: false,
    owner: 'me',
    ...overrides,
  }
}

function payload(overrides = {}) {
  return {
    app: 'jizhang',
    version: 1,
    records: [],
    categories: [],
    settings: [],
    ...overrides,
  }
}

function applyWrites(local, writes) {
  const categories = new Map(local.localCategories.map((c) => [c.id, c]))
  for (const c of writes.categories) categories.set(c.id, c)
  const records = new Map(local.localRecords.map((r) => [r.id, r]))
  for (const r of writes.records) records.set(r.id, r)
  const settings = new Map(local.localSettings.map((s) => [s.key, s]))
  for (const s of writes.settings) settings.set(s.key, s)
  return {
    localCategories: [...categories.values()],
    localRecords: [...records.values()],
    localSettings: [...settings.values()],
  }
}

test('v2 同 ID：严格 LWW，本地新增字段不被抹除', () => {
  const food = builtinLocal()[0]
  const local = {
    localCategories: [{ ...food, futureField: 'keep', updatedAt: 10 }],
    localRecords: [
      record({
        id: 'newer',
        categoryId: food.id,
        updatedAt: 10,
        note: '本地',
        futureField: 'keep',
      }),
      record({ id: 'older', categoryId: food.id, updatedAt: 10, note: '本地' }),
    ],
    localSettings: [],
  }
  const out = planImport(
    payload({
      version: 2,
      categories: [{ ...builtinLocal()[0], name: '新名字', updatedAt: 11, futureField: 'remote' }],
      records: [
        record({ id: 'newer', categoryId: food.id, updatedAt: 12, note: '远端新' }),
        record({ id: 'older', categoryId: food.id, updatedAt: 9, note: '远端旧' }),
      ],
    }),
    local,
  )
  assert.deepEqual(out.errors, [])
  assert.equal(out.summary.categories.updated, 1)
  assert.equal(out.writes.categories[0].name, '新名字')
  assert.equal(out.writes.categories[0].futureField, 'keep')
  assert.equal(out.summary.records.updated, 1)
  assert.equal(out.summary.records.skipped, 1)
  assert.equal(out.writes.records[0].futureField, 'keep')
  assert.equal(out.writes.records[0].note, '远端新')
})

test('真实故障场景：本地固定 ID + v1 另一套随机默认 ID → 全部匹配，不新增分类', () => {
  const local = { localCategories: builtinLocal(), localRecords: [], localSettings: [] }
  const legacyCats = BUILTIN_CATEGORIES.map((c, index) => legacyCategory(c, `legacy-${index}`))
  const food = getBuiltinById('builtin:expense:food')
  const incomeOther = getBuiltinById('builtin:income:other')
  const out = planImport(
    payload({
      categories: legacyCats,
      records: [
        record({ id: 'r-food', categoryId: 'legacy-0', type: 'expense' }),
        record({ id: 'r-other', categoryId: 'legacy-15', type: 'income' }),
      ],
    }),
    local,
  )
  assert.deepEqual(out.errors, [])
  assert.equal(out.summary.categories.added, 0)
  assert.equal(out.summary.categories.matched, 16)
  assert.equal(out.categoryMap.get('legacy-0'), food.id)
  assert.equal(out.categoryMap.get('legacy-15'), incomeOther.id)
  assert.equal(out.writes.records.find((r) => r.id === 'r-food').categoryId, food.id)
  assert.equal(out.writes.records.find((r) => r.id === 'r-other').categoryId, incomeOther.id)
})

test('v1 改名默认分类不猜测：保留为自定义，内置分类不变', () => {
  const local = { localCategories: builtinLocal(), localRecords: [], localSettings: [] }
  const food = getBuiltinById('builtin:expense:food')
  const renamed = legacyCategory(food, 'legacy-renamed', { name: '吃饭' })
  const out = planImport(payload({ categories: [renamed] }), local)
  assert.deepEqual(out.errors, [])
  assert.equal(out.summary.categories.matched, 0)
  assert.equal(out.summary.categories.added, 1)
  assert.equal(out.writes.categories[0].id, 'legacy-renamed')
  assert.equal(out.categoryMap.has(food.id), false)
})

test('两个「其他」按 type 分别匹配；兼职/红包按完整指纹匹配', () => {
  const local = { localCategories: builtinLocal(), localRecords: [], localSettings: [] }
  const expenseOther = getBuiltinById('builtin:expense:other')
  const incomeOther = getBuiltinById('builtin:income:other')
  const parttime = getBuiltinById('builtin:income:parttime')
  const redpacket = getBuiltinById('builtin:income:redpacket')
  const out = planImport(
    payload({
      categories: [
        legacyCategory(expenseOther, 'legacy-e-other'),
        legacyCategory(incomeOther, 'legacy-i-other'),
        legacyCategory(parttime, 'legacy-parttime'),
        legacyCategory(redpacket, 'legacy-redpacket'),
      ],
    }),
    local,
  )
  assert.deepEqual(out.errors, [])
  assert.equal(out.categoryMap.get('legacy-e-other'), expenseOther.id)
  assert.equal(out.categoryMap.get('legacy-i-other'), incomeOther.id)
  assert.equal(out.categoryMap.get('legacy-parttime'), parttime.id)
  assert.equal(out.categoryMap.get('legacy-redpacket'), redpacket.id)
  assert.equal(out.summary.categories.matched, 4)
  assert.equal(out.summary.categories.added, 0)
})

test('同名自定义分类不合并（即使 emoji/颜色/order 相同）', () => {
  const local = {
    localCategories: [
      {
        id: 'local-custom',
        name: '餐饮',
        emoji: '🍚',
        color: '#D85A30',
        type: 'expense',
        monthlyBudget: 0,
        order: 999,
        archived: false,
        lastUsedAt: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    localRecords: [],
    localSettings: [],
  }
  const remoteCustom = {
    ...local.localCategories[0],
    id: 'remote-custom',
    updatedAt: 50,
  }
  const out = planImport(payload({ categories: [remoteCustom] }), local)
  assert.deepEqual(out.errors, [])
  assert.equal(out.summary.categories.added, 1)
  assert.equal(out.writes.categories[0].id, 'remote-custom')
  assert.equal(out.categoryMap.get('remote-custom'), 'remote-custom')
})

test('悬空引用与跨类型引用整份拒绝且零写入', () => {
  const dangling = planImport(payload({ records: [record({ categoryId: 'missing' })] }), {
    localCategories: [],
    localRecords: [],
    localSettings: [],
  })
  assert.ok(dangling.errors.some((item) => item.code === 'DANGLING_CATEGORY'))
  assert.deepEqual(dangling.writes, { records: [], categories: [], settings: [] })

  const crossType = planImport(
    payload({
      categories: [legacyCategory(getBuiltinById('builtin:expense:food'), 'c1')],
      records: [record({ categoryId: 'c1', type: 'income' })],
    }),
    { localCategories: [], localRecords: [], localSettings: [] },
  )
  assert.ok(crossType.errors.some((item) => item.code === 'CATEGORY_TYPE_MISMATCH'))
  assert.deepEqual(crossType.writes, { records: [], categories: [], settings: [] })
})

test('v1 缺省字段在写入前补全', () => {
  const out = planImport(
    payload({
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
    { localCategories: [], localRecords: [], localSettings: [] },
  )
  assert.deepEqual(out.errors, [])
  assert.equal(out.writes.records[0].private, false)
  assert.equal(out.writes.records[0].owner, 'me')
  assert.equal(out.writes.records[0].deleted, false)
  assert.equal(out.writes.records[0].deletedAt, null)
  assert.equal(out.writes.records[0].note, '')
  assert.equal(out.writes.categories[0].monthlyBudget, 0)
  assert.equal(out.writes.categories[0].order, 999)
  assert.equal(out.writes.categories[0].archived, false)
})

test('未知未来版本整份拒绝且零写入', () => {
  const out = planImport(payload({ version: 3, records: [record()], categories: [] }), {
    localCategories: [],
    localRecords: [],
    localSettings: [],
  })
  assert.ok(out.errors.some((item) => item.code === 'UNSUPPORTED_VERSION'))
  assert.deepEqual(out.writes, { records: [], categories: [], settings: [] })
})

test('settings：白名单 fail-closed + 严格 LWW；本机键/未知键永不导入', () => {
  const local = {
    localCategories: [],
    localRecords: [],
    localSettings: [
      { key: 'monthlyBudget', value: 100, updatedAt: 10 },
      { key: 'ownerName', value: 'A', updatedAt: 10 },
      { key: 'lastBackupAt', value: '2026-01-01', updatedAt: 1 },
      { key: 'builtinIdentityVersion', value: 1, updatedAt: 1 },
    ],
  }
  const out = planImport(
    payload({
      settings: [
        { key: 'monthlyBudget', value: 200, updatedAt: 9 },
        { key: 'ownerName', value: 'B', updatedAt: 11 },
        { key: 'lastBackupAt', value: 'evil', updatedAt: 999 },
        { key: 'builtinIdentityVersion', value: 2, updatedAt: 999 },
        { key: 'syncConfig', value: { evil: true }, updatedAt: 999 },
        { key: 'unknownKey', value: 1, updatedAt: 999 },
      ],
    }),
    local,
  )
  assert.deepEqual(out.errors, [])
  assert.deepEqual(out.writes.settings, [{ key: 'ownerName', value: 'B', updatedAt: 11 }])
  assert.deepEqual(out.summary.settings, { updated: 1, skipped: 1 })
})

test('v1 缺少可选字段时不抹掉本地值（字段级合并）', () => {
  const local = {
    localCategories: [
      {
        id: 'c1',
        name: '旧名',
        emoji: '🍀',
        color: '#123456',
        type: 'expense',
        monthlyBudget: 5000,
        order: 999,
        archived: false,
        lastUsedAt: 7,
        createdAt: 1,
        updatedAt: 10,
        futureField: 'keep',
      },
    ],
    localRecords: [record({ id: 'r1', updatedAt: 10, private: true, futureField: 'keep' })],
    localSettings: [],
  }
  const out = planImport(
    payload({
      categories: [
        {
          id: 'c1',
          name: '新名',
          emoji: '🍀',
          color: '#123456',
          type: 'expense',
          updatedAt: 11,
        },
      ],
      records: [
        {
          id: 'r1',
          amount: 100,
          type: 'expense',
          categoryId: 'c1',
          date: '2026-10-24',
          updatedAt: 11,
        },
      ],
    }),
    local,
  )
  assert.deepEqual(out.errors, [])
  assert.equal(out.writes.categories[0].name, '新名')
  assert.equal(out.writes.categories[0].monthlyBudget, 5000)
  assert.equal(out.writes.categories[0].lastUsedAt, 7)
  assert.equal(out.writes.categories[0].futureField, 'keep')
  assert.equal(out.writes.records[0].private, true)
  assert.equal(out.writes.records[0].futureField, 'keep')
})

test('本地同指纹多候选 → 歧义保留为自定义，不强并', () => {
  const food = getBuiltinById('builtin:expense:food')
  const local = {
    localCategories: [legacyCategory(food, 'dup-1'), legacyCategory(food, 'dup-2')],
    localRecords: [],
    localSettings: [],
  }
  const out = planImport(
    payload({
      categories: [legacyCategory(food, 'remote-food')],
    }),
    local,
  )
  assert.deepEqual(out.errors, [])
  assert.equal(out.summary.conflicts.length, 1)
  assert.equal(out.summary.categories.conflicts, 1)
  assert.equal(out.summary.categories.matched, 0)
  assert.equal(out.summary.categories.added, 1)
  assert.equal(out.writes.categories[0].id, 'remote-food')
})

test('多个备份旧默认项映射同一内置 → 后到者保留为自定义', () => {
  const food = getBuiltinById('builtin:expense:food')
  const local = { localCategories: builtinLocal(), localRecords: [], localSettings: [] }
  const out = planImport(
    payload({
      categories: [legacyCategory(food, 'legacy-a'), legacyCategory(food, 'legacy-b')],
    }),
    local,
  )
  assert.deepEqual(out.errors, [])
  assert.equal(out.categoryMap.get('legacy-a'), food.id)
  assert.equal(out.categoryMap.get('legacy-b'), 'legacy-b')
  assert.equal(out.summary.categories.matched, 1)
  assert.equal(out.summary.categories.added, 1)
  assert.equal(out.summary.categories.conflicts, 1)
})

test('同一备份第二次导入稳定：零新增、零更新', () => {
  const food = getBuiltinById('builtin:expense:food')
  const local = { localCategories: builtinLocal(), localRecords: [], localSettings: [] }
  const incoming = payload({
    categories: [legacyCategory(food, 'legacy-food')],
    records: [record({ id: 'r1', categoryId: 'legacy-food' })],
  })
  const first = planImport(incoming, local)
  assert.deepEqual(first.errors, [])
  assert.equal(first.summary.categories.matched, 1)
  assert.equal(first.summary.records.added, 1)

  const localAfter = applyWrites(local, first.writes)
  assert.equal(localAfter.localCategories.length, 16)
  const second = planImport(incoming, localAfter)
  assert.deepEqual(second.errors, [])
  assert.deepEqual(second.writes, { records: [], categories: [], settings: [] })
  assert.equal(second.summary.categories.added, 0)
  assert.equal(second.summary.categories.matched, 1)
  assert.equal(second.summary.records.added, 0)
  assert.equal(second.summary.records.updated, 0)
  assert.equal(second.summary.records.skipped, 1)
})

test('金额/日期/备注相同但 ID 不同的账目不会被判重', () => {
  const out = planImport(
    payload({
      categories: [legacyCategory(getBuiltinById('builtin:expense:food'), 'c1')],
      records: [
        record({ id: 'a', categoryId: 'c1', amount: 100, date: '2026-10-01', note: '同' }),
        record({ id: 'b', categoryId: 'c1', amount: 100, date: '2026-10-01', note: '同' }),
      ],
    }),
    { localCategories: [], localRecords: [], localSettings: [] },
  )
  assert.deepEqual(out.errors, [])
  assert.equal(out.summary.records.added, 2)
})

test('自定义分类同 ID 更新时保留本地 lastUsedAt/createdAt', () => {
  const local = {
    localCategories: [
      {
        id: 'c1',
        name: '旧',
        emoji: '🍀',
        color: '#123456',
        type: 'expense',
        monthlyBudget: 0,
        order: 999,
        archived: false,
        lastUsedAt: 42,
        createdAt: 5,
        updatedAt: 10,
      },
    ],
    localRecords: [],
    localSettings: [],
  }
  const out = planImport(
    payload({
      version: 2,
      categories: [
        {
          id: 'c1',
          name: '新',
          emoji: '🍀',
          color: '#123456',
          type: 'expense',
          monthlyBudget: 0,
          order: 999,
          archived: false,
          lastUsedAt: 0,
          createdAt: 99,
          updatedAt: 11,
        },
      ],
    }),
    local,
  )
  assert.equal(out.writes.categories[0].lastUsedAt, 42)
  assert.equal(out.writes.categories[0].createdAt, 5)
})

test('summary 区分新增/更新中的软删数量', () => {
  const food = getBuiltinById('builtin:expense:food')
  const local = {
    localCategories: builtinLocal(),
    localRecords: [
      record({ id: 'upd-tomb', categoryId: food.id, updatedAt: 10 }),
      record({ id: 'upd-active', categoryId: food.id, updatedAt: 10, deleted: true, deletedAt: 9 }),
      record({ id: 'old', categoryId: food.id, updatedAt: 10 }),
    ],
    localSettings: [],
  }
  const out = planImport(
    payload({
      version: 2,
      records: [
        record({
          id: 'new-tomb',
          categoryId: food.id,
          updatedAt: 10,
          deleted: true,
          deletedAt: 10,
        }),
        record({ id: 'new-active', categoryId: food.id, updatedAt: 10 }),
        record({
          id: 'upd-tomb',
          categoryId: food.id,
          updatedAt: 11,
          deleted: true,
          deletedAt: 11,
        }),
        record({ id: 'upd-active', categoryId: food.id, updatedAt: 12, deleted: false }),
        record({ id: 'old', categoryId: food.id, updatedAt: 5 }),
      ],
    }),
    local,
  )
  assert.deepEqual(out.errors, [])
  assert.deepEqual(out.summary.records, {
    added: 2,
    updated: 2,
    skipped: 1,
    softDeleted: { added: 1, updated: 1 },
  })
  assert.equal(out.writes.records.find((r) => r.id === 'new-tomb').deleted, true)
  assert.equal(out.writes.records.find((r) => r.id === 'upd-active').deleted, false)
})
