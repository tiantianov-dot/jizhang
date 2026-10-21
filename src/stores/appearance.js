/**
 * stores/appearance.js — 外观偏好（模糊强度 / 玻璃填充）
 *
 * IndexedDB 是唯一真相源；localStorage 只存强度/填充镜像，供 main.js 首帧防闪。
 * previewIntensity / previewFill 只改 CSS 变量，不持久化 —— U5 场景联动专用。
 */
import { defineStore } from 'pinia'
import * as settingsRepo from '@/repositories/settings'

const INTENSITY_KEY = 'uiGlassIntensity'
const FILL_KEY = 'uiGlassFill'
const INTENSITY_MIRROR_KEY = 'jizhang:uiGlassIntensity'
const FILL_MIRROR_KEY = 'jizhang:uiGlassFill'

const INTENSITY_MIN = 0
const INTENSITY_MAX = 1
const FILL_MIN = 0
const FILL_MAX = 0.3
const FILL_DEFAULT = 0.03
const REDUCED_MIN = 0.7
const CONTRAST_MIN = 0.85

function matchesMedia(query) {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(query).matches
  )
}

export function clampIntensity(v) {
  const n = Number(v)
  const base = Number.isFinite(n)
    ? Math.min(INTENSITY_MAX, Math.max(INTENSITY_MIN, n))
    : 1
  if (matchesMedia('(prefers-contrast: more)')) return Math.max(CONTRAST_MIN, base)
  if (matchesMedia('(prefers-reduced-transparency: reduce)')) return Math.max(REDUCED_MIN, base)
  return base
}

export function clampFill(v) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(FILL_MAX, Math.max(FILL_MIN, n)) : FILL_DEFAULT
}

function applyIntensity(v) {
  document.documentElement.style.setProperty('--glass-intensity', String(v))
}

function applyFill(v) {
  document.documentElement.style.setProperty('--glass-alpha', String(v))
}

function mirrorIntensity(v) {
  try {
    localStorage.setItem(INTENSITY_MIRROR_KEY, String(v))
  } catch {
    // 无痕模式等场景 localStorage 不可用：保持 IDB 真源即可
  }
}

function mirrorFill(v) {
  try {
    localStorage.setItem(FILL_MIRROR_KEY, String(v))
  } catch {
    // 同上
  }
}

export const useAppearanceStore = defineStore('appearance', {
  state: () => ({
    glassIntensity: 1,
    glassFill: FILL_DEFAULT,
  }),
  actions: {
    /** IDB 真值 → 内存 / CSS / 镜像（启动与导入备份后各跑一次） */
    async load() {
      const [storedIntensity, storedFill] = await Promise.all([
        settingsRepo.get(INTENSITY_KEY, null),
        settingsRepo.get(FILL_KEY, null),
      ])
      this.glassIntensity = clampIntensity(storedIntensity === null ? 1 : storedIntensity)
      this.glassFill = clampFill(storedFill === null ? FILL_DEFAULT : storedFill)
      applyIntensity(this.glassIntensity)
      applyFill(this.glassFill)
      mirrorIntensity(this.glassIntensity)
      mirrorFill(this.glassFill)
      // 首次启动落库默认值：保证导出白名单里有这两个键（无行时 get 回落）
      if (storedIntensity === null) await settingsRepo.set(INTENSITY_KEY, this.glassIntensity)
      if (storedFill === null) await settingsRepo.set(FILL_KEY, this.glassFill)
    },

    /** 用户意图写：持久化到 IDB + 镜像 + CSS */
    async setIntensity(v) {
      this.glassIntensity = clampIntensity(v)
      applyIntensity(this.glassIntensity)
      mirrorIntensity(this.glassIntensity)
      await settingsRepo.set(INTENSITY_KEY, this.glassIntensity)
    },

    /** 场景态写：只设 CSS 变量，不写 IDB / 镜像（U5 沉浸模式用） */
    previewIntensity(v) {
      applyIntensity(clampIntensity(v))
    },

    async setFill(v) {
      this.glassFill = clampFill(v)
      applyFill(this.glassFill)
      mirrorFill(this.glassFill)
      await settingsRepo.set(FILL_KEY, this.glassFill)
    },

    /** 填充的临时预览（同样不持久化） */
    previewFill(v) {
      applyFill(clampFill(v))
    },
  },
})
