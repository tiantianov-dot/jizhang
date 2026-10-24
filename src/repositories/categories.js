/**
 * repositories/categories.js — 分类仓库层
 *
 * 排序规则：lastUsedAt 降序优先，其次 order 升序 —— 这是「3 秒记账」的核心体验。
 * 删除策略：有流水引用的分类只归档（archived），无引用才硬删。
 * 字段含义见 src/models.js 的 Category typedef。
 */

import { uuid, putOne, getOne, getAll, deleteOne, atomicWrite } from '@/db'
import { aggregateCategoryUsage, categoryUsage, planCategoryMigration } from './records'
import { getBuiltinById, isBuiltinId } from '@/services/builtinCategories'

/** 未归档分类列表：最近使用排前，未用过的按 order（记账/编辑页分类格用） */
export async function list() {
  const all = await getAll('categories')
  return all
    .filter((c) => !c.archived)
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt || a.order - b.order)
}

/**
 * 全部分类（含已归档）：排序规则同 list()。
 * 归档分类必须一并载入内存，否则历史流水按 categoryId 查名会退化成「未分类」。
 */
export async function listAll() {
  const all = await getAll('categories')
  return all.sort((a, b) => b.lastUsedAt - a.lastUsedAt || a.order - b.order)
}

/** 新增或更新分类（无 id 视为新增并补全默认字段） */
export async function save(cat) {
  if (isBuiltinId(cat.id)) {
    const builtin = getBuiltinById(cat.id)
    if (!builtin) throw new Error('未知的内置分类 ID')
    const existing = await getOne('categories', cat.id)
    if (!existing) throw new Error('内置分类只能由系统创建')
    // 内置分类允许改名/图标/预算，但收支类型锁定
    cat.type = builtin.type
  }
  cat.updatedAt = Date.now()
  if (!cat.id) {
    cat.id = uuid()
    cat.createdAt = cat.updatedAt
    cat.lastUsedAt = 0
    cat.archived = false
    cat.monthlyBudget = cat.monthlyBudget || 0
    cat.order = cat.order ?? 999
  }
  await putOne('categories', cat)
  return cat
}

/**
 * 删除分类。
 * 内置分类在 repository 层硬拒绝（不只靠 UI disabled）。
 * @returns {Promise<'archived'|'deleted'>} 有流水引用 → 归档；无引用 → 硬删
 */
export async function remove(id) {
  const [cat, usage] = await Promise.all([getOne('categories', id), categoryUsage()])
  if (!cat) throw new Error('分类不存在')
  return archiveOrRemoveCategory(cat, usage)
}

/** 单分类归档/删除（供 remove 与 bulk 复用；内置保护在此再验一次） */
async function archiveOrRemoveCategory(cat, usageById) {
  if (isBuiltinId(cat.id)) throw new Error('内置分类受保护，不能删除')
  const used = usageById.get(cat.id)?.total || 0
  if (used > 0) {
    await putOne('categories', { ...cat, archived: true, updatedAt: Date.now() })
    return 'archived'
  }
  await deleteOne('categories', cat.id)
  return 'deleted'
}

/** @returns {Promise<'archived'|'deleted'>} */
export async function archiveOrRemoveOne(id) {
  const [cat, usage] = await Promise.all([getOne('categories', id), categoryUsage()])
  if (!cat) throw new Error('分类不存在')
  return archiveOrRemoveCategory(cat, usage)
}

/**
 * 迁移一个分类的全部 active + 软删账目到目标，再硬删已归零的源分类。
 * 同 type、目标未归档、目标不在源集合；不写目标分类，故不刷新 lastUsedAt。
 * @returns {Promise<'migrated-deleted'>}
 */
export async function migrateAndRemoveOne(sourceId, targetId) {
  const [source, target, records] = await Promise.all([
    getOne('categories', sourceId),
    getOne('categories', targetId),
    getAll('records'),
  ])
  const result = await migrateAndRemoveCategory(source, target, records)
  return result.status
}

async function migrateAndRemoveCategory(source, target, records) {
  if (!source) throw new Error('源分类不存在')
  if (!target) throw new Error('迁移目标不存在')
  if (isBuiltinId(source.id)) throw new Error('内置分类受保护，不能删除')
  if (source.id === target.id) throw new Error('目标不能是源分类本身')
  if (target.archived) throw new Error('迁移目标已归档')
  if (target.type !== source.type) throw new Error('迁移目标收支类型不一致')

  const recordWrites = planCategoryMigration(records, source.id, target.id)
  await atomicWrite({
    puts: { records: recordWrites },
    deletes: { categories: [source.id] },
  })
  return { status: 'migrated-deleted', migrated: recordWrites.length }
}

/**
 * 批量分类操作。每个源分类独立事务：单项失败只回滚该项并继续。
 * @param {{ids: string[], mode: 'archive-remove'|'migrate-remove', targetId?: string}} params
 * @returns {Promise<{results: {id: string, status: string, error?: string, migrated?: number}[]}>}
 */
export async function bulkCategories({ ids, mode, targetId } = {}) {
  const uniqueIds = Array.isArray(ids)
    ? [...new Set(ids.filter((id) => typeof id === 'string' && id))]
    : []
  if (!uniqueIds.length) return { results: [] }
  if (mode !== 'archive-remove' && mode !== 'migrate-remove') {
    throw new Error('未知的批量操作类型')
  }
  if (mode === 'migrate-remove' && !targetId) throw new Error('先选择迁移目标')
  if (mode === 'migrate-remove' && uniqueIds.includes(targetId)) {
    throw new Error('迁移目标不能在被选分类中')
  }

  const [allCategories, records] = await Promise.all([getAll('categories'), getAll('records')])
  const catById = new Map(allCategories.map((cat) => [cat.id, cat]))
  const usageById = aggregateCategoryUsage(records)
  const target = targetId ? catById.get(targetId) : null
  const results = []

  for (const id of uniqueIds) {
    if (isBuiltinId(id)) {
      results.push({ id, status: 'protected', error: '内置分类受保护，不能删除' })
      continue
    }
    const cat = catById.get(id)
    if (!cat) {
      results.push({ id, status: 'failed', error: '分类不存在' })
      continue
    }
    try {
      if (mode === 'archive-remove') {
        const status = await archiveOrRemoveCategory(cat, usageById)
        results.push({ id, status })
      } else {
        const out = await migrateAndRemoveCategory(cat, target, records)
        results.push({ id, status: out.status, migrated: out.migrated })
      }
    } catch (err) {
      results.push({ id, status: 'failed', error: err.message })
    }
  }
  return { results }
}
