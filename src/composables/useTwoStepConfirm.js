/**
 * composables/useTwoStepConfirm.js — 两段式危险操作确认状态机
 *
 * 首次 trigger 进入确认态并启动倒计时（默认 3000ms 自动复原）；
 * 倒计时内再次 trigger 立即复原状态并执行确认回调（返回 true）。
 * 在组件上下文内自动绑定 onBeforeUnmount(dispose)，在单测环境不触发警告。
 */
import { getCurrentInstance, onBeforeUnmount, ref } from 'vue'

/**
 * @param {{ timeout?: number }} [options]
 * @returns {{
 *   confirming: import('vue').Ref<boolean>,
 *   trigger: (onConfirm?: () => void) => boolean,
 *   reset: () => void,
 *   dispose: () => void,
 * }}
 */
export function useTwoStepConfirm({ timeout = 3000 } = {}) {
  const confirming = ref(false)
  let timer = null

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function reset() {
    clearTimer()
    confirming.value = false
  }

  function trigger(onConfirm) {
    if (!confirming.value) {
      confirming.value = true
      clearTimer()
      if (Number.isFinite(timeout) && timeout > 0) {
        timer = setTimeout(() => {
          timer = null
          confirming.value = false
        }, timeout)
      }
      return false
    }
    reset()
    if (typeof onConfirm === 'function') {
      onConfirm()
    }
    return true
  }

  function dispose() {
    reset()
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(dispose)
  }

  return { confirming, trigger, reset, dispose }
}
