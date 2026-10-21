/**
 * composables/useGlassRipple.js — 全局涟漪委托（App 只调用一次）
 *
 * pointerdown 命中 [data-ripple] 宿主后插入 .ripple-clip > .ripple-drop，
 * 700ms 后移除；reduced-motion 下不创建（已批准的无障碍偏差）。
 */
import { onBeforeUnmount, onMounted } from 'vue'

const RIPPLE_LIFETIME = 700

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function useGlassRipple() {
  function onPointerDown(event) {
    if (event.button > 0 || prefersReducedMotion()) return
    const host = event.target.closest?.('[data-ripple]')
    if (!host || host.disabled || host.getAttribute('aria-disabled') === 'true') return

    const rect = host.getBoundingClientRect()
    const clip = document.createElement('span')
    clip.className = 'ripple-clip'
    const drop = document.createElement('span')
    drop.className = 'ripple-drop'
    drop.style.left = `${event.clientX - rect.left}px`
    drop.style.top = `${event.clientY - rect.top}px`
    clip.appendChild(drop)
    host.appendChild(clip)
    setTimeout(() => clip.remove(), RIPPLE_LIFETIME)
  }

  onMounted(() => {
    document.addEventListener('pointerdown', onPointerDown, { passive: true })
  })

  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onPointerDown)
  })
}
