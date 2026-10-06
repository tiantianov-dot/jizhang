/**
 * repositories/records.js — 账目仓库层
 *
 * records 的领域读写规则：补全默认字段、维护 updatedAt、
 * 记账后刷新分类 lastUsedAt（驱动「最近使用排前」）、软删除。
 * 字段含义见 src/models.js 的 RecordItem typedef。
 */

import { uuid, putOne, getOne, getAll, countByIndex } from '@/db'
import { todayStr } from '@/utils/format'

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
    private: false,
    ...data,
  }
  await putOne('records', rec)

  // 驱动「最近使用排序」：记账即刷新分类的 lastUsedAt
  if (rec.categoryId) {
    const cat = await getOne('categories', rec.categoryId)
    if (cat) {
      cat.lastUsedAt = now
      cat.updatedAt = now
      await putOne('categories', cat)
    }
  }
  return rec
}

/** 更新（整行覆盖，updatedAt 自动刷新） */
export async function update(rec) {
  rec.updatedAt = Date.now()
  await putOne('records', rec)
  return rec
}

/** 软删除（同步友好，records 永不硬删） */
export async function softDelete(id) {
  const rec = await getOne('records', id)
  if (!rec) return null
  rec.deleted = true
  rec.updatedAt = Date.now()
  await putOne('records', rec)
  return rec
}

/** 撤销软删除 */
export async function restore(id) {
  const rec = await getOne('records', id)
  if (!rec) return null
  rec.deleted = false
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

/** 引用某分类的记录数（分类删除策略用：>0 只归档不硬删） */
export async function countByCategory(categoryId) {
  return countByIndex('records', 'categoryId', categoryId)
}
