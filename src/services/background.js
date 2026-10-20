/**
 * services/background.js — 背景素材的纯校验（零 DOM）
 *
 * 只负责 MIME → kind、大小上限与描述符形状；解码探针、OPFS、objectURL
 * 分别在 store / repositories 层。
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
  return { kind, mime, size: value.size, updatedAt: value.updatedAt }
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
