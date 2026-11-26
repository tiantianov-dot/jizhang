/**
 * services/categoryManagement.js — 分类管理与批量操作的纯函数层（不碰 db / store / UI）
 *
 * 收口多维筛选、引用计数聚合、迁移目标过滤、批量状态文案、表单校验与 payload 归一化。
 * 所有函数不修改入参对象或数组。
 */
import { builtinTypeOf, isBuiltinCategory } from '@/services/builtinCategories'
import { toFen } from '@/utils/format'

/**
 * 按收支类型 / 来源（内置或自定义）/ 归档状态多维筛选分类列表
 *
 * @param {import('@/models').Category[]} list
 * @param {{ type?: 'all'|'expense'|'income', source?: 'all'|'builtin'|'custom', archived?: 'all'|'active'|'archived' }} [filters]
 * @returns {import('@/models').Category[]}
 */
export function filterCategories(list, { type = 'all', source = 'all', archived = 'all' } = {}) {
  if (!Array.isArray(list)) return []
  return list.filter((c) => {
    if (type !== 'all' && c.type !== type) return false
    if (source === 'builtin' && !isBuiltinCategory(c)) return false
    if (source === 'custom' && isBuiltinCategory(c)) return false
    if (archived === 'active' && c.archived) return false
    if (archived === 'archived' && !c.archived) return false
    return true
  })
}

/**
 * 聚合已选分类的有效/回收站/总计引用数
 *
 * @param {import('@/models').Category[]} selectedCats
 * @param {Record<string, { active?: number, deleted?: number, total?: number }>} [usageMap]
 * @returns {{ active: number, deleted: number, total: number }}
 */
export function summarizeSelectedUsage(selectedCats, usageMap = {}) {
  let active = 0
  let deleted = 0
  if (Array.isArray(selectedCats) && usageMap && typeof usageMap === 'object') {
    for (const c of selectedCats) {
      if (!c) continue
      const usage = usageMap[c.id]
      if (!usage) continue
      active += usage.active || 0
      deleted += usage.deleted || 0
    }
  }
  return { active, deleted, total: active + deleted }
}

/**
 * 计算可用的批量迁移目标：同收支类型、未归档、且不在已选集合；
 * 未选分类或已选跨越支出/收入两种类型时返回空数组。
 *
 * @param {import('@/models').Category[]} allCategories
 * @param {Set<string>|string[]} selectedIds
 * @returns {import('@/models').Category[]}
 */
export function getMigrationTargets(allCategories, selectedIds) {
  if (!Array.isArray(allCategories)) return []
  const picked = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || [])
  if (!picked.size) return []
  const selectedTypes = new Set()
  for (const c of allCategories) {
    if (picked.has(c.id)) selectedTypes.add(c.type)
  }
  if (selectedTypes.size !== 1) return []
  const [type] = selectedTypes
  return allCategories.filter((c) => c.type === type && !c.archived && !picked.has(c.id))
}

/**
 * 批量操作逐项状态文案（5 态）
 *
 * @param {string} status
 * @returns {string}
 */
export function describeBulkStatus(status) {
  if (status === 'archived') return '已归档（有引用）'
  if (status === 'deleted') return '已删除（无引用）'
  if (status === 'migrated-deleted') return '已迁移并删除'
  if (status === 'protected') return '内置分类，受保护'
  return '失败'
}

/**
 * 批量操作完成后的 toast 摘要文案
 *
 * @param {Array<{ status?: string }>} results
 * @returns {string}
 */
export function formatBulkCompletionToast(results) {
  const list = Array.isArray(results) ? results : []
  const blocked = list.filter(
    (item) => item?.status === 'failed' || item?.status === 'protected',
  ).length
  return blocked
    ? `批量完成：${list.length - blocked} 项成功，${blocked} 项未执行`
    : `批量完成：${list.length} 项`
}

/**
 * 校验分类表单草稿（名称非空且不超过 6 字）
 *
 * @param {{ name?: string }} draft
 * @returns {{ ok: true, name: string } | { ok: false, message: string }}
 */
export function validateCategoryDraft(draft) {
  const name = String(draft?.name ?? '').trim()
  if (!name) {
    return { ok: false, message: '先填分类名称' }
  }
  if (name.length > 6) {
    return { ok: false, message: '名称不超过 6 个字' }
  }
  return { ok: true, name }
}

/**
 * 将表单草稿归一化为可保存的分类对象（不修改 baseCat 或 draft）。
 * 编辑态保留原分类的 id / order / lastUsedAt / archived 等字段，并锁定收支类型
 * （内置分类始终以 canonical 类型为准）。
 *
 * @param {import('@/models').Category|null|undefined} baseCat
 * @param {{ name?: string, type?: 'expense'|'income', emoji?: string, color?: string, budget?: string|number }} draft
 * @returns {object}
 */
export function buildCategoryPayload(baseCat, draft) {
  const lockedType = baseCat ? builtinTypeOf(baseCat.id) || baseCat.type : null
  const type = lockedType || draft?.type || 'expense'
  const fen = toFen(draft?.budget)
  const monthlyBudget = Number.isFinite(fen) ? Math.max(0, fen) : 0
  return {
    ...(baseCat || null),
    name: String(draft?.name ?? '').trim(),
    type,
    emoji: String(draft?.emoji ?? '').trim() || '📦',
    color: String(draft?.color ?? '').trim() || '#5F5E5A',
    monthlyBudget,
  }
}
