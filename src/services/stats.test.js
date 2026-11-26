import test from 'node:test'
import assert from 'node:assert/strict'
import {
  budgetUsage,
  buildCategoryBudgetRows,
  buildDailyChartItems,
  buildDonutItems,
  byCategorySum,
  dailySums,
  filterByCategoryIds,
  filterByMonth,
  groupByDay,
  monthExpense,
  monthIncome,
  monthRange,
  searchRecords,
  shiftMonth,
  sumAmount,
} from '@/services/stats'

const SAMPLE_RECORDS = [
  {
    id: 'r1',
    amount: 1200,
    type: 'expense',
    categoryId: 'food',
    note: '午饭 沙拉',
    date: '2026-10-03',
  },
  {
    id: 'r2',
    amount: 3400,
    type: 'expense',
    categoryId: 'bus',
    note: 'Metro Card',
    date: '2026-10-03',
  },
  { id: 'r3', amount: 5600, type: 'expense', categoryId: 'food', note: '聚餐', date: '2026-10-01' },
  {
    id: 'r4',
    amount: 80000,
    type: 'income',
    categoryId: 'salary',
    note: '十月工资',
    date: '2026-10-01',
  },
  { id: 'r5', amount: 2500, type: 'expense', categoryId: 'food', note: '', date: '2026-09-28' },
]

test('filterByMonth：按 YYYY-MM 精确过滤，不匹配返回空数组', () => {
  const oct = filterByMonth(SAMPLE_RECORDS, '2026-10')
  assert.deepEqual(
    oct.map((r) => r.id),
    ['r1', 'r2', 'r3', 'r4'],
  )
  assert.deepEqual(filterByMonth(SAMPLE_RECORDS, '2026-11'), [])
})

test('filterByCategoryIds：空筛选返回原数组引用，支持单个 id 与多选数组', () => {
  assert.strictEqual(filterByCategoryIds(SAMPLE_RECORDS), SAMPLE_RECORDS)
  assert.strictEqual(filterByCategoryIds(SAMPLE_RECORDS, []), SAMPLE_RECORDS)
  assert.strictEqual(filterByCategoryIds(SAMPLE_RECORDS, ''), SAMPLE_RECORDS)
  assert.strictEqual(filterByCategoryIds(SAMPLE_RECORDS, ['', null]), SAMPLE_RECORDS)

  const single = filterByCategoryIds(SAMPLE_RECORDS, 'bus')
  assert.deepEqual(
    single.map((r) => r.id),
    ['r2'],
  )

  const multi = filterByCategoryIds(SAMPLE_RECORDS, ['bus', 'salary', ''])
  assert.deepEqual(
    multi.map((r) => r.id),
    ['r2', 'r4'],
  )
})

test('searchRecords：空白关键词返回原数组引用，支持忽略大小写与空备注兜底', () => {
  assert.strictEqual(searchRecords(SAMPLE_RECORDS, ''), SAMPLE_RECORDS)
  assert.strictEqual(searchRecords(SAMPLE_RECORDS, '   '), SAMPLE_RECORDS)
  assert.strictEqual(searchRecords(SAMPLE_RECORDS, null), SAMPLE_RECORDS)
  assert.strictEqual(searchRecords(SAMPLE_RECORDS, undefined), SAMPLE_RECORDS)

  const hits = searchRecords(SAMPLE_RECORDS, '  METRO ')
  assert.deepEqual(
    hits.map((r) => r.id),
    ['r2'],
  )

  const withMissingNote = [
    { id: 'x1', amount: 100, type: 'expense', categoryId: 'food', date: '2026-10-05' },
  ]
  assert.deepEqual(searchRecords(withMissingNote, '午饭'), [])
})

test('sumAmount / monthExpense / monthIncome：按收支类型整数分求和', () => {
  assert.equal(sumAmount(SAMPLE_RECORDS), 92700)
  assert.equal(sumAmount(SAMPLE_RECORDS, 'expense'), 12700)
  assert.equal(sumAmount(SAMPLE_RECORDS, 'income'), 80000)
  assert.equal(monthExpense(SAMPLE_RECORDS, '2026-10'), 10200)
  assert.equal(monthIncome(SAMPLE_RECORDS, '2026-10'), 80000)
  assert.equal(monthExpense(SAMPLE_RECORDS, '2026-11'), 0)
})

test('budgetUsage：覆盖未设预算 / 0% / 79% / 80% / 100% / 120% 封顶', () => {
  assert.deepEqual(budgetUsage(5000, 0), { pct: 0, state: 'none' })
  assert.deepEqual(budgetUsage(0, 10000), { pct: 0, state: 'ok' })
  assert.deepEqual(budgetUsage(7900, 10000), { pct: 79, state: 'ok' })
  assert.deepEqual(budgetUsage(8000, 10000), { pct: 80, state: 'warn' })
  assert.deepEqual(budgetUsage(9900, 10000), { pct: 99, state: 'warn' })
  assert.deepEqual(budgetUsage(10000, 10000), { pct: 100, state: 'over' })
  assert.deepEqual(budgetUsage(12000, 10000), { pct: 100, state: 'over' })
})

test('groupByDay：保持原倒序并仅累加当日支出', () => {
  const oct = filterByMonth(SAMPLE_RECORDS, '2026-10')
  const groups = groupByDay(oct)
  assert.deepEqual(
    groups.map((g) => ({
      day: g.day,
      ids: g.items.map((i) => i.id),
      dayExpense: g.dayExpense,
    })),
    [
      { day: '2026-10-03', ids: ['r1', 'r2'], dayExpense: 4600 },
      { day: '2026-10-01', ids: ['r3', 'r4'], dayExpense: 5600 },
    ],
  )
  assert.deepEqual(groupByDay([]), [])
})

test('monthRange：覆盖大月 / 小月 / 闰年 2 月 / 平年 2 月', () => {
  assert.deepEqual(monthRange('2026-10'), { first: '2026-10-01', last: '2026-10-31', days: 31 })
  assert.deepEqual(monthRange('2026-04'), { first: '2026-04-01', last: '2026-04-30', days: 30 })
  assert.deepEqual(monthRange('2024-02'), { first: '2024-02-01', last: '2024-02-29', days: 29 })
  assert.deepEqual(monthRange('2026-02'), { first: '2026-02-01', last: '2026-02-28', days: 28 })
})

test('shiftMonth：月内与跨年 12→1、1→12 翻月正确', () => {
  assert.equal(shiftMonth('2026-10', 1), '2026-11')
  assert.equal(shiftMonth('2026-10', -1), '2026-09')
  assert.equal(shiftMonth('2026-12', 1), '2027-01')
  assert.equal(shiftMonth('2026-01', -1), '2025-12')
  assert.equal(shiftMonth('2026-10', 5), '2027-03')
  assert.equal(shiftMonth('2026-02', -14), '2024-12')
})

test('byCategorySum：按月汇总并按金额降序排列，支持收支类型切换', () => {
  assert.deepEqual(byCategorySum(SAMPLE_RECORDS, { month: '2026-10' }), [
    { categoryId: 'food', sum: 6800 },
    { categoryId: 'bus', sum: 3400 },
  ])
  assert.deepEqual(byCategorySum(SAMPLE_RECORDS, { month: '2026-10', type: 'income' }), [
    { categoryId: 'salary', sum: 80000 },
  ])
  assert.deepEqual(byCategorySum(SAMPLE_RECORDS, { month: '2026-10', type: null }), [
    { categoryId: 'salary', sum: 80000 },
    { categoryId: 'food', sum: 6800 },
    { categoryId: 'bus', sum: 3400 },
  ])
  assert.deepEqual(byCategorySum(SAMPLE_RECORDS, { month: '2026-11' }), [])
})

test('dailySums：覆盖空月 / 纯收入月 / 大月 31 天 / 闰年 2 月 29 天', () => {
  // 空月返回空数组
  assert.deepEqual(dailySums(SAMPLE_RECORDS, '2026-11'), [])

  // 纯收入月返回全 0 数组，长度等于当月天数
  const incomeOnly = [
    { id: 'i1', amount: 50000, type: 'income', categoryId: 'salary', note: '', date: '2026-04-15' },
  ]
  const april = dailySums(incomeOnly, '2026-04')
  assert.equal(april.length, 30)
  assert.ok(april.every((d, idx) => d.day === idx + 1 && d.sum === 0))

  // 大月（31 天）：同日多笔支出累加，同日收入不计入
  const oct = dailySums(SAMPLE_RECORDS, '2026-10')
  assert.equal(oct.length, 31)
  assert.deepEqual(oct[0], { day: 1, sum: 5600 })
  assert.deepEqual(oct[1], { day: 2, sum: 0 })
  assert.deepEqual(oct[2], { day: 3, sum: 4600 })
  assert.deepEqual(oct[30], { day: 31, sum: 0 })

  // 闰年 2 月（29 天）
  const leapRecords = [
    { id: 'l1', amount: 2900, type: 'expense', categoryId: 'food', note: '', date: '2024-02-29' },
  ]
  const leapFeb = dailySums(leapRecords, '2024-02')
  assert.equal(leapFeb.length, 29)
  assert.deepEqual(leapFeb[28], { day: 29, sum: 2900 })
  assert.equal(
    leapFeb.slice(0, 28).every((d) => d.sum === 0),
    true,
  )
})

test('buildDonutItems：补全正常/归档分类颜色与标签，缺失分类兜底默认灰与未分类，不修改入参', () => {
  const catalog = new Map([
    ['food', { id: 'food', emoji: '🍜', name: '餐饮', color: '#E07A5F', archived: false }],
    ['coffee', { id: 'coffee', emoji: '☕', name: '咖啡统计', color: '#111111', archived: true }],
    ['no-color', { id: 'no-color', emoji: '🧾', name: '杂项', color: '', archived: false }],
  ])
  const catSums = [
    { categoryId: 'food', sum: 6800 },
    { categoryId: 'coffee', sum: 1500 },
    { categoryId: 'no-color', sum: 500 },
    { categoryId: 'missing-id', sum: 300 },
  ]
  const snapshot = structuredClone(catSums)

  const items = buildDonutItems(catSums, (id) => catalog.get(id))
  assert.deepEqual(items, [
    { value: 6800, color: '#E07A5F', label: '🍜 餐饮' },
    { value: 1500, color: '#111111', label: '☕ 咖啡统计' },
    { value: 500, color: '#5F5E5A', label: '🧾 杂项' },
    { value: 300, color: '#5F5E5A', label: '📦 未分类' },
  ])
  assert.deepEqual(catSums, snapshot)
})

test('buildDailyChartItems：规整 dailySums 为 { day, value }，覆盖空月/纯收入月/支出月且不修改入参', () => {
  const snapshot = structuredClone(SAMPLE_RECORDS)
  assert.deepEqual(buildDailyChartItems(SAMPLE_RECORDS, '2026-11'), [])

  const incomeOnly = [
    { id: 'i1', amount: 10000, type: 'income', categoryId: 'salary', note: '', date: '2026-06-02' },
  ]
  const june = buildDailyChartItems(incomeOnly, '2026-06')
  assert.equal(june.length, 30)
  assert.ok(june.every((d, idx) => d.day === idx + 1 && d.value === 0))

  const oct = buildDailyChartItems(SAMPLE_RECORDS, '2026-10')
  assert.equal(oct.length, 31)
  assert.deepEqual(oct[0], { day: 1, value: 5600 })
  assert.deepEqual(oct[2], { day: 3, value: 4600 })
  assert.deepEqual(SAMPLE_RECORDS, snapshot)
})

test('buildCategoryBudgetRows：仅保留设预算分类，补齐 spent 与 budgetUsage 且不修改入参', () => {
  const expenseCategories = [
    { id: 'food', emoji: '🍜', name: '餐饮', monthlyBudget: 5000 },
    { id: 'bus', emoji: '🚇', name: '交通', monthlyBudget: 4000 },
    { id: 'shop', emoji: '🛍️', name: '购物', monthlyBudget: 0 },
    { id: 'book', emoji: '📚', name: '学习', monthlyBudget: 3000 },
  ]
  const catSums = [
    { categoryId: 'food', sum: 6800 }, // 136% -> over, pct=100
    { categoryId: 'bus', sum: 3200 }, // 80% -> warn, pct=80
  ]
  const catSnapshot = structuredClone(expenseCategories)
  const sumSnapshot = structuredClone(catSums)

  const rows = buildCategoryBudgetRows(expenseCategories, catSums)
  assert.deepEqual(rows, [
    { id: 'food', emoji: '🍜', name: '餐饮', spent: 6800, budget: 5000, pct: 100, state: 'over' },
    { id: 'bus', emoji: '🚇', name: '交通', spent: 3200, budget: 4000, pct: 80, state: 'warn' },
    { id: 'book', emoji: '📚', name: '学习', spent: 0, budget: 3000, pct: 0, state: 'ok' },
  ])
  assert.deepEqual(expenseCategories, catSnapshot)
  assert.deepEqual(catSums, sumSnapshot)
})
