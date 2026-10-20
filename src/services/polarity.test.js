import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyPolarity,
  highlightLuminance,
  luminanceSamples,
  percentile,
  relativeLuminance,
} from './polarity.js'

/** 构造 count 个像素的 RGBA 平铺数组：前 darkCount 个暗、其余亮 */
function samples(darkCount, count = 1024) {
  const data = new Uint8ClampedArray(count * 4)
  for (let i = 0; i < count; i++) {
    const v = i < darkCount ? 0 : 255
    data[i * 4] = v
    data[i * 4 + 1] = v
    data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  return data
}

test('相对亮度：黑 0、白 1', () => {
  assert.equal(relativeLuminance(0, 0, 0), 0)
  assert.equal(relativeLuminance(255, 255, 255), 1)
})

test('p88：15% 亮区进亮极性，5% 亮区仍判暗', () => {
  assert.equal(highlightLuminance(samples(870)), 1) // 154 个白点 = 15%
  assert.equal(highlightLuminance(samples(973)), 0) // 51 个白点 = 5%
})

test('迟滞：≥.45 进亮、<.32 回暗、区间内保持', () => {
  assert.equal(classifyPolarity(0.45, 'dark'), 'light')
  assert.equal(classifyPolarity(0.44, 'dark'), 'dark')
  assert.equal(classifyPolarity(0.32, 'dark'), 'dark')
  assert.equal(classifyPolarity(0.319, 'light'), 'dark')
  assert.equal(classifyPolarity(0.4, 'light'), 'light')
  assert.equal(classifyPolarity(0.4, 'dark'), 'dark')
})

test('透明像素按 #0a0e18 合成，不当作纯黑', () => {
  const data = new Uint8ClampedArray(4 * 4)
  data[3] = 0
  const [dark] = luminanceSamples(data)
  assert.equal(dark, relativeLuminance(10, 14, 24))
  assert.ok(dark > 0)
})

test('percentile 不修改入参', () => {
  const values = [0.9, 0.1, 0.5]
  const snapshot = [...values]
  percentile(values, 0.5)
  assert.deepEqual(values, snapshot)
})
