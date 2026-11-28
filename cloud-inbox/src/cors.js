const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

function isLocalhostOrigin(origin) {
  if (typeof origin !== 'string' || !URL.canParse(origin)) return false
  const parsed = new URL(origin)
  if (parsed.origin !== origin) return false
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  return LOCALHOST_HOSTS.has(parsed.hostname)
}

/**
 * 判断请求 Origin 是否命中白名单或本地开发允许策略。
 * @param {unknown} origin
 * @param {{ allowedOrigins?: string[], allowLocalhostOrigins?: boolean }} config
 * @returns {boolean}
 */
export function isAllowedOrigin(origin, config = {}) {
  if (typeof origin !== 'string' || !origin) return false
  const normalized = origin.trim()
  if (!normalized || normalized === 'null') return false

  const allowList = Array.isArray(config.allowedOrigins) ? config.allowedOrigins : []
  if (allowList.includes(normalized)) return true

  const allowLocalhost = config.allowLocalhostOrigins !== false
  return allowLocalhost && isLocalhostOrigin(normalized)
}

/**
 * 生成 CORS 响应头：始终带 Vary: Origin；仅命中允许规则的 Origin 下发 Allow-Origin。
 * @param {unknown} origin
 * @param {{ allowedOrigins?: string[], allowLocalhostOrigins?: boolean }} config
 * @returns {Record<string, string>}
 */
export function buildCorsHeaders(origin, config = {}) {
  const headers = {
    Vary: 'Origin',
  }

  if (typeof origin === 'string' && isAllowedOrigin(origin, config)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
    headers['Access-Control-Max-Age'] = '86400'
  }

  return headers
}
