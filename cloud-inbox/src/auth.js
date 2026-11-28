import { timingSafeEqual } from 'node:crypto'

/**
 * 从 Authorization 请求头提取 Bearer Token。
 * @param {unknown} authHeader
 * @returns {string | null}
 */
export function extractBearerToken(authHeader) {
  if (typeof authHeader !== 'string') return null
  const trimmed = authHeader.trim()
  if (!trimmed) return null
  const match = /^Bearer\s+(\S+)$/i.exec(trimmed)
  return match ? match[1] : null
}

/**
 * 使用常量时间比对校验 Bearer Token；空期望值恒返回 false（fail-closed）。
 * @param {unknown} authHeader
 * @param {string} expectedToken
 * @returns {boolean}
 */
export function verifyBearerToken(authHeader, expectedToken) {
  if (typeof expectedToken !== 'string' || !expectedToken) return false
  const provided = extractBearerToken(authHeader)
  if (!provided) return false

  const providedBuf = Buffer.from(provided, 'utf8')
  const expectedBuf = Buffer.from(expectedToken, 'utf8')
  if (providedBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(providedBuf, expectedBuf)
}
