import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyShareOutcome, shouldPersistBackup } from './backupExport.js'

function namedError(name) {
  const error = new Error(name)
  error.name = name
  return error
}

test('share 只有 resolved 才记成功；取消/其它失败都不写时间', () => {
  assert.equal(classifyShareOutcome(null), 'saved')
  assert.equal(classifyShareOutcome(namedError('AbortError')), 'cancelled')
  assert.equal(classifyShareOutcome(namedError('NotAllowedError')), 'failed')
  assert.equal(classifyShareOutcome(new Error('boom')), 'failed')

  assert.equal(shouldPersistBackup({ method: 'share', outcome: 'saved' }), true)
  assert.equal(shouldPersistBackup({ method: 'share', outcome: 'cancelled' }), false)
  assert.equal(shouldPersistBackup({ method: 'share', outcome: 'failed' }), false)
})

test('download 默认不写时间，只有用户显式确认才写', () => {
  assert.equal(shouldPersistBackup({ method: 'download' }), false)
  assert.equal(shouldPersistBackup({ method: 'download', confirmed: false }), false)
  assert.equal(shouldPersistBackup({ method: 'download', confirmed: true }), true)
  assert.equal(shouldPersistBackup({ method: 'unknown', confirmed: true }), false)
})
