import test from 'node:test'
import assert from 'node:assert/strict'
import { playMediaSafely } from './media.js'

test('空元素或缺少 play 方法时安全返回 false', async () => {
  assert.equal(await playMediaSafely(null), false)
  assert.equal(await playMediaSafely(undefined), false)
  assert.equal(await playMediaSafely({}), false)
  assert.equal(await playMediaSafely({ play: 'not-a-function' }), false)
})

test('同步 play() 与返回 resolved Promise 时均返回 true，并保留 this 绑定', async () => {
  const syncEl = {
    called: false,
    play() {
      this.called = true
    },
  }
  assert.equal(await playMediaSafely(syncEl), true)
  assert.equal(syncEl.called, true)

  const asyncEl = {
    play() {
      return Promise.resolve()
    },
  }
  assert.equal(await playMediaSafely(asyncEl), true)
})

test('NotAllowedError / AbortError 属于可预期降级：返回 false 且不触发 onUnexpectedError', async () => {
  const unexpected = []
  for (const name of ['NotAllowedError', 'AbortError']) {
    const err = Object.assign(new Error(name), { name })
    const ok = await playMediaSafely(
      { play: () => Promise.reject(err) },
      { onUnexpectedError: (e) => unexpected.push(e) },
    )
    assert.equal(ok, false)
  }
  assert.equal(unexpected.length, 0)
})

test('非预期异步 rejection 与同步异常均返回 false 且通知 onUnexpectedError', async () => {
  const unexpected = []
  const asyncErr = new Error('decode failed')
  const okAsync = await playMediaSafely(
    { play: () => Promise.reject(asyncErr) },
    { onUnexpectedError: (e) => unexpected.push(e) },
  )
  assert.equal(okAsync, false)

  const syncErr = new Error('sync crash')
  const okSync = await playMediaSafely(
    {
      play() {
        throw syncErr
      },
    },
    { onUnexpectedError: (e) => unexpected.push(e) },
  )
  assert.equal(okSync, false)
  assert.deepEqual(unexpected, [asyncErr, syncErr])
})
