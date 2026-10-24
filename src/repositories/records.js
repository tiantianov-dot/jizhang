/**
 * repositories/records.js — 账目仓库层
 *
 * records 的领域读写规则：补全默认字段、维护 updatedAt、
 * 记账后刷新分类 lastUsedAt（驱动「最近使用排前」）、软删除。
 * 字段含义见 src/models.js 的 RecordItem typedef。
 */

import { uuid, putOne, getOne, getAll, atomicWrite } from '@/db'
import { todayStr } from '@/utils/format'
import { tagWriteError } from '@/services/writeOutcome'

/**
 * 记一笔。data 至少提供 { amount(分), type, categoryId }，其余字段自动补全。
 * @param {Partial<import('@/models').RecordItem>} data
 * @returns {Promise<import('@/models').RecordItem>}
 */
export async function add(data) {
  const now = Date.now()
  const rec = {
    id: uuid(),
    amount: 0,
    type: 'expense',
    categoryId: '',
    note: '',
    date: todayStr(),
    createdAt: now,
    updatedAt: now,
    deleted: false,
    deletedAt: null,
    private: false,
    owner: 'me',
    ...data,
  }
  // 读分类失败时尚未开始写库，可确定 failed；记账 + lastUsedAt 放进同一事务，
  // 避免“record 已提交、分类更新失败”被调用方当成整笔失败。
  let cat = null
  if (rec.categoryId) {
    try {
      cat = await getOne('categories', rec.categoryId)
    } catch (err) {
      throw tagWriteError(err, 'failed')
    }
  }

  const puts = { records: [rec] }
  if (cat) {
    // 这是本地使用信号，不参与同步 —— 绝不能同时刷新 cat.updatedAt，
    // 否则「我用了一次分类」会被合并成一次分类编辑推给对方（破坏约定 5）。
    puts.categories = [{ ...cat, lastUsedAt: now }]
  }
  await atomicWrite({ puts })
  return rec
}

/** 更新（整行覆盖，updatedAt 自动刷新） */
export async function update(rec) {
  rec.updatedAt = Date.now()
  await putOne('records', rec)
  return rec
}

/** 软删除（同步友好，records 永不硬删）。deletedAt 是未来墓碑回收的依据 */
export async function softDelete(id) {
  const rec = await getOne('records', id)
  if (!rec) return null
  const now = Date.now()
  rec.deleted = true
  rec.deletedAt = now
  rec.updatedAt = now
  await putOne('records', rec)
  return rec
}

/** 撤销软删除 */
export async function restore(id) {
  const rec = await getOne('records', id)
  if (!rec) return null
  rec.deleted = false
  rec.deletedAt = null
  rec.updatedAt = Date.now()
  await putOne('records', rec)
  return rec
}

/** 全部未删除记录，按日期倒序（同日按创建时间倒序）。骨架期数据量小直接全量，后续可按 date 索引分页。 */
export async function list() {
  const all = await getAll('records')
  return all
    .filter((r) => !r.deleted)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt))
}

/**
 * 一次全量聚合各分类的引用数（含软删）。批量操作禁止对 N 个分类发 N 次 count。
 * @param {object[]} records
 * @returns {Map<string, {active: number, deleted: number, total: number}>}
 */
export function aggregateCategoryUsage(records) {
  const usage = new Map()
  for (const record of records) {
    if (!record || typeof record.categoryId !== 'string' || !record.categoryId) continue
    const row = usage.get(record.categoryId) || { active: 0, deleted: 0, total: 0 }
    if (record.deleted) row.deleted += 1
    else row.active += 1
    row.total += 1
    usage.set(record.categoryId, row)
  }
  return usage
}

/** 全量读取后聚合引用数（单次 getAll） */
export async function categoryUsage() {
  return aggregateCategoryUsage(await getAll('records'))
}

/**
 * 分类迁移的写计划：active + 软删记录全部改挂目标分类，并刷新 updatedAt。
 * 不写目标分类，因此不会刷新目标 lastUsedAt。
 * @returns {object[]}
 */
export function planCategoryMigration(records, sourceId, targetId, now = Date.now()) {
  return records
    .filter((record) => record && record.categoryId === sourceId)
    .map((record) => ({ ...record, categoryId: targetId, updatedAt: now }))
}
