/**
 * db/seed.js — 首次启动的种子数据
 *
 * 仅当 categories 为空（= 首次启动）时写入默认分类与默认设置；
 * 用户删光分类后不会被反复重建（count > 0 即跳过）。
 */

import { open, tx, wrap, uuid } from './index'

/** 默认分类：支出 11 个 + 收入 5 个；order 按声明顺序 */
const SEED_CATEGORIES = [
  // 支出
  { name: '餐饮', emoji: '🍚', color: '#D85A30', type: 'expense' },
  { name: '交通', emoji: '🚌', color: '#185FA5', type: 'expense' },
  { name: '购物', emoji: '🛍️', color: '#993556', type: 'expense' },
  { name: '日用', emoji: '🧻', color: '#854F0B', type: 'expense' },
  { name: '居住', emoji: '🏠', color: '#534AB7', type: 'expense' },
  { name: '娱乐', emoji: '🎮', color: '#0F6E56', type: 'expense' },
  { name: '医疗', emoji: '💊', color: '#A32D2D', type: 'expense' },
  { name: '社交', emoji: '🎁', color: '#D4537E', type: 'expense' },
  { name: '学习', emoji: '📚', color: '#3B6D11', type: 'expense' },
  { name: '通讯', emoji: '📱', color: '#378ADD', type: 'expense' },
  { name: '其他', emoji: '📦', color: '#5F5E5A', type: 'expense' },
  // 收入
  { name: '工资', emoji: '💰', color: '#0F6E56', type: 'income' },
  { name: '兼职', emoji: '🧧', color: '#BA7517', type: 'income' },
  { name: '理财', emoji: '📈', color: '#993C1D', type: 'income' },
  { name: '红包', emoji: '🧧', color: '#E24B4A', type: 'income' },
  { name: '其他', emoji: '📦', color: '#5F5E5A', type: 'income' },
]

export async function seedIfEmpty() {
  const count = await wrap((await open()).transaction('categories').objectStore('categories').count())
  if (count > 0) return

  const now = Date.now()
  await tx('categories', 'readwrite', (s) => {
    SEED_CATEGORIES.forEach((c, i) => {
      s.put({
        id: uuid(),
        ...c,
        monthlyBudget: 0,
        order: i,
        archived: false,
        lastUsedAt: 0,
        createdAt: now,
        updatedAt: now,
      })
    })
  })
  await tx('settings', 'readwrite', (s) => {
    s.put({ key: 'monthlyBudget', value: 0 }) // 月度总预算（分），0 = 不设
    s.put({ key: 'ownerName', value: '' })
  })
}
