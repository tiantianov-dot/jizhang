/**
 * services/background.js — 背景素材的纯校验（零 DOM）
 *
 * 只负责 MIME → kind、大小上限、描述符形状与铺满不放大门；解码探针、
 * OPFS、objectURL 分别在 store / repositories 层。
 */

export const LIMITS = {
  image: 8 * 1024 * 1024,
  video: 30 * 1024 * 1024,
}

export function kindOf(mime) {
  const value = String(mime || '').toLowerCase()
  if (value === 'image/gif') return 'gif'
  if (value.startsWith('image/')) return 'image'
  if (value.startsWith('video/')) return 'video'
  return ''
}

/** settings.uiBackground 的描述符；任何字段不合法都回 null（导入 fail-closed） */
export function normalizeDescriptor(value) {
  if (!value || typeof value !== 'object') return null
  const kind = value.kind
  const mime = String(value.mime || '').toLowerCase()
  if (kind !== 'image' && kind !== 'gif' && kind !== 'video') return null
  if (kind === 'video' ? !mime.startsWith('video/') : !mime.startsWith('image/')) return null
  if (!Number.isFinite(value.size) || value.size <= 0) return null
  if (typeof value.updatedAt !== 'string' || !value.updatedAt) return null
  const descriptor = { kind, mime, size: value.size, updatedAt: value.updatedAt }
  if (
    Number.isInteger(value.width) &&
    value.width > 0 &&
    Number.isInteger(value.height) &&
    value.height > 0
  ) {
    descriptor.width = value.width
    descriptor.height = value.height
  }
  return descriptor
}

/** 当前视口铺满所需的最小物理像素；触屏按屏幕长边同时约束宽高 */
export function coverRequirement(view) {
  const dpr = Number(view.dpr) > 0 ? Number(view.dpr) : 1
  if (view.coarse) {
    const maxCss = Math.max(
      Number(view.screenW) || Number(view.innerWidth) || 0,
      Number(view.screenH) || Number(view.innerHeight) || 0,
    )
    const need = Math.ceil(maxCss * dpr)
    return { width: need, height: need }
  }
  return {
    width: Math.ceil((Number(view.innerWidth) || 0) * dpr),
    height: Math.ceil((Number(view.innerHeight) || 0) * dpr),
  }
}

export function checkCoverResolution(width, height, view) {
  const need = coverRequirement(view)
  if (width >= need.width && height >= need.height) {
    return { ok: true, width: need.width, height: need.height }
  }
  return {
    ok: false,
    width: need.width,
    height: need.height,
    message: `分辨率不足：至少需要 ${need.width}×${need.height} 物理像素（当前 ${width}×${height}），铺满会被放大`,
  }
}

export function validateMeta(file) {
  const mime = String((file && file.type) || '').toLowerCase()
  const kind = kindOf(mime)
  if (!kind) return { ok: false, message: '无法识别的文件类型，请选择图片或视频' }
  const size = Number(file.size)
  if (!Number.isFinite(size) || size <= 0) return { ok: false, message: '无法读取空文件' }
  const limit = kind === 'video' ? LIMITS.video : LIMITS.image
  if (size > limit) {
    return { ok: false, message: `文件超过 ${kind === 'video' ? 30 : 8} MB 上限` }
  }
  return { ok: true, kind, mime, size }
}
