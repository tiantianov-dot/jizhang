/**
 * repositories/backup.js — 导出 / 导入 JSON（防清缓存丢数据的底线功能）
 *
 * 导出：records/categories 按 purpose 区分——backup（默认，本地换机）保留 private，
 * sync/share 剔除 private；settings 永远走键白名单（lastBackupAt / syncConfig
 * 及未来未知键永不外发）。
 * 导入：合并规则集中在 services/merge.js —— records/categories 按 id 对齐、
 * updatedAt 新者胜；settings 同样只落白名单键，旧备份不能回滚设备本地状态。
 * 注意：导入的记录若带 deleted/private 标记会原样保留（与同步语义一致）。
 */

import { getAll, putOne } from '@/db'
import { mergeCategories, mergeRecords } from '@/services/merge'

const APP_TAG = 'jizhang'
const BACKUP_VERSION = 1

/** 可导出的 settings 键（fail-closed：不在名单里的键一律不导出/不导入） */
const EXPORTABLE_SETTING_KEYS = new Set([
  'monthlyBudget',
  'ownerName',
  'uiGlassIntensity',
  'uiGlassDim',
])

function isExportableSetting(row) {
  return !!row && EXPORTABLE_SETTING_KEYS.has(row.key)
}

/**
 * @param {{ purpose?: 'backup' | 'sync' }} [options]
 * backup：本地换机快照，含 private（否则恢复时静默丢账）
 * sync：跨设备共享，剔除 private
 */
export async function exportAll({ purpose = 'backup' } = {}) {
  const [records, categories, settings] = await Promise.all([
    getAll('records'),
    getAll('categories'),
    getAll('settings'),
  ])
  const exportedRecords = purpose === 'backup' ? records : records.filter((r) => !r.private)
  return {
    app: APP_TAG,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    records: exportedRecords,
    categories,
    settings: settings.filter(isExportableSetting),
  }
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
  for (const row of (payload.settings || []).filter(isExportableSetting)) {
    await putOne('settings', row)
  }

  return { added: mergedRecords.added, updated: mergedRecords.updated }
}
