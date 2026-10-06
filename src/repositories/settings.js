/**
 * repositories/settings.js — 设置仓库层（key-value）
 *
 * 当前键：monthlyBudget（分，0=不设）、ownerName。
 * 预留键：partnerName、syncConfig（Phase 3 双人同步，本阶段不写任何同步代码）。
 */

import { getOne, putOne } from '@/db'

export async function get(key, fallback = null) {
  const row = await getOne('settings', key)
  return row ? row.value : fallback
}

export async function set(key, value) {
  await putOne('settings', { key, value })
}
