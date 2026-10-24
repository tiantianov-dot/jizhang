import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BUILTIN_CATEGORIES,
  fingerprintOf,
  getBuiltinByFingerprint,
  getBuiltinById,
  isBuiltinCategory,
  isBuiltinId,
} from './builtinCategories.js'

function canonical(id) {
  const found = getBuiltinById(id)
  assert.ok(found, `canonical ${id} 必须存在`)
  return { ...found }
}

test('16 个内置分类：支出 11 + 收入 5，ID 稳定且 order 唯一', () => {
  assert.equal(BUILTIN_CATEGORIES.length, 16)
  assert.equal(BUILTIN_CATEGORIES.filter((c) => c.type === 'expense').length, 11)
  assert.equal(BUILTIN_CATEGORIES.filter((c) => c.type === 'income').length, 5)
  assert.equal(new Set(BUILTIN_CATEGORIES.map((c) => c.id)).size, 16)
  assert.equal(new Set(BUILTIN_CATEGORIES.map((c) => c.order)).size, 16)
  for (const category of BUILTIN_CATEGORIES) {
    assert.match(category.id, /^builtin:(expense|income):[a-z]+$/)
    assert.equal(isBuiltinId(category.id), true)
    assert.equal(getBuiltinById(category.id)?.id, category.id)
    assert.equal(isBuiltinCategory(category), true)
  }
})

test('指纹必须五字段全等：任一字段变化都不再识别为内置', () => {
  const food = canonical('builtin:expense:food')
  assert.equal(getBuiltinByFingerprint(food)?.id, food.id)
  for (const [field, value] of [
    ['type', 'income'],
    ['name', '吃饭'],
    ['emoji', '🍜'],
    ['color', '#000000'],
    ['order', 99],
  ]) {
    assert.equal(
      getBuiltinByFingerprint({ ...food, [field]: value }),
      null,
      `${field} 变化必须失配`,
    )
  }
})

test('两个「其他」按收支类型区分，兼职/红包按完整指纹区分', () => {
  const expenseOther = canonical('builtin:expense:other')
  const incomeOther = canonical('builtin:income:other')
  assert.equal(expenseOther.name, incomeOther.name)
  assert.equal(getBuiltinByFingerprint(expenseOther)?.id, expenseOther.id)
  assert.equal(getBuiltinByFingerprint(incomeOther)?.id, incomeOther.id)

  const parttime = canonical('builtin:income:parttime')
  const redpacket = canonical('builtin:income:redpacket')
  assert.equal(parttime.emoji, redpacket.emoji)
  assert.notEqual(fingerprintOf(parttime), fingerprintOf(redpacket))
  assert.equal(getBuiltinByFingerprint(parttime)?.id, parttime.id)
  assert.equal(getBuiltinByFingerprint(redpacket)?.id, redpacket.id)
})

test('未知 builtin 前缀与类型不一致都不算默认分类', () => {
  assert.equal(isBuiltinId('builtin:expense:nope'), true)
  assert.equal(getBuiltinById('builtin:expense:nope'), null)
  assert.equal(isBuiltinCategory({ id: 'builtin:expense:nope', type: 'expense' }), false)
  assert.equal(
    isBuiltinCategory({ id: 'builtin:expense:food', type: 'income', name: '餐饮' }),
    false,
  )
  assert.equal(isBuiltinCategory({ id: 'crypto-uuid', type: 'expense' }), false)
})

test('内置分类改名/改图标后仍按 ID 识别为默认', () => {
  const renamed = {
    ...canonical('builtin:expense:food'),
    name: '吃喝',
    emoji: '🍜',
    color: '#123456',
    monthlyBudget: 5000,
  }
  assert.equal(isBuiltinCategory(renamed), true)
  assert.equal(getBuiltinByFingerprint(renamed), null)
})
