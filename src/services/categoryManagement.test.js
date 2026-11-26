import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCategoryPayload,
  describeBulkStatus,
  filterCategories,
  formatBulkCompletionToast,
  getMigrationTargets,
  summarizeSelectedUsage,
  validateCategoryDraft,
} from './categoryManagement.js'

const SAMPLE = Object.freeze([
  Object.freeze({
    id: 'builtin:expense:food',
    name: '餐饮',
    type: 'expense',
    emoji: '🍚',
    color: '#D85A30',
    order: 0,
    archived: false,
    lastUsedAt: 100,
    monthlyBudget: 0,
  }),
  Object.freeze({
    id: 'builtin:income:salary',
    name: '工资',
    type: 'income',
    emoji: '💰',
    color: '#0F6E56',
    order: 11,
    archived: false,
    lastUsedAt: 90,
    monthlyBudget: 0,
  }),
  Object.freeze({
    id: 'custom-exp-1',
    name: '咖啡',
    type: 'expense',
    emoji: '☕',
    color: '#854F0B',
    order: 999,
    archived: false,
    lastUsedAt: 80,
    monthlyBudget: 20000,
  }),
  Object.freeze({
    id: 'custom-exp-archived',
    name: '旧爱好',
    type: 'expense',
    emoji: '🎨',
    color: '#534AB7',
    order: 999,
    archived: true,
    lastUsedAt: 10,
    monthlyBudget: 0,
  }),
  Object.freeze({
    id: 'custom-inc-1',
    name: '稿费',
    type: 'income',
    emoji: '✍️',
    color: '#185FA5',
    order: 999,
    archived: false,
    lastUsedAt: 50,
    monthlyBudget: 0,
  }),
  Object.freeze({
    id: 'custom-inc-archived',
    name: '旧副业',
    type: 'income',
    emoji: '📦',
    color: '#5F5E5A',
    order: 999,
    archived: true,
    lastUsedAt: 0,
    monthlyBudget: 0,
  }),
])

test('filterCategories 支持类型/来源/归档任意组合筛选且不修改原数组', () => {
  const all = filterCategories(SAMPLE)
  assert.equal(all.length, 6)
  assert.notEqual(all, SAMPLE)

  assert.deepEqual(
    filterCategories(SAMPLE, { type: 'expense' }).map((c) => c.id),
    ['builtin:expense:food', 'custom-exp-1', 'custom-exp-archived'],
  )
  assert.deepEqual(
    filterCategories(SAMPLE, { type: 'income' }).map((c) => c.id),
    ['builtin:income:salary', 'custom-inc-1', 'custom-inc-archived'],
  )
  assert.deepEqual(
    filterCategories(SAMPLE, { source: 'builtin' }).map((c) => c.id),
    ['builtin:expense:food', 'builtin:income:salary'],
  )
  assert.deepEqual(
    filterCategories(SAMPLE, { source: 'custom' }).map((c) => c.id),
    ['custom-exp-1', 'custom-exp-archived', 'custom-inc-1', 'custom-inc-archived'],
  )
  assert.deepEqual(
    filterCategories(SAMPLE, { archived: 'active' }).map((c) => c.id),
    ['builtin:expense:food', 'builtin:income:salary', 'custom-exp-1', 'custom-inc-1'],
  )
  assert.deepEqual(
    filterCategories(SAMPLE, { archived: 'archived' }).map((c) => c.id),
    ['custom-exp-archived', 'custom-inc-archived'],
  )
  assert.deepEqual(
    filterCategories(SAMPLE, { type: 'expense', source: 'custom', archived: 'active' }).map(
      (c) => c.id,
    ),
    ['custom-exp-1'],
  )
  assert.deepEqual(
    filterCategories(SAMPLE, { type: 'income', source: 'custom', archived: 'archived' }).map(
      (c) => c.id,
    ),
    ['custom-inc-archived'],
  )
  assert.deepEqual(filterCategories(null), [])
})

test('summarizeSelectedUsage 聚合选中分类的有效与回收站引用', () => {
  const usageMap = {
    'custom-exp-1': { active: 3, deleted: 2, total: 5 },
    'custom-exp-archived': { active: 1, deleted: 4, total: 5 },
  }
  assert.deepEqual(summarizeSelectedUsage([SAMPLE[2], SAMPLE[3], SAMPLE[4]], usageMap), {
    active: 4,
    deleted: 6,
    total: 10,
  })
  assert.deepEqual(summarizeSelectedUsage([], usageMap), { active: 0, deleted: 0, total: 0 })
  assert.deepEqual(summarizeSelectedUsage([SAMPLE[4]], usageMap), {
    active: 0,
    deleted: 0,
    total: 0,
  })
  assert.deepEqual(summarizeSelectedUsage(null, null), { active: 0, deleted: 0, total: 0 })
})

test('getMigrationTargets 仅返回同类型、未归档、不在已选集合的目标', () => {
  // 单选支出：应含 builtin:expense:food，排除自身 custom-exp-1、已归档 custom-exp-archived、所有收入分类
  assert.deepEqual(
    getMigrationTargets(SAMPLE, new Set(['custom-exp-1'])).map((c) => c.id),
    ['builtin:expense:food'],
  )
  // 支持数组入参，并排除所有已选分类
  assert.deepEqual(
    getMigrationTargets(SAMPLE, ['custom-exp-1', 'builtin:expense:food']).map((c) => c.id),
    [],
  )
  // 选中已归档支出分类，可迁移到同类型未归档分类
  assert.deepEqual(
    getMigrationTargets(SAMPLE, new Set(['custom-exp-archived'])).map((c) => c.id),
    ['builtin:expense:food', 'custom-exp-1'],
  )
  // 跨收支类型选中时禁止迁移
  assert.deepEqual(getMigrationTargets(SAMPLE, new Set(['custom-exp-1', 'custom-inc-1'])), [])
  // 空选择或不存在的 ID 返回空
  assert.deepEqual(getMigrationTargets(SAMPLE, new Set()), [])
  assert.deepEqual(getMigrationTargets(SAMPLE, ['non-existent']), [])
  assert.deepEqual(getMigrationTargets(null, ['custom-exp-1']), [])
})

test('describeBulkStatus 逐字覆盖 5 态文案', () => {
  assert.equal(describeBulkStatus('archived'), '已归档（有引用）')
  assert.equal(describeBulkStatus('deleted'), '已删除（无引用）')
  assert.equal(describeBulkStatus('migrated-deleted'), '已迁移并删除')
  assert.equal(describeBulkStatus('protected'), '内置分类，受保护')
  assert.equal(describeBulkStatus('failed'), '失败')
  assert.equal(describeBulkStatus('unexpected'), '失败')
})

test('formatBulkCompletionToast 正确汇总全部成功与部分失败文案', () => {
  assert.equal(
    formatBulkCompletionToast([{ status: 'archived' }, { status: 'deleted' }]),
    '批量完成：2 项',
  )
  assert.equal(formatBulkCompletionToast([{ status: 'migrated-deleted' }]), '批量完成：1 项')
  assert.equal(
    formatBulkCompletionToast([{ status: 'archived' }, { status: 'failed' }]),
    '批量完成：1 项成功，1 项未执行',
  )
  assert.equal(
    formatBulkCompletionToast([
      { status: 'deleted' },
      { status: 'protected' },
      { status: 'failed' },
    ]),
    '批量完成：1 项成功，2 项未执行',
  )
  assert.equal(formatBulkCompletionToast([]), '批量完成：0 项')
})

test('validateCategoryDraft 校验空名、纯空格、6 字边界与超长名称', () => {
  assert.deepEqual(validateCategoryDraft({ name: '' }), { ok: false, message: '先填分类名称' })
  assert.deepEqual(validateCategoryDraft({ name: '   ' }), { ok: false, message: '先填分类名称' })
  assert.deepEqual(validateCategoryDraft(null), { ok: false, message: '先填分类名称' })
  assert.deepEqual(validateCategoryDraft({ name: '  咖啡  ' }), { ok: true, name: '咖啡' })
  assert.deepEqual(validateCategoryDraft({ name: '一二三四五六' }), {
    ok: true,
    name: '一二三四五六',
  })
  assert.deepEqual(validateCategoryDraft({ name: '一二三四五六七' }), {
    ok: false,
    message: '名称不超过 6 个字',
  })
})

test('buildCategoryPayload 归一化字段、保留原属性并锁定编辑态/内置分类类型', () => {
  // 新增态：默认值兜底 + 空预算/负预算/非法预算归 0
  const created = buildCategoryPayload(null, {
    name: ' 咖啡 ',
    type: 'expense',
    emoji: '   ',
    color: '',
    budget: '',
  })
  assert.deepEqual(created, {
    name: '咖啡',
    type: 'expense',
    emoji: '📦',
    color: '#5F5E5A',
    monthlyBudget: 0,
  })

  assert.equal(
    buildCategoryPayload(null, { name: '测试', type: 'income', budget: '-100' }).monthlyBudget,
    0,
  )
  assert.equal(
    buildCategoryPayload(null, { name: '测试', type: 'income', budget: 'abc' }).monthlyBudget,
    0,
  )
  assert.equal(
    buildCategoryPayload(null, { name: '测试', type: 'income', budget: 'Infinity' }).monthlyBudget,
    0,
  )
  assert.equal(
    buildCategoryPayload(null, { name: '餐饮', type: 'expense', budget: '123.45' }).monthlyBudget,
    12345,
  )

  // 编辑自定义分类：保留原字段、不修改原对象、锁定类型
  const baseCustom = {
    id: 'custom-exp-1',
    name: '咖啡',
    type: 'expense',
    emoji: '☕',
    color: '#854F0B',
    order: 999,
    archived: false,
    lastUsedAt: 80,
    createdAt: 1000,
    monthlyBudget: 20000,
  }
  const editedCustom = buildCategoryPayload(baseCustom, {
    name: '拿铁',
    type: 'income', // 即使 draft 传入不同类型，编辑态也应锁定为原类型
    emoji: '🥛',
    color: '#D85A30',
    budget: '350.5',
  })
  assert.deepEqual(editedCustom, {
    ...baseCustom,
    name: '拿铁',
    type: 'expense',
    emoji: '🥛',
    color: '#D85A30',
    monthlyBudget: 35050,
  })
  assert.equal(baseCustom.name, '咖啡')

  // 编辑内置分类：强制锁定为 canonical 收支类型
  const baseBuiltin = {
    id: 'builtin:expense:food',
    name: '餐饮',
    type: 'income', // 即使入参对象被篡改，仍锁定为 canonical expense
    emoji: '🍚',
    color: '#D85A30',
    order: 0,
    archived: false,
    lastUsedAt: 100,
    monthlyBudget: 0,
  }
  const editedBuiltin = buildCategoryPayload(baseBuiltin, {
    name: '吃饭',
    type: 'income',
    emoji: '🍜',
    color: '#D85A30',
    budget: '800',
  })
  assert.equal(editedBuiltin.id, 'builtin:expense:food')
  assert.equal(editedBuiltin.type, 'expense')
  assert.equal(editedBuiltin.name, '吃饭')
  assert.equal(editedBuiltin.monthlyBudget, 80000)
})
