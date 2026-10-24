/**
 * repositories/categories.js — 分类仓库层
 *
 * 排序规则：lastUsedAt 降序优先，其次 order 升序 —— 这是「3 秒记账」的核心体验。
 * 删除策略：有流水引用的分类只归档（archived），无引用才硬删。
 * 字段含义见 src/models.js 的 Category typedef。
 */

import { uuid, putOne, getOne, getAll, deleteOne } from '@/db'
import { countByCategory } from './records'
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
  const cat = await getOne('categories', id)
  if (!cat) throw new Error('分类不存在')
  if (isBuiltinId(cat.id)) throw new Error('内置分类受保护，不能删除')
  const used = await countByCategory(id)
  if (used > 0) {
    cat.archived = true
    cat.updatedAt = Date.now()
    await putOne('categories', cat)
    return 'archived'
  }
  await deleteOne('categories', id)
  return 'deleted'
}
