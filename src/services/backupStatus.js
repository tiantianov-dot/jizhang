/**
 * services/backupStatus.js — 备份三态纯函数
 *
 * never：从未成功导出（或 lastBackupAt 为空）
 * stale：距上次成功导出达到提醒周期（按本地日历日）
 * ok：仍在周期内
 * unknown：时间无法解析或位于未来（不猜测）
 *
 * 状态本身是事实，不因“关闭提醒”而变成 ok；是否展示提醒由
 * shouldShowBackupReminder() 另行判断。
 */

export const REMINDER_DAYS = Object.freeze([3, 7, 14, 30])
export const DEFAULT_REMINDER_DAYS = 7

export function normalizeReminderDays(value) {
  const days = Number(value)
  return REMINDER_DAYS.includes(days) ? days : DEFAULT_REMINDER_DAYS
}

function startOfLocalDay(ms) {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** @returns {number|null} 本地日历日差；非法时间返回 null */
export function backupAgeDays(lastBackupAt, now = Date.now()) {
  if (!lastBackupAt) return null
  const then = typeof lastBackupAt === 'number' ? lastBackupAt : Date.parse(lastBackupAt)
  if (!Number.isFinite(then)) return null
  return Math.round((startOfLocalDay(now) - startOfLocalDay(then)) / 86400000)
}

/**
 * @param {{recordCount?: number, lastBackupAt?: string|number, days?: number, enabled?: boolean, now?: number}} params
 * @returns {'never'|'stale'|'ok'|'unknown'}
 */
export function getBackupStatus({
  recordCount = 0,
  lastBackupAt = '',
  days = DEFAULT_REMINDER_DAYS,
  enabled = true,
  now = Date.now(),
} = {}) {
  // recordCount/enabled 不改变事实状态：设置页即使空账本也要显示“尚未备份”
  void recordCount
  void enabled

  if (!lastBackupAt) return 'never'
  const nowMs = Number.isFinite(now) ? now : Date.now()
  const then = typeof lastBackupAt === 'number' ? lastBackupAt : Date.parse(lastBackupAt)
  if (!Number.isFinite(then) || then > nowMs) return 'unknown'

  const age = backupAgeDays(lastBackupAt, nowMs)
  if (age === null) return 'unknown'
  return age >= normalizeReminderDays(days) ? 'stale' : 'ok'
}

/** 有账目 + 提醒开启 + 非 ok 才展示轻提醒 */
export function shouldShowBackupReminder({ status, recordCount = 0, enabled = true }) {
  return !!enabled && recordCount > 0 && status !== 'ok'
}
