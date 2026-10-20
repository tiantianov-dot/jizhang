/**
 * composables/usePolarity.js — 背景极性的副作用层
 *
 * 纯统计在 services/polarity.js；这里只做 canvas 降采样、localStorage 镜像、
 * 写 html[data-polarity]，以及订阅 --bg-image 变化后重算。
 * 背景变更的约定：把新的 --bg-image 写在 documentElement 的内联 style 上
 * （V4-2 的上传素材也走这条），MutationObserver 会重新分析。
 */
import { onMounted, onUnmounted } from 'vue'
import {
  SAMPLE_SIZE,
  classifyPolarity,
  highlightLuminance,
} from '@/services/polarity'

const MIRROR_KEY = 'jizhang:uiPolarity'
const DEFAULT_POLARITY = 'dark'
const DEBOUNCE_MS = 120

function readMirror() {
  try {
    const v = localStorage.getItem(MIRROR_KEY)
    return v === 'light' || v === 'dark' ? v : ''
  } catch {
    return ''
  }
}

function writeMirror(polarity) {
  try {
    localStorage.setItem(MIRROR_KEY, polarity)
  } catch {
    // 无痕模式等 localStorage 不可用：IDB/重算仍然是真相源
  }
}

function currentPolarity() {
  return document.documentElement.dataset.polarity === 'light' ? 'light' : 'dark'
}

function applyPolarity(polarity) {
  document.documentElement.dataset.polarity = polarity
}

function backgroundUrl() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--bg-image').trim()
  const match = /url\((['"]?)(.*?)\1\)/.exec(raw)
  return match ? match[2] : ''
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`background decode failed: ${url}`))
    img.src = url
  })
}

function sampleImage(img) {
  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE_SIZE
  canvas.height = SAMPLE_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
  return ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data
}

export function usePolarity() {
  let timer = 0
  let observer = null
  let runId = 0

  async function analyze(url = backgroundUrl()) {
    if (!url) return
    const seq = ++runId
    try {
      const img = await loadImage(url)
      if (seq !== runId) return
      const next = classifyPolarity(highlightLuminance(sampleImage(img)), currentPolarity())
      if (next !== currentPolarity()) {
        applyPolarity(next)
        writeMirror(next)
      }
    } catch {
      // 解码失败保持当前极性，不静默把文字切换成不可读的一档
    }
  }

  function scheduleAnalyze() {
    clearTimeout(timer)
    timer = setTimeout(() => analyze(), DEBOUNCE_MS)
  }

  onMounted(() => {
    const mirror = readMirror()
    applyPolarity(mirror || DEFAULT_POLARITY)
    analyze()
    observer = new MutationObserver(scheduleAnalyze)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'data-bg'],
    })
  })

  onUnmounted(() => {
    clearTimeout(timer)
    observer?.disconnect()
  })

  return { analyze }
}
