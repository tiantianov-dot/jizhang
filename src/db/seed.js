/**
 * db/seed.js — 首次启动的种子数据
 *
 * 内置分类使用固定 ID（services/builtinCategories.js），跨设备稳定。
 * 是否首次初始化由 settings 的 seedVersion 标记决定：
 * - 旧库（已有分类或设置但无标记）只补缺失的默认设置并打标记，不补分类、不覆盖预算/ownerName
 * - 用户删光分类后不会复种（标记仍在）
 * - true 首次初始化：16 个固定内置分类 + 缺失的默认设置 + 标记，同一事务提交
 */

import { atomicWrite, getAll, getOne } from './index'
import { BUILTIN_CATEGORIES } from '@/services/builtinCategories'

export const SEED_MARKER_KEY = 'seedVersion'
export const SEED_VERSION = 1

function defaultSettingRows(now, existingKeys) {
  const rows = []
  if (!existingKeys.has('monthlyBudget')) {
    rows.push({ key: 'monthlyBudget', value: 0, updatedAt: now })
  }
  if (!existingKeys.has('ownerName')) {
    rows.push({ key: 'ownerName', value: '', updatedAt: now })
  }
  return rows
}

export async function seedIfEmpty() {
  const marker = await getOne('settings', SEED_MARKER_KEY)
  if (marker) return false

  const [categories, settings] = await Promise.all([getAll('categories'), getAll('settings')])
  const now = Date.now()
  const existingKeys = new Set(settings.map((row) => row.key))
  const missingSettings = defaultSettingRows(now, existingKeys)
  const markerRow = { key: SEED_MARKER_KEY, value: SEED_VERSION, updatedAt: now }

  // 旧库升级：已有任何分类或设置就说明不是首次启动；只补标记/缺失默认值
  if (categories.length > 0 || settings.length > 0) {
    await atomicWrite({ puts: { settings: [...missingSettings, markerRow] } })
    return false
  }

  const seedCategories = BUILTIN_CATEGORIES.map((category) => ({
    id: category.id,
    name: category.name,
    emoji: category.emoji,
    color: category.color,
    type: category.type,
    monthlyBudget: 0,
    order: category.order,
    archived: false,
    lastUsedAt: 0,
    createdAt: now,
    updatedAt: now,
  }))

  await atomicWrite({
    puts: {
      categories: seedCategories,
      settings: [...missingSettings, markerRow],
    },
  })
  return true
}
