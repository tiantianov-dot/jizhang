/**
 * services/starfield.js — 程序化星空绘制（纯函数、零 DOM）
 *
 * 数值与 V5 样张逐值一致：种子 42、星数按面积、7 颗十字星、暗角。
 * 只负责把画面画进给定 2D context；尺寸与 DPR 由 StarfieldLayer 处理。
 */

/** 16 个 CSS 星点：[left%, top%, size(px), duration(s), delay(s)] */
export const STAR_SEEDS = [
  [7, 10, 1.5, 3.8, 0],
  [22, 6, 1, 5.4, 1.2],
  [37, 14, 2, 4.2, 0.6],
  [52, 8, 1, 6.1, 2.1],
  [68, 12, 1.5, 3.4, 0.3],
  [84, 7, 1, 5.8, 1.7],
  [93, 18, 2, 4.8, 0.9],
  [12, 26, 1, 6.4, 2.6],
  [29, 33, 1.5, 3.9, 1.4],
  [44, 24, 1, 5.1, 0.2],
  [61, 30, 1.5, 4.5, 1.9],
  [76, 23, 1, 6.7, 0.7],
  [88, 36, 1.5, 3.6, 2.3],
  [18, 44, 1, 5.6, 0.4],
  [57, 47, 1, 6.2, 1.6],
  [81, 52, 1.5, 4.1, 2.8],
]

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function starCount(w, h) {
  return Math.round(Math.max(160, Math.min(420, (w * h) / 1400)))
}

export function drawStarfield(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, w, h)
  g.addColorStop(0, '#02040a')
  g.addColorStop(0.45, '#08101f')
  g.addColorStop(1, '#0d1829')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  const m = Math.max(w, h)
  for (const n of [
    { x: 0.18, y: 0.22, r: 0.55, c: '86,120,255', a: 0.2 },
    { x: 0.78, y: 0.36, r: 0.5, c: '150,90,255', a: 0.16 },
    { x: 0.5, y: 0.85, r: 0.65, c: '40,120,180', a: 0.12 },
  ]) {
    const rg = ctx.createRadialGradient(w * n.x, h * n.y, 0, w * n.x, h * n.y, m * n.r)
    rg.addColorStop(0, `rgba(${n.c},${n.a})`)
    rg.addColorStop(1, `rgba(${n.c},0)`)
    ctx.fillStyle = rg
    ctx.fillRect(0, 0, w, h)
  }

  const r = mulberry32(42)
  const count = starCount(w, h)
  for (let i = 0; i < count; i++) {
    const x = r() * w
    const y = r() * h
    const rad = 0.25 + r() * 1.35
    ctx.globalAlpha = 0.18 + r() * 0.8
    ctx.fillStyle = i % 9 === 0 ? '#cfe2ff' : '#ffffff'
    ctx.beginPath()
    ctx.arc(x, y, rad, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < 7; i++) {
    const x = r() * w
    const y = r() * h
    const rad = 1.2 + r() * 1.6
    ctx.globalAlpha = 0.9
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(x, y, rad, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 0.24
    ctx.strokeStyle = '#cfe2ff'
    ctx.lineWidth = 0.7
    ctx.beginPath()
    ctx.moveTo(x - rad * 4, y)
    ctx.lineTo(x + rad * 4, y)
    ctx.moveTo(x, y - rad * 4)
    ctx.lineTo(x, y + rad * 4)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  const vg = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.2,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.78,
  )
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(0,0,0,.38)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, w, h)
}
