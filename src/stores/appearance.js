/**
 * stores/appearance.js — 外观偏好（质感强度 / 背景压暗）
 *
 * IndexedDB 是唯一真相源；localStorage 只存强度镜像，供 main.js 首帧防闪。
 * previewIntensity / previewDim 只改 CSS 变量，不持久化 —— U5 场景联动专用。
 */
import { defineStore } from 'pinia'
import * as settingsRepo from '@/repositories/settings'

const INTENSITY_KEY = 'uiGlassIntensity'
const DIM_KEY = 'uiGlassDim'
const MIRROR_KEY = 'jizhang:uiGlassIntensity'

const INTENSITY_MIN = 0.3
const INTENSITY_MAX = 1
const DIM_MIN = 0
const DIM_MAX = 0.6
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

export function clampDim(v) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(DIM_MAX, Math.max(DIM_MIN, n)) : 0.3
}

function applyIntensity(v) {
  document.documentElement.style.setProperty('--glass-intensity', String(v))
}

function applyDim(v) {
  document.documentElement.style.setProperty('--glass-dim', String(v))
}

function mirrorIntensity(v) {
  try {
    localStorage.setItem(MIRROR_KEY, String(v))
  } catch {
    // 无痕模式等场景 localStorage 不可用：保持 IDB 真源即可
  }
}

export const useAppearanceStore = defineStore('appearance', {
  state: () => ({
    glassIntensity: 1,
    glassDim: 0.3,
  }),
  actions: {
    /** IDB 真值 → 内存 / CSS / 镜像（启动与导入备份后各跑一次） */
    async load() {
      const [storedIntensity, storedDim] = await Promise.all([
        settingsRepo.get(INTENSITY_KEY, null),
        settingsRepo.get(DIM_KEY, null),
      ])
      this.glassIntensity = clampIntensity(storedIntensity === null ? 1 : storedIntensity)
      this.glassDim = clampDim(storedDim === null ? 0.3 : storedDim)
      applyIntensity(this.glassIntensity)
      applyDim(this.glassDim)
      mirrorIntensity(this.glassIntensity)
      // 首次启动落库默认值：保证导出白名单里有这两个键（无行时 get 回落）
      if (storedIntensity === null) await settingsRepo.set(INTENSITY_KEY, this.glassIntensity)
      if (storedDim === null) await settingsRepo.set(DIM_KEY, this.glassDim)
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

    async setDim(v) {
      this.glassDim = clampDim(v)
      applyDim(this.glassDim)
      await settingsRepo.set(DIM_KEY, this.glassDim)
    },

    /** 背景压暗的临时预览（同样不持久化） */
    previewDim(v) {
      applyDim(clampDim(v))
    },
  },
})
