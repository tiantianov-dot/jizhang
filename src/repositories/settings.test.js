import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { initDB, putOne, getOne } from '@/db'
import { resetDatabase } from '@/db/testIsolation'
import {
  BACKUP_REMINDER_DAYS_KEY,
  BACKUP_REMINDER_ENABLED_KEY,
  getBackupReminderDays,
  getBackupReminderEnabled,
  setBackupReminderDays,
  setBackupReminderEnabled,
} from './settings.js'

async function fresh() {
  await resetDatabase()
  await initDB()
}

test('备份提醒设置：缺省 7 天 / 开启', async () => {
  await fresh()
  assert.equal(await getBackupReminderDays(), 7)
  assert.equal(await getBackupReminderEnabled(), true)
})

test('备份提醒设置读取做值校验：非法天数回退 7、合法值保留、非法开关回退 true', async () => {
  await fresh()
  await putOne('settings', { key: BACKUP_REMINDER_DAYS_KEY, value: 5, updatedAt: 1 })
  assert.equal(await getBackupReminderDays(), 7)

  await putOne('settings', { key: BACKUP_REMINDER_DAYS_KEY, value: 'x', updatedAt: 2 })
  assert.equal(await getBackupReminderDays(), 7)

  await putOne('settings', { key: BACKUP_REMINDER_DAYS_KEY, value: 14, updatedAt: 3 })
  assert.equal(await getBackupReminderDays(), 14)

  await putOne('settings', { key: BACKUP_REMINDER_ENABLED_KEY, value: 'false', updatedAt: 1 })
  assert.equal(await getBackupReminderEnabled(), true)
})

test('备份提醒设置写入收敛：非 3/7/14/30 存为 7，开关存布尔', async () => {
  await fresh()
  assert.equal(await setBackupReminderDays(30), 30)
  assert.equal(await getBackupReminderDays(), 30)
  assert.equal(await setBackupReminderDays(9), 7)
  assert.equal((await getOne('settings', BACKUP_REMINDER_DAYS_KEY)).value, 7)

  assert.equal(await setBackupReminderEnabled(false), false)
  assert.equal(await getBackupReminderEnabled(), false)
  assert.equal(await setBackupReminderEnabled('yes'), true)
  assert.equal((await getOne('settings', BACKUP_REMINDER_ENABLED_KEY)).value, true)
})
