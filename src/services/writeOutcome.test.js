import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyWriteError,
  DELETE_MESSAGES,
  describeDeleteFailure,
  describeStoreError,
  describeUndoFailure,
  describeWriteFailure,
  tagWriteError,
  UNDO_MESSAGES,
  WRITE_MESSAGES,
} from './writeOutcome.js'

function namedError(name, message = 'boom') {
  const error = new Error(message)
  error.name = name
  return error
}

test('明确 abort / 配额 / 约束类错误归为 failed', () => {
  for (const name of [
    'AbortError',
    'QuotaExceededError',
    'ConstraintError',
    'DataError',
    'InvalidStateError',
    'NotFoundError',
    'VersionError',
    'NotAllowedError',
    'SecurityError',
  ]) {
    assert.equal(classifyWriteError(namedError(name)), 'failed', name)
  }
})

test('UnknownError 与普通异常归为 unknown（不猜测事务结局）', () => {
  assert.equal(classifyWriteError(namedError('UnknownError')), 'unknown')
  assert.equal(classifyWriteError(new Error('unexpected')), 'unknown')
  assert.equal(classifyWriteError(null), 'unknown')
  assert.equal(classifyWriteError('boom'), 'unknown')
})

test('显式标记优先于类型判断', () => {
  const aborted = tagWriteError(namedError('UnknownError'), 'failed')
  assert.equal(classifyWriteError(aborted), 'failed')
  const weird = tagWriteError(namedError('AbortError'), 'unknown')
  assert.equal(classifyWriteError(weird), 'unknown')
  const wrapped = tagWriteError('plain string', 'failed')
  assert.ok(wrapped instanceof Error)
  assert.equal(classifyWriteError(wrapped), 'failed')
})

test('用户文案固定且不包含金额/备注等业务内容', () => {
  assert.equal(describeWriteFailure(namedError('AbortError')).message, WRITE_MESSAGES.failed)
  assert.equal(describeWriteFailure(new Error('x')).message, WRITE_MESSAGES.unknown)
  assert.equal(WRITE_MESSAGES.failed, '未保存，请检查浏览器存储后重试')
  assert.equal(WRITE_MESSAGES.unknown, '保存结果未确认，请先到流水页核实')
  assert.equal(WRITE_MESSAGES.refreshFailed, '已保存，列表暂未刷新')
  assert.equal(describeUndoFailure(namedError('AbortError')), UNDO_MESSAGES.failed)
  assert.equal(describeUndoFailure(new Error('x')), UNDO_MESSAGES.unknown)
  assert.equal(describeDeleteFailure(namedError('AbortError')), DELETE_MESSAGES.failed)
  assert.equal(describeDeleteFailure(new Error('x')), DELETE_MESSAGES.unknown)

  for (const message of [
    ...Object.values(WRITE_MESSAGES),
    ...Object.values(UNDO_MESSAGES),
    ...Object.values(DELETE_MESSAGES),
  ]) {
    assert.ok(!message.includes('¥'))
    assert.ok(!message.includes('备注'))
    assert.ok(!message.includes('金额'))
  }
})

test('describeStoreError 区分存储异常与业务拒绝并透传文案', () => {
  assert.equal(describeStoreError(namedError('AbortError'), WRITE_MESSAGES), WRITE_MESSAGES.failed)
  assert.equal(
    describeStoreError(namedError('QuotaExceededError'), DELETE_MESSAGES),
    DELETE_MESSAGES.failed,
  )
  assert.equal(
    describeStoreError(namedError('UnknownError'), WRITE_MESSAGES),
    WRITE_MESSAGES.unknown,
  )
  assert.equal(
    describeStoreError(namedError('UnknownError'), DELETE_MESSAGES),
    DELETE_MESSAGES.unknown,
  )
  assert.equal(
    describeStoreError(tagWriteError(namedError('UnknownError'), 'failed'), WRITE_MESSAGES),
    WRITE_MESSAGES.failed,
  )
  assert.equal(describeStoreError(namedError('AbortError')), WRITE_MESSAGES.failed)
  assert.equal(
    describeStoreError(new Error('内置分类受保护，不能删除'), DELETE_MESSAGES),
    '内置分类受保护，不能删除',
  )
  assert.equal(describeStoreError(new Error('分类不存在'), WRITE_MESSAGES), '分类不存在')
  assert.equal(describeStoreError(new Error(''), WRITE_MESSAGES), '操作失败')
  assert.equal(describeStoreError(null, WRITE_MESSAGES), '操作失败')
  assert.equal(describeStoreError(undefined, DELETE_MESSAGES), '操作失败')
})
