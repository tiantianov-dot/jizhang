import test from 'node:test'
import assert from 'node:assert/strict'
import {
  describeImportErrors,
  formatBackupReminderText,
  formatBackupStatusText,
  formatImportSummary,
} from '@/services/backupFormat'

test('formatBackupStatusText：覆盖 never / stale / ok(今天与 N 天前) / unknown 四态', () => {
  assert.equal(
    formatBackupStatusText({ status: 'never', ageDays: null, reminderDays: 7 }),
    '尚未备份',
  )
  assert.equal(
    formatBackupStatusText({ status: 'stale', ageDays: 10, reminderDays: 7 }),
    '已 10 天未备份（周期 7 天）',
  )
  assert.equal(
    formatBackupStatusText({ status: 'ok', ageDays: 0, reminderDays: 7 }),
    '上次备份：今天',
  )
  assert.equal(
    formatBackupStatusText({ status: 'ok', ageDays: 3, reminderDays: 14 }),
    '上次备份：3 天前',
  )
  assert.equal(
    formatBackupStatusText({ status: 'unknown', ageDays: null, reminderDays: 7 }),
    '上次备份时间无法识别，建议重新导出',
  )
})

test('formatBackupReminderText：覆盖 never / stale / unknown 轻提醒文案', () => {
  assert.equal(
    formatBackupReminderText({ status: 'never', ageDays: null }),
    '尚未备份，清缓存或换设备会丢账',
  )
  assert.equal(formatBackupReminderText({ status: 'stale', ageDays: 20 }), '已 20 天未备份')
  assert.equal(
    formatBackupReminderText({ status: 'unknown', ageDays: null }),
    '上次备份时间无法识别，建议重新导出',
  )
})

test('describeImportErrors：3 条以内全量拼接，超过 3 条截断并附总项数', () => {
  assert.equal(describeImportErrors([]), '')
  assert.equal(describeImportErrors(null), '')
  assert.equal(describeImportErrors([{ message: '版本不受支持' }]), '版本不受支持')
  assert.equal(
    describeImportErrors([{ message: '错误一' }, { message: '错误二' }, { message: '错误三' }]),
    '错误一；错误二；错误三',
  )
  assert.equal(
    describeImportErrors([
      { message: '错误一' },
      { message: '错误二' },
      { message: '错误三' },
      { message: '错误四' },
      { message: '错误五' },
    ]),
    '错误一；错误二；错误三（共 5 项）',
  )
})

test('formatImportSummary：按精确顺序拼接账目、分类与设置主计数', () => {
  const text = formatImportSummary({
    records: { added: 8, updated: 2, skipped: 1 },
    categories: { added: 3, matched: 16, updated: 1, skipped: 4, conflicts: 2 },
    settings: { updated: 2, skipped: 3 },
  })
  assert.equal(
    text,
    '账目 新增 8 · 更新 2 · 跳过 1；分类 新增 3 · 匹配 16 · 更新 1 · 跳过 4 · 冲突 2；设置 更新 2 · 跳过 3',
  )
})
