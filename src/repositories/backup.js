/**
 * repositories/backup.js — 导出 / 导入 JSON（防清缓存丢数据的底线功能）
 *
 * 导出：三表全量快照。
 * 导入：合并规则集中在 services/merge.js —— records/categories 按 id 对齐、
 * updatedAt 新者胜；settings 直接覆盖。
 * 注意：导入的记录若带 deleted/private 标记会原样保留（与同步语义一致）。
 */

import { getAll, putOne } from '@/db'
import { mergeCategories, mergeRecords } from '@/services/merge'

const APP_TAG = 'jizhang'
const BACKUP_VERSION = 1

export async function exportAll() {
  const [records, categories, settings] = await Promise.all([
    getAll('records'),
    getAll('categories'),
    getAll('settings'),
  ])
  return { app: APP_TAG, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), records, categories, settings }
}

/**
 * @param {Object} payload exportAll() 产出的对象
 * @returns {Promise<{added: number, updated: number}>} records 的合并统计
 */
export async function importMerge(payload) {
  if (!payload || payload.app !== APP_TAG) throw new Error('不是本应用的备份文件')

  const [localRecords, localCategories] = await Promise.all([
    getAll('records'),
    getAll('categories'),
  ])
  const mergedRecords = mergeRecords(localRecords, payload.records)
  const mergedCategories = mergeCategories(localCategories, payload.categories)

  for (const rec of mergedRecords.puts) await putOne('records', rec)
  for (const cat of mergedCategories.puts) await putOne('categories', cat)
  for (const row of payload.settings || []) await putOne('settings', row)

  return { added: mergedRecords.added, updated: mergedRecords.updated }
}
