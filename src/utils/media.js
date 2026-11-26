/**
 * utils/media.js — 媒体播放安全封装
 *
 * 用于替代散落在视频背景与沉浸取景中的匿名 `.catch(() => {})`：
 * 统一处理空元素、非 Promise 返回值以及浏览器自动播放拦截 / 切流中断，
 * 始终返回 Promise<boolean> 并确保零未捕获 rejection。
 */

const EXPECTED_PLAY_ERRORS = new Set(['NotAllowedError', 'AbortError'])

/**
 * 安全触发 HTMLMediaElement 播放。
 *
 * - 无元素或缺少 play 方法：返回 false
 * - el.play() 同步成功或返回的 Promise resolve：返回 true
 * - el.play() 同步抛错或返回的 Promise reject：捕获并返回 false；
 *   对非预期错误（非 NotAllowedError / AbortError）可通过 onUnexpectedError 回调感知
 *
 * @param {{ play?: () => (Promise<void> | void) } | null | undefined} el
 * @param {{ onUnexpectedError?: (err: unknown) => void }} [options]
 * @returns {Promise<boolean>} 是否成功启动播放
 */
export async function playMediaSafely(el, { onUnexpectedError } = {}) {
  if (!el || typeof el.play !== 'function') return false
  try {
    await el.play()
    return true
  } catch (err) {
    const expected = err != null && typeof err === 'object' && EXPECTED_PLAY_ERRORS.has(err.name)
    if (!expected && typeof onUnexpectedError === 'function') {
      onUnexpectedError(err)
    }
    return false
  }
}
