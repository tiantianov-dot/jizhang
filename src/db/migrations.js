/**
 * db/migrations.js — 本地一次性迁移：旧随机默认分类 ID → 固定内置 ID
 *
 * 旧库的默认分类是运行时 UUID，跨设备必然不同。迁移条件极其保守：
 * 仅当 type + name + emoji + color + order 与 canonical 完全一致、
 * 该指纹在本地只有一个候选、且目标固定 ID 尚不存在时才 rekey；
 * 改名/歧义/目标已存在一律保留为自定义。
 *
 * 分类 rekey、records.categoryId 改写（含软删）与完成标记在同一个多 store
 * 事务内提交；失败全部回滚，下次启动重试。
 */

import { atomicWrite, getAll, getOne } from './index'
import { getBuiltinByFingerprint, isBuiltinId } from '@/services/builtinCategories'

export const BUILTIN_IDENTITY_KEY = 'builtinIdentityVersion'
export const BUILTIN_IDENTITY_VERSION = 1

/**
 * @returns {Promise<{skipped: boolean, rekeyed: string[], records: number, conflicts: object[]}>}
 */
export async function migrateBuiltinIdentity() {
  const marker = await getOne('settings', BUILTIN_IDENTITY_KEY)
  if (marker && marker.value === BUILTIN_IDENTITY_VERSION) {
    return { skipped: true, rekeyed: [], records: 0, conflicts: [] }
  }

  const [categories, records] = await Promise.all([getAll('categories'), getAll('records')])
  const existingIds = new Set(categories.filter((c) => c?.id).map((c) => c.id))
  const now = Date.now()

  const groups = new Map()
  for (const category of categories) {
    if (!category || isBuiltinId(category.id)) continue
    const canonical = getBuiltinByFingerprint(category)
    if (!canonical) continue
    if (existingIds.has(canonical.id)) continue
    if (!groups.has(canonical.id)) groups.set(canonical.id, [])
    groups.get(canonical.id).push(category)
  }

  const mapping = new Map()
  const conflicts = []
  for (const [targetId, candidates] of groups) {
    if (candidates.length !== 1) {
      conflicts.push({
        targetId,
        ids: candidates.map((category) => category.id),
        reason: '同一指纹存在多个候选，保留为自定义',
      })
      continue
    }
    mapping.set(candidates[0].id, targetId)
  }

  const markerRow = {
    key: BUILTIN_IDENTITY_KEY,
    value: BUILTIN_IDENTITY_VERSION,
    updatedAt: now,
  }

  if (!mapping.size) {
    await atomicWrite({ puts: { settings: [markerRow] } })
    return { skipped: false, rekeyed: [], records: 0, conflicts }
  }

  const categoryWrites = []
  const categoryDeletes = []
  for (const [oldId, targetId] of mapping) {
    const source = categories.find((category) => category.id === oldId)
    categoryWrites.push({ ...source, id: targetId })
    categoryDeletes.push(oldId)
  }

  const recordWrites = []
  for (const record of records) {
    const targetId = mapping.get(record.categoryId)
    if (!targetId) continue
    recordWrites.push({ ...record, categoryId: targetId, updatedAt: now })
  }

  await atomicWrite({
    puts: {
      categories: categoryWrites,
      records: recordWrites,
      settings: [markerRow],
    },
    deletes: { categories: categoryDeletes },
  })

  return {
    skipped: false,
    rekeyed: categoryWrites.map((category) => category.id),
    records: recordWrites.length,
    conflicts,
  }
}
