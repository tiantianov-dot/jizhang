/**
 * repositories/settings.js — 设置仓库层（key-value）
 *
 * 当前键：monthlyBudget（分，0=不设）、ownerName、lastBackupAt（ISO，备份提醒）。
 * 预留键：partnerName、syncConfig（Phase 3 双人同步，本阶段不写任何同步代码）。
 * 每行带 updatedAt：同步合并依据（旧行可能缺失，按 0 处理）。
 * 注意：lastBackupAt / 未来的 syncConfig（含凭据）永不进入导出文件，见 backup.js 白名单。
 */

import { deleteOne, getOne, putOne } from '@/db'
import { DEFAULT_REMINDER_DAYS, normalizeReminderDays } from '@/services/backupStatus'
import { normalizeInboxUrl } from '@/services/cloudInbox'

export const BACKUP_REMINDER_DAYS_KEY = 'backupReminderDays'
export const BACKUP_REMINDER_ENABLED_KEY = 'backupReminderEnabled'
export const CLOUD_INBOX_CONFIG_KEY = 'cloudInboxConfig'
export const CLOUD_INBOX_STATUS_KEY = 'cloudInboxStatus'

export async function get(key, fallback = null) {
  const row = await getOne('settings', key)
  return row ? row.value : fallback
}

export async function set(key, value) {
  await putOne('settings', { key, value, updatedAt: Date.now() })
}

export async function remove(key) {
  await deleteOne('settings', key)
}

/** 读取时做值校验：只认 3/7/14/30，非法值回退 7 */
export async function getBackupReminderDays() {
  return normalizeReminderDays(await get(BACKUP_REMINDER_DAYS_KEY, DEFAULT_REMINDER_DAYS))
}

export async function setBackupReminderDays(days) {
  const value = normalizeReminderDays(days)
  await set(BACKUP_REMINDER_DAYS_KEY, value)
  return value
}

/** 读取时做值校验：非布尔值回退 true */
export async function getBackupReminderEnabled() {
  const value = await get(BACKUP_REMINDER_ENABLED_KEY, true)
  return typeof value === 'boolean' ? value : true
}

export async function setBackupReminderEnabled(enabled) {
  const value = enabled !== false
  await set(BACKUP_REMINDER_ENABLED_KEY, value)
  return value
}

function normalizeCloudInboxConfig(raw) {
  return {
    url: normalizeInboxUrl(raw?.url),
    token: typeof raw?.token === 'string' ? raw.token.trim() : '',
  }
}

function normalizeCloudInboxStatus(raw) {
  const result = raw?.lastResult === 'ok' || raw?.lastResult === 'error' ? raw.lastResult : ''
  const count = Number.isInteger(raw?.lastCount) && raw.lastCount >= 0 ? raw.lastCount : 0
  return {
    lastSyncAt: typeof raw?.lastSyncAt === 'string' ? raw.lastSyncAt : '',
    lastResult: result,
    lastCount: count,
    lastError: typeof raw?.lastError === 'string' ? raw.lastError : '',
  }
}

export async function getCloudInboxConfig() {
  return normalizeCloudInboxConfig(await get(CLOUD_INBOX_CONFIG_KEY, null))
}

export async function setCloudInboxConfig(config) {
  const normalized = normalizeCloudInboxConfig(config)
  await set(CLOUD_INBOX_CONFIG_KEY, normalized)
  return normalized
}

export async function clearCloudInboxConfig() {
  await Promise.all([remove(CLOUD_INBOX_CONFIG_KEY), remove(CLOUD_INBOX_STATUS_KEY)])
}

export async function getCloudInboxStatus() {
  return normalizeCloudInboxStatus(await get(CLOUD_INBOX_STATUS_KEY, null))
}

export async function setCloudInboxStatus(status) {
  const normalized = normalizeCloudInboxStatus(status)
  await set(CLOUD_INBOX_STATUS_KEY, normalized)
  return normalized
}
