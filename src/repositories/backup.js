/**
 * repositories/backup.js — 导出 / 导入 JSON（防清缓存丢数据的底线功能）
 *
 * 导出：version 2；records/categories 按 purpose 区分——backup（默认，本地换机）
 * 保留 private 与软删墓碑，sync/share 剔除 private；settings 永远走键白名单
 * （lastBackupAt / builtinIdentityVersion / seedVersion / syncConfig 永不外发）。
 *
 * 导入：校验、映射、settings 决策全部由 services/importPlanner.js 在开事务前完成；
 * 预览与正式导入共用同一 planner（预览只读，确认时重新读本地并重新规划）。
 * 写入走 db.atomicWrite 的多 store 单事务，任一失败三 store 全部回滚。
 */

import { atomicWrite, getAll } from '@/db'
import { EXPORTABLE_SETTING_KEYS } from '@/services/backupValidation'
import { ImportValidationError, planImport } from '@/services/importPlanner'

const APP_TAG = 'jizhang'
export const BACKUP_VERSION = 2

/** 可导出的 settings 键（fail-closed：不在名单里的键一律不导出/不导入） */
const EXPORTABLE_SETTING_KEY_SET = new Set(EXPORTABLE_SETTING_KEYS)

function isExportableSetting(row) {
  return !!row && EXPORTABLE_SETTING_KEY_SET.has(row.key)
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

async function readLocal() {
  const [localRecords, localCategories, localSettings] = await Promise.all([
    getAll('records'),
    getAll('categories'),
    getAll('settings'),
  ])
  return { localRecords, localCategories, localSettings }
}

/**
 * 只读预览：不写库，返回与正式导入相同的 planner summary / errors。
 * @returns {Promise<{summary: object, errors: object[]}>}
 */
export async function previewImport(payload) {
  const plan = planImport(payload, await readLocal())
  return { summary: plan.summary, errors: plan.errors }
}

/**
 * 正式导入：重新读取本地 → 重新规划 → 有错误整份拒绝 → 一次原子提交。
 * @returns {Promise<object>} planner summary
 */
export async function importMerge(payload) {
  const plan = planImport(payload, await readLocal())
  if (plan.errors.length) throw new ImportValidationError(plan.errors)
  await atomicWrite({ puts: plan.writes })
  return plan.summary
}
