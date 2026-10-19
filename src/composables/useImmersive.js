/**
 * composables/useImmersive.js — 沉浸背景副作用编排
 *
 * 全站唯一持有 getUserMedia / addEventListener / setTimeout 的沉浸相关文件；
 * 状态迁移一律经 services/immersive.js 的 transition() 计算。
 */
import { onBeforeUnmount, ref, shallowRef } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import {
  IDLE_TIMEOUT_MS,
  IMMERSIVE_GUM_CONSTRAINTS,
  transition,
} from '@/services/immersive'

const CAMERA_ERROR = '相机不可用，已退出沉浸背景'
const PARALLAX_LIMIT = 6
const PARALLAX_FACTOR = 0.6

export function useImmersive({ onCameraError } = {}) {
  const state = ref('closed')
  const stream = shallowRef(null)
  const parallax = ref({ x: 0, y: 0 })

  let currentStream = null
  let idleTimer = null
  let requestToken = 0
  let parallaxEnabled = false
  let motionBaseline = null
  let motionListening = false

  function apply(event) {
    state.value = transition(state.value, event)
    if (state.value !== 'live') clearIdleTimer()
    return state.value
  }

  function clearIdleTimer() {
    if (idleTimer !== null) {
      clearTimeout(idleTimer)
      idleTimer = null
    }
  }

  function stopTracks(target) {
    if (!target) return
    target.getTracks().forEach((t) => t.stop())
  }

  function releaseStream({ drop }) {
    stopTracks(currentStream)
    if (drop) {
      currentStream = null
      stream.value = null
    }
  }

  function resetParallax() {
    motionBaseline = null
    if (parallax.value.x !== 0 || parallax.value.y !== 0) parallax.value = { x: 0, y: 0 }
  }

  function clampOffset(v) {
    return Math.max(-PARALLAX_LIMIT, Math.min(PARALLAX_LIMIT, v))
  }

  function onMotion(e) {
    if (state.value !== 'live' || !parallaxEnabled) return
    const a = e.accelerationIncludingGravity
    if (!a || a.x == null || a.y == null) return
    if (!motionBaseline) {
      motionBaseline = { x: a.x, y: a.y }
      return
    }
    const x = clampOffset(-(a.x - motionBaseline.x) * PARALLAX_FACTOR)
    const y = clampOffset(-(a.y - motionBaseline.y) * PARALLAX_FACTOR)
    parallax.value = { x, y }
  }

  function startMotion() {
    if (!parallaxEnabled || motionListening) return
    motionBaseline = null
    window.addEventListener('devicemotion', onMotion)
    motionListening = true
  }

  function stopMotion() {
    if (!motionListening) return
    window.removeEventListener('devicemotion', onMotion)
    motionListening = false
    motionBaseline = null
  }

  /** iOS 13+ 必须在用户手势内调用；非 iOS 视为已授权（无权限门）。 */
  async function requestMotionPermission() {
    if (typeof DeviceMotionEvent === 'undefined') return false
    if (typeof DeviceMotionEvent.requestPermission !== 'function') return true
    try {
      return (await DeviceMotionEvent.requestPermission()) === 'granted'
    } catch {
      return false
    }
  }

  async function acquireStream() {
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('mockcamera')) {
      return (await import('./immersiveMock.js')).createMockStream()
    }
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      throw new Error('getUserMedia unavailable')
    }
    return navigator.mediaDevices.getUserMedia(IMMERSIVE_GUM_CONSTRAINTS)
  }

  function startIdleTimer() {
    clearIdleTimer()
    idleTimer = setTimeout(() => {
      idleTimer = null
      if (state.value !== 'live') return
      apply('IDLE_TIMEOUT')
      releaseStream({ drop: false })
      stopMotion()
      resetParallax()
    }, IDLE_TIMEOUT_MS)
  }

  async function open() {
    if (state.value !== 'closed') return
    const token = ++requestToken
    apply('OPEN')

    // 权限顺序固定：motion 先问、相机后问；motion 结果不进入状态机。
    const motionOk = await requestMotionPermission()
    if (token !== requestToken || state.value !== 'requesting') return
    parallaxEnabled = motionOk
    if (motionOk) startMotion()

    let next
    try {
      next = await acquireStream()
    } catch {
      if (token === requestToken && state.value === 'requesting') {
        apply('STREAM_FAIL')
        releaseStream({ drop: true })
        stopMotion()
        onCameraError?.(CAMERA_ERROR)
      }
      return
    }

    if (token !== requestToken || state.value !== 'requesting') {
      stopTracks(next)
      return
    }
    currentStream = next
    stream.value = next
    apply('STREAM_OK')
    startIdleTimer()
  }

  async function resume() {
    if (state.value !== 'idle') return
    const token = ++requestToken
    apply('RESUME')
    resetParallax()
    startMotion()

    let next
    try {
      next = await acquireStream()
    } catch {
      if (token === requestToken && state.value === 'live') {
        apply('CLOSE')
        releaseStream({ drop: true })
        stopMotion()
        onCameraError?.(CAMERA_ERROR)
      }
      return
    }

    if (token !== requestToken || state.value !== 'live') {
      stopTracks(next)
      return
    }
    stopTracks(currentStream)
    currentStream = next
    stream.value = next
    startIdleTimer()
  }

  function close() {
    if (state.value === 'closed') return
    requestToken++
    apply('CLOSE')
    releaseStream({ drop: true })
    stopMotion()
    resetParallax()
  }

  function onVisibilityChange() {
    if (document.visibilityState !== 'hidden') return
    if (state.value === 'requesting') {
      requestToken++
      apply('HIDE')
      releaseStream({ drop: true })
      stopMotion()
      resetParallax()
    } else if (state.value === 'live') {
      apply('HIDE')
      releaseStream({ drop: false })
      stopMotion()
      resetParallax()
    }
  }

  function onInteraction() {
    if (state.value === 'live') startIdleTimer()
    else if (state.value === 'idle') resume()
  }

  function cleanup() {
    requestToken++
    if (state.value === 'live') apply('ROUTE_LEAVE')
    else if (state.value !== 'closed') apply('CLOSE')
    releaseStream({ drop: true })
    stopMotion()
    resetParallax()
    clearIdleTimer()
    document.removeEventListener('visibilitychange', onVisibilityChange)
    document.removeEventListener('pointerdown', onInteraction)
    document.removeEventListener('touchstart', onInteraction)
    document.removeEventListener('keydown', onInteraction)
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  document.addEventListener('pointerdown', onInteraction, { passive: true })
  document.addEventListener('touchstart', onInteraction, { passive: true })
  document.addEventListener('keydown', onInteraction)

  onBeforeRouteLeave(() => cleanup())
  onBeforeUnmount(() => cleanup())

  return { state, stream, parallax, open, close }
}
