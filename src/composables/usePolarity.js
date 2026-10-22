/**
 * composables/usePolarity.js — 背景极性的副作用层
 *
 * 纯统计在 services/polarity.js；这里只做 cover 裁剪降采样、localStorage 镜像、
 * 写 html[data-polarity]，以及订阅背景变化后重算。
 * 星野/无背景/挂起/沉浸/视频未 ready 时展示恒 dark；星野与无 URL 的强制 dark
 * 会写镜像，suspended/沉浸期间只改展示不写镜像。
 * 图片变化由 --bg-image 的 style 变更触发；视频在 data-video-ready 出现且
 * readyState≥2 时采样。resize/orientationchange 120ms 防抖重采样。
 */
import { onMounted, onUnmounted } from 'vue'
import {
  SAMPLE_SIZE,
  classifyPolarity,
  coverCropRect,
  highlightLuminance,
} from '@/services/polarity'

const MIRROR_KEY = 'jizhang:uiPolarity'
const DEFAULT_POLARITY = 'dark'
const DEBOUNCE_MS = 120

function writeMirror(polarity) {
  try {
    localStorage.setItem(MIRROR_KEY, polarity)
  } catch {
    // 无痕模式等 localStorage 不可用：IDB/重算仍然是真相源
  }
}

function applyPolarity(polarity) {
  document.documentElement.dataset.polarity = polarity
}

/** 沉浸 live/idle 时相机画面恒暗，只读 DOM 状态，不碰 useImmersive */
function immersivePinned() {
  const state = document.querySelector('.immersive[data-state]')?.dataset.state
  return state === 'live' || state === 'idle'
}

function isSuspended() {
  return document.documentElement.hasAttribute('data-bg-suspended')
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

function sampleImage(source, srcW, srcH) {
  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE_SIZE
  canvas.height = SAMPLE_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const { sx, sy, sw, sh } = coverCropRect(srcW, srcH, window.innerWidth, window.innerHeight)
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
  return ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data
}

export function usePolarity() {
  let timer = 0
  let observer = null
  let immersiveObserver = null
  let runId = 0
  let detected = DEFAULT_POLARITY
  let wasPinned = false

  /** 无需采样的恒暗状态；同步判定，避免切背景后残留 120ms light */
  function forcedDark() {
    if (isSuspended() || immersivePinned()) return true
    const bg = document.documentElement.dataset.bg
    if (bg === 'starfield' || !bg) return true
    if (bg === 'image' || bg === 'gif') return !backgroundUrl()
    if (bg === 'video') return !document.documentElement.hasAttribute('data-video-ready')
    return true
  }

  /** 展示极性：恒暗状态优先，其余用检测值 */
  function applyEffective() {
    applyPolarity(forcedDark() ? 'dark' : detected)
  }

  function applyDetected(next) {
    if (next !== detected) {
      detected = next
      writeMirror(next)
    }
    applyEffective()
  }

  async function analyze(url = backgroundUrl()) {
    if (isSuspended() || immersivePinned()) {
      applyEffective()
      return
    }
    const bg = document.documentElement.dataset.bg
    if (bg === 'video') {
      const video = document.querySelector('[data-testid="bg-video"]')
      const ready =
        document.documentElement.hasAttribute('data-video-ready') &&
        video &&
        video.readyState >= 2
      if (!ready) {
        applyDetected('dark')
        return
      }
      try {
        applyDetected(
          classifyPolarity(
            highlightLuminance(sampleImage(video, video.videoWidth, video.videoHeight)),
            detected,
          ),
        )
      } catch {
        // 帧暂时不可读：保持当前极性，不连续分析
      }
      return
    }
    if (bg === 'starfield' || !bg || !url) {
      applyDetected('dark')
      return
    }
    const seq = ++runId
    try {
      const img = await loadImage(url)
      if (seq !== runId || isSuspended() || immersivePinned()) return
      applyDetected(
        classifyPolarity(
          highlightLuminance(sampleImage(img, img.naturalWidth, img.naturalHeight)),
          detected,
        ),
      )
    } catch {
      // 解码失败保持当前极性，不静默把文字切换成不可读的一档
    }
  }

  function scheduleAnalyze() {
    clearTimeout(timer)
    timer = setTimeout(() => analyze(), DEBOUNCE_MS)
  }

  onMounted(() => {
    detected = DEFAULT_POLARITY
    wasPinned = immersivePinned()
    applyEffective()
    analyze()
    observer = new MutationObserver(() => {
      applyEffective()
      scheduleAnalyze()
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'data-bg', 'data-bg-suspended', 'data-video-ready'],
    })
    immersiveObserver = new MutationObserver(() => {
      const pinned = immersivePinned()
      if (pinned === wasPinned) return
      wasPinned = pinned
      applyEffective()
    })
    immersiveObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state'],
    })
    window.addEventListener('resize', scheduleAnalyze)
    window.addEventListener('orientationchange', scheduleAnalyze)
  })

  onUnmounted(() => {
    clearTimeout(timer)
    observer?.disconnect()
    immersiveObserver?.disconnect()
    window.removeEventListener('resize', scheduleAnalyze)
    window.removeEventListener('orientationchange', scheduleAnalyze)
  })

  return { analyze }
}
