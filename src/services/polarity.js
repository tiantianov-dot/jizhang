/**
 * services/polarity.js — 背景极性统计（纯函数，可 node --test）
 *
 * 背景按实际 cover 区域裁到 32×32 后，取像素相对亮度的 p88（md 指定的
 * p85–p90 区间），用 .45/.32 迟滞判定 data-polarity。半透明像素按
 * #05070d 底色合成，避免透明区域被当成纯黑拉偏统计。
 */

export const SAMPLE_SIZE = 32
export const HIGHLIGHT_PERCENTILE = 0.88
export const LIGHT_AT = 0.45
export const DARK_BELOW = 0.32
export const POLARITY_BG = { r: 5, g: 7, b: 13 }

export function srgbToLinear(value) {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(r, g, b) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

/** 把 RGBA 平铺数组（ImageData.data 或测试构造的数组）换成每个像素的亮度 */
export function luminanceSamples(rgba) {
  const out = []
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const alpha = rgba[i + 3] / 255
    const r = rgba[i] * alpha + POLARITY_BG.r * (1 - alpha)
    const g = rgba[i + 1] * alpha + POLARITY_BG.g * (1 - alpha)
    const b = rgba[i + 2] * alpha + POLARITY_BG.b * (1 - alpha)
    out.push(relativeLuminance(r, g, b))
  }
  return out
}

/** 最近秩分位（q=0.88 → 1024 个样本取第 900 个），不修改入参 */
export function percentile(values, q) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.round(Math.min(1, Math.max(0, q)) * (sorted.length - 1))
  return sorted[index]
}

export function highlightLuminance(rgba) {
  return percentile(luminanceSamples(rgba), HIGHLIGHT_PERCENTILE)
}

/** 迟滞判定：≥.45 进亮、<.32 回暗、中间保持原极性 */
export function classifyPolarity(luminance, current = 'dark') {
  if (luminance >= LIGHT_AT) return 'light'
  if (luminance < DARK_BELOW) return 'dark'
  return current === 'light' ? 'light' : 'dark'
}

/** 与 CSS cover 一致的源图裁剪矩形；非法尺寸回零矩形 */
export function coverCropRect(srcW, srcH, dstW, dstH) {
  if (!(srcW > 0 && srcH > 0 && dstW > 0 && dstH > 0)) {
    return { sx: 0, sy: 0, sw: 0, sh: 0 }
  }
  const srcAspect = srcW / srcH
  const dstAspect = dstW / dstH
  if (srcAspect > dstAspect) {
    const sw = srcH * dstAspect
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH }
  }
  const sh = srcW / dstAspect
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh }
}
