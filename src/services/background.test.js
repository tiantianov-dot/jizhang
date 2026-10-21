import test from 'node:test'
import assert from 'node:assert/strict'
import { checkCoverResolution, coverRequirement, normalizeDescriptor } from './background.js'

const desktop = {
  innerWidth: 390,
  innerHeight: 800,
  dpr: 3,
  screenW: 1440,
  screenH: 900,
  coarse: false,
}

const touch = {
  innerWidth: 393,
  innerHeight: 852,
  dpr: 3,
  screenW: 393,
  screenH: 852,
  coarse: true,
}

test('桌面 390×800 DPR3：需要 1170×2400，恰好通过、少一像素拒绝', () => {
  assert.deepEqual(coverRequirement(desktop), { width: 1170, height: 2400 })
  assert.deepEqual(checkCoverResolution(1170, 2400, desktop), {
    ok: true,
    width: 1170,
    height: 2400,
  })
  const rejected = checkCoverResolution(1169, 2400, desktop)
  assert.equal(rejected.ok, false)
  assert.equal(rejected.width, 1170)
  assert.equal(rejected.height, 2400)
  assert.equal(
    rejected.message,
    '分辨率不足：至少需要 1170×2400 物理像素（当前 1169×2400），铺满会被放大',
  )
})

test('触屏 393×852 DPR3：需要 2556×2556 方形门槛', () => {
  assert.deepEqual(coverRequirement(touch), { width: 2556, height: 2556 })
  assert.equal(checkCoverResolution(3000, 3000, touch).ok, true)
  assert.equal(checkCoverResolution(4032, 3024, touch).ok, true)

  const small = checkCoverResolution(240, 240, touch)
  assert.equal(small.ok, false)
  assert.equal(
    small.message,
    '分辨率不足：至少需要 2556×2556 物理像素（当前 240×240），铺满会被放大',
  )

  const narrow = checkCoverResolution(1170, 2532, touch)
  assert.equal(narrow.ok, false)
  assert.equal(narrow.width, 2556)
  assert.equal(narrow.height, 2556)
})

test('coverRequirement：dpr 缺失按 1，触屏取屏幕长边', () => {
  assert.deepEqual(
    coverRequirement({ innerWidth: 400, innerHeight: 700, coarse: false }),
    { width: 400, height: 700 },
  )
  assert.deepEqual(
    coverRequirement({ screenW: 1080, screenH: 2400, coarse: true, dpr: 1 }),
    { width: 2400, height: 2400 },
  )
})

const base = {
  kind: 'image',
  mime: 'image/png',
  size: 1024,
  updatedAt: '2026-10-21T00:00:00.000Z',
}

test('normalizeDescriptor：正整数宽高成对保留', () => {
  assert.deepEqual(normalizeDescriptor({ ...base, width: 3000, height: 3000 }), {
    ...base,
    width: 3000,
    height: 3000,
  })
  assert.deepEqual(
    normalizeDescriptor({ kind: 'video', mime: 'video/mp4', size: 2048, updatedAt: 'x', width: 1920, height: 1080 }),
    { kind: 'video', mime: 'video/mp4', size: 2048, updatedAt: 'x', width: 1920, height: 1080 },
  )
})

test('normalizeDescriptor：宽高不成对或非法时整对丢弃，但描述符仍合法', () => {
  assert.deepEqual(normalizeDescriptor({ ...base, width: 0, height: 3000 }), base)
  assert.deepEqual(normalizeDescriptor({ ...base, width: 3000, height: 0 }), base)
  assert.deepEqual(normalizeDescriptor({ ...base, width: -1, height: -1 }), base)
  assert.deepEqual(normalizeDescriptor({ ...base, width: 3000.5, height: 3000 }), base)
  assert.deepEqual(normalizeDescriptor({ ...base, width: 3000 }), base)
  assert.deepEqual(normalizeDescriptor({ ...base, width: '3000', height: '3000' }), base)
})

test('normalizeDescriptor：旧四字段描述符仍非 null，非法结构仍回 null', () => {
  assert.ok(normalizeDescriptor(base))
  assert.equal(normalizeDescriptor(null), null)
  assert.equal(normalizeDescriptor({ ...base, kind: 'audio' }), null)
  assert.equal(normalizeDescriptor({ ...base, size: 0 }), null)
  assert.equal(normalizeDescriptor({ ...base, updatedAt: '' }), null)
})
