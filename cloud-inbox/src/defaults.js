/**
 * defaults.js — 默认分类兜底与服务边界常量
 *
 * 与前端 src/services/builtinCategories.js 的 16 个内置分类名称严格对齐：
 * 支出 11 项、收入 5 项。
 */

export const DEFAULT_EXPENSE_CATEGORIES = Object.freeze([
  '餐饮',
  '交通',
  '购物',
  '日用',
  '居住',
  '娱乐',
  '医疗',
  '社交',
  '学习',
  '通讯',
  '其他',
])

export const DEFAULT_INCOME_CATEGORIES = Object.freeze(['工资', '兼职', '理财', '红包', '其他'])

export const DEFAULT_CATEGORIES = Object.freeze({
  expense: DEFAULT_EXPENSE_CATEGORIES,
  income: DEFAULT_INCOME_CATEGORIES,
})

export const DEFAULT_TIMEZONE = 'Asia/Shanghai'
export const MAX_BODY_BYTES = 65536
export const MAX_NOTE_LENGTH = 30
export const MAX_AMOUNT = 9999999.99
export const MAX_CATEGORY_COUNT = 100
export const MAX_CATEGORY_NAME_LENGTH = 30

/**
 * 规整并截断单一收支分类清单（trim、去重、过滤空串、限制数量与字长）。
 * @param {unknown} list
 * @returns {string[]}
 */
export function sanitizeCategoryList(list) {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  const out = []
  for (const item of list) {
    if (typeof item !== 'string') continue
    const name = item.trim().slice(0, MAX_CATEGORY_NAME_LENGTH)
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push(name)
    if (out.length >= MAX_CATEGORY_COUNT) break
  }
  return out
}

/**
 * 读取已保存分类，缺失或为空时回落至 16 个内置默认分类。
 * @param {{ expense?: string[], income?: string[] } | null | undefined} stored
 * @returns {{ expense: string[], income: string[] }}
 */
export function resolveCategories(stored) {
  const expense = sanitizeCategoryList(stored?.expense)
  const income = sanitizeCategoryList(stored?.income)
  return {
    expense: expense.length > 0 ? expense : [...DEFAULT_EXPENSE_CATEGORIES],
    income: income.length > 0 ? income : [...DEFAULT_INCOME_CATEGORIES],
  }
}
