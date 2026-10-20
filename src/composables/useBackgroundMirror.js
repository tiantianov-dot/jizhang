/**
 * composables/useBackgroundMirror.js — L2 镜像的 rect 观测（AddView 持有）
 *
 * 每个 .gp-mirror 壳观察其所在面板：ResizeObserver + visualViewport resize
 * 更新 --bg-x / --bg-y / --bg-mag；取不到 rect 时 --bg-mag:1 且壳 data-ready=0
 * （克隆 display:none，退化为 L1）。卸载/关断时一并断开。
 *
 * 不做滚动跟踪：金额头卡与 ✓ 不随滚动移动。
 */
import { onBeforeUnmount, onMounted } from 'vue'

const MAG = '1.06'

export function useBackgroundMirror() {
  let resizeObserver = null
  let mutationObserver = null
  let frame = 0
  const observed = new Set()

  function update() {
    frame = 0
    const shells = document.querySelectorAll('.gp-mirror')
    for (const panel of observed) {
      if (!panel.isConnected) {
        resizeObserver?.unobserve(panel)
        observed.delete(panel)
      }
    }
    shells.forEach((shell) => {
      const panel = shell.parentElement
      if (!panel) return
      if (resizeObserver && !observed.has(panel)) {
        resizeObserver.observe(panel)
        observed.add(panel)
      }
      const rect = panel.getBoundingClientRect()
      if (!rect.width || !rect.height) {
        shell.style.setProperty('--bg-mag', '1')
        shell.dataset.ready = '0'
        return
      }
      shell.style.setProperty('--bg-x', `${rect.left}px`)
      shell.style.setProperty('--bg-y', `${rect.top}px`)
      shell.style.setProperty('--bg-mag', MAG)
      shell.dataset.ready = '1'
    })
  }

  function schedule() {
    if (frame) return
    frame = requestAnimationFrame(update)
  }

  onMounted(() => {
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(schedule)
    }
    mutationObserver = new MutationObserver(schedule)
    mutationObserver.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('resize', schedule)
    schedule()
  })

  onBeforeUnmount(() => {
    if (frame) cancelAnimationFrame(frame)
    resizeObserver?.disconnect()
    mutationObserver?.disconnect()
    window.removeEventListener('resize', schedule)
    window.visualViewport?.removeEventListener('resize', schedule)
  })
}
