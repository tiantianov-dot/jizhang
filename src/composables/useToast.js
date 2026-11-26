/**
 * composables/useToast.js — 托管式轻提示状态与自动消失定时器
 *
 * 统一收口各页面重复编写的 toast 文本 + setTimeout 清理逻辑；
 * 在组件上下文内自动绑定 onBeforeUnmount(dispose)，在单测等无组件实例环境不触发警告。
 */
import { getCurrentInstance, onBeforeUnmount, ref } from 'vue'

/**
 * @param {{ duration?: number, onClear?: () => void }} [options]
 * @returns {{
 *   message: import('vue').Ref<string>,
 *   show: (text: string, customDuration?: number) => void,
 *   clear: () => void,
 *   dispose: () => void,
 * }}
 */
export function useToast({ duration = 4000, onClear } = {}) {
  const message = ref('')
  let timer = null

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function clear() {
    const hadActive = timer !== null || message.value !== ''
    clearTimer()
    message.value = ''
    if (hadActive && typeof onClear === 'function') {
      onClear()
    }
  }

  function show(text, customDuration) {
    const next = text == null ? '' : String(text)
    if (!next) {
      clear()
      return
    }
    clearTimer()
    message.value = next
    const ms = customDuration === undefined ? duration : customDuration
    if (Number.isFinite(ms) && ms > 0) {
      timer = setTimeout(() => {
        timer = null
        message.value = ''
        if (typeof onClear === 'function') {
          onClear()
        }
      }, ms)
    }
  }

  function dispose() {
    clearTimer()
    message.value = ''
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(dispose)
  }

  return { message, show, clear, dispose }
}
