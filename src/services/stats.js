/**
 * services/stats.js — 统计计算（纯函数，可单测；不碰 store、不碰 db）
 *
 * 所有函数只接收普通数组/数字入参，金额单位一律为「分」。
 * 图表页、预算页、流水分组都从这里取数，保证口径一致。
 */
import { toDateStr } from '@/utils/format'

/**
 * 按月过滤记录。month 形如 "2026-10"。
 * @param {import('@/models').RecordItem[]} records
 */
export function filterByMonth(records, month) {
  return records.filter((r) => r.date.startsWith(month))
}

/**
 * 按分类筛选记录。
 * @param {import('@/models').RecordItem[]} records
 * @param {string[]|string} [ids] 分类 id 集合（单个 id 也接受）；空数组/未传 = 不筛选
 * @returns 原数组引用（不筛选时）或新数组
 */
export function filterByCategoryIds(records, ids) {
  const list = (Array.isArray(ids) ? ids : ids ? [ids] : []).filter(Boolean)
  if (!list.length) return records
  const wanted = new Set(list)
  return records.filter((r) => wanted.has(r.categoryId))
}

/**
 * 备注关键词搜索（不区分大小写）。
 * keyword trim 后为空 → 原样返回入参（不做无谓拷贝，避免下游 computed 频繁抖动）。
 * @param {import('@/models').RecordItem[]} records
 * @param {string} keyword
 */
export function searchRecords(records, keyword) {
  const kw = String(keyword ?? '')
    .trim()
    .toLowerCase()
  if (!kw) return records
  return records.filter((r) => (r.note || '').toLowerCase().includes(kw))
}

/** 求和：可按 type ('expense'|'income') 过滤；不传 type 则全部求和 */
export function sumAmount(records, type = null) {
  return records.reduce((sum, r) => (type && r.type !== type ? sum : sum + r.amount), 0)
}

/** 月支出合计（分） */
export function monthExpense(records, month) {
  return sumAmount(filterByMonth(records, month), 'expense')
}

/** 月收入合计（分） */
export function monthIncome(records, month) {
  return sumAmount(filterByMonth(records, month), 'income')
}

/**
 * 预算用量。
 * @param {number} expenseFen 当期支出（分）
 * @param {number} budgetFen  预算（分），0 = 未设置
 * @returns {{ pct: number, state: 'none'|'ok'|'warn'|'over' }}
 *   pct 封顶 100；state：80% 起 warn、100% 起 over（与 UI 黄/红约定一致）
 */
export function budgetUsage(expenseFen, budgetFen) {
  if (!budgetFen) return { pct: 0, state: 'none' }
  const raw = expenseFen / budgetFen
  return {
    pct: Math.min(100, Math.round(raw * 100)),
    state: raw >= 1 ? 'over' : raw >= 0.8 ? 'warn' : 'ok',
  }
}

/**
 * 按天分组（输入需已按日期倒序；输出保持倒序）。
 * @returns {{ day: string, items: import('@/models').RecordItem[], dayExpense: number }[]}
 */
export function groupByDay(records) {
  const map = new Map()
  for (const r of records) {
    if (!map.has(r.date)) map.set(r.date, [])
    map.get(r.date).push(r)
  }
  return [...map.entries()].map(([day, items]) => ({
    day,
    items,
    dayExpense: sumAmount(items, 'expense'),
  }))
}

/* ---------- 月份区间与翻月（统计页月份切换用，日期一律本地时区） ---------- */

/**
 * 月份区间。month 形如 "2026-10"。
 * @returns {{ first: string, last: string, days: number }} 首日/末日 YYYY-MM-DD 与该月天数
 */
export function monthRange(month) {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0) // 下个月第 0 天 = 本月最后一天（自动处理大小月/闰年）
  return { first: toDateStr(new Date(y, m - 1, 1)), last: toDateStr(last), days: last.getDate() }
}

/**
 * 前后翻月。shiftMonth('2026-10', 1) → '2026-11'；'2026-12' + 1 → '2027-01'。
 * @param {string} month 形如 "2026-10"
 * @param {number} delta 正数向后、负数向前
 */
export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/* ---------- 图表取数（组件只做展示，图表数据全部由此产出） ---------- */

/**
 * 按月、按分类汇总。消费方用 categories.byId 补 name/emoji/color
 * （byId 查全量，归档分类的历史账目必须出现在占比里）。
 * @param {import('@/models').RecordItem[]} records
 * @param {{ month: string, type?: 'expense'|'income' }} opts
 * @returns {{ categoryId: string, sum: number }[]} 按金额降序
 */
export function byCategorySum(records, { month, type = 'expense' } = {}) {
  const map = new Map()
  for (const r of filterByMonth(records, month)) {
    if (type && r.type !== type) continue
    map.set(r.categoryId, (map.get(r.categoryId) || 0) + r.amount)
  }
  return [...map.entries()]
    .map(([categoryId, sum]) => ({ categoryId, sum }))
    .sort((a, b) => b.sum - a.sum)
}

/**
 * 每日支出汇总。全月无账目返回空数组（页面据此显示空态）；
 * 有账目但全是收入时返回全 0 数组（柱图全部落在基线，不产生 NaN）。
 * @returns {{ day: number, sum: number }[]} day 为 1..当月天数
 */
export function dailySums(records, month) {
  const inMonth = filterByMonth(records, month)
  if (!inMonth.length) return []
  const { days } = monthRange(month)
  const out = Array.from({ length: days }, (_, i) => ({ day: i + 1, sum: 0 }))
  for (const r of inMonth) {
    if (r.type !== 'expense') continue
    const day = Number(r.date.slice(8, 10))
    if (day >= 1 && day <= days) out[day - 1].sum += r.amount
  }
  return out
}
