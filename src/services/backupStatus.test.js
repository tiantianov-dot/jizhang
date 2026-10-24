import test from 'node:test'
import assert from 'node:assert/strict'
import {
  backupAgeDays,
  DEFAULT_REMINDER_DAYS,
  getBackupStatus,
  normalizeReminderDays,
  REMINDER_DAYS,
  shouldShowBackupReminder,
} from './backupStatus.js'

const NOW = new Date(2026, 9, 24, 12, 0, 0).getTime()
function isoDaysAgo(days) {
  return new Date(2026, 9, 24 - days, 12, 0, 0).toISOString()
}

function status(lastBackupAt, days = 7, extra = {}) {
  return getBackupStatus({ lastBackupAt, days, now: NOW, ...extra })
}

test('缺省/非法时间：never / unknown；未来时间不猜测', () => {
  assert.equal(status(''), 'never')
  assert.equal(status(null), 'never')
  assert.equal(status('not-a-date'), 'unknown')
  assert.equal(status(isoDaysAgo(-1)), 'unknown')
  assert.equal(getBackupStatus({}), 'never')
  assert.equal(backupAgeDays('bad', NOW), null)
})

test('3/7/14/30 边界：达到周期即 stale，前一天仍 ok', () => {
  assert.deepEqual(REMINDER_DAYS, [3, 7, 14, 30])
  assert.equal(DEFAULT_REMINDER_DAYS, 7)
  for (const days of REMINDER_DAYS) {
    assert.equal(status(isoDaysAgo(days - 1), days), 'ok', `${days} 天周期-1`)
    assert.equal(status(isoDaysAgo(days), days), 'stale', `${days} 天周期当天`)
    assert.equal(status(isoDaysAgo(days + 1), days), 'stale', `${days} 天周期+1`)
  }
  assert.equal(status(isoDaysAgo(0)), 'ok')
})

test('非法周期回退 7 天', () => {
  assert.equal(normalizeReminderDays(5), 7)
  assert.equal(normalizeReminderDays('7'), 7)
  assert.equal(normalizeReminderDays(14), 14)
  assert.equal(normalizeReminderDays('x'), 7)
  assert.equal(status(isoDaysAgo(7), 5), 'stale')
})

test('空账本与关闭提醒不改变事实状态，只影响是否展示提醒', () => {
  assert.equal(status(isoDaysAgo(10), 7, { recordCount: 0 }), 'stale')
  assert.equal(status(isoDaysAgo(10), 7, { enabled: false }), 'stale')

  assert.equal(shouldShowBackupReminder({ status: 'stale', recordCount: 0, enabled: true }), false)
  assert.equal(shouldShowBackupReminder({ status: 'stale', recordCount: 1, enabled: false }), false)
  assert.equal(shouldShowBackupReminder({ status: 'ok', recordCount: 1, enabled: true }), false)
  assert.equal(shouldShowBackupReminder({ status: 'stale', recordCount: 1, enabled: true }), true)
  assert.equal(shouldShowBackupReminder({ status: 'never', recordCount: 1, enabled: true }), true)
  assert.equal(shouldShowBackupReminder({ status: 'unknown', recordCount: 1, enabled: true }), true)
})

test('backupAgeDays 使用本地日历日', () => {
  assert.equal(backupAgeDays(isoDaysAgo(0), NOW), 0)
  assert.equal(backupAgeDays(isoDaysAgo(3), NOW), 3)
})
