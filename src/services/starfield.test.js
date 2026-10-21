import test from 'node:test'
import assert from 'node:assert/strict'
import { drawStarfield, mulberry32, starCount } from './starfield.js'

test('starCount：390×800 = 223，上下限 160 / 420', () => {
  assert.equal(starCount(390, 800), 223)
  assert.equal(starCount(10, 10), 160)
  assert.equal(starCount(4000, 4000), 420)
})

test('mulberry32：同种子序列可复现，不同种子不同', () => {
  const a = mulberry32(42)
  const b = mulberry32(42)
  const c = mulberry32(43)
  const seqA = Array.from({ length: 8 }, () => a())
  const seqB = Array.from({ length: 8 }, () => b())
  assert.deepEqual(seqA, seqB)
  assert.notDeepEqual(seqA, Array.from({ length: 8 }, () => c()))
  assert.ok(seqA.every((v) => v >= 0 && v < 1))
})

function mockContext(arcs) {
  const gradient = { addColorStop() {} }
  return {
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    fillRect() {},
    beginPath() {},
    arc(x, y, radius) {
      arcs.push([x, y, radius])
    },
    fill() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
  }
}

test('drawStarfield：随机星数随面积，另加 7 颗十字星；同种子坐标一致', () => {
  const first = []
  drawStarfield(mockContext(first), 390, 800)
  assert.equal(first.length, starCount(390, 800) + 7)

  const second = []
  drawStarfield(mockContext(second), 390, 800)
  assert.deepEqual(second, first)
})
