/**
 * repositories/settings.js — 设置仓库层（key-value）
 *
 * 当前键：monthlyBudget（分，0=不设）、ownerName、lastBackupAt（ISO，备份提醒）。
 * 预留键：partnerName、syncConfig（Phase 3 双人同步，本阶段不写任何同步代码）。
 * 每行带 updatedAt：同步合并依据（旧行可能缺失，按 0 处理）。
 * 注意：lastBackupAt / 未来的 syncConfig（含凭据）永不进入导出文件，见 backup.js 白名单。
 */

import { getOne, putOne } from '@/db'

export async function get(key, fallback = null) {
  const row = await getOne('settings', key)
  return row ? row.value : fallback
}

export async function set(key, value) {
  await putOne('settings', { key, value, updatedAt: Date.now() })
}
