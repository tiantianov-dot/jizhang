import { DEFAULT_TIMEZONE } from './defaults.js'

function parsePort(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return 8080
  }
  const n = Number(String(raw).trim())
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`Invalid PORT value: ${raw}`)
  }
  return n
}

function parseBoolean(raw, defaultValue, name) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return defaultValue
  }
  const v = String(raw).trim().toLowerCase()
  if (v === 'true' || v === '1' || v === 'yes') return true
  if (v === 'false' || v === '0' || v === 'no') return false
  throw new Error(`Invalid ${name} boolean value: ${raw}`)
}

function parseAllowedOrigins(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return []
  const seen = new Set()
  const out = []
  for (const part of raw.split(',')) {
    const trimmed = part.trim().replace(/\/+$/, '')
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

function parseStorageMode(raw) {
  const mode =
    String(raw ?? '')
      .trim()
      .toLowerCase() || 'firestore'
  if (mode !== 'firestore' && mode !== 'memory') {
    throw new Error(`Invalid STORAGE_MODE value: ${raw}`)
  }
  return mode
}

function parseTimezone(raw) {
  const tz = String(raw ?? '').trim() || DEFAULT_TIMEZONE
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
  } catch (cause) {
    throw new Error(`Invalid DEFAULT_TIMEZONE value: ${tz}`, { cause })
  }
  return tz
}

/**
 * 从环境变量加载服务端配置。
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function loadConfig(env = process.env) {
  const baseUrl = String(env.DEEPSEEK_BASE_URL ?? '').trim() || 'https://api.deepseek.com/v1'

  return {
    port: parsePort(env.PORT),
    inboxToken: String(env.INBOX_TOKEN ?? '').trim(),
    deepseekApiKey: String(env.DEEPSEEK_API_KEY ?? '').trim(),
    deepseekBaseUrl: baseUrl.replace(/\/+$/, ''),
    deepseekModel: String(env.DEEPSEEK_MODEL ?? '').trim() || 'deepseek-chat',
    allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS),
    allowLocalhostOrigins: parseBoolean(
      env.ALLOW_LOCALHOST_ORIGINS,
      true,
      'ALLOW_LOCALHOST_ORIGINS',
    ),
    storageMode: parseStorageMode(env.STORAGE_MODE),
    defaultTimezone: parseTimezone(env.DEFAULT_TIMEZONE),
    firestoreCollectionPrefix: String(env.FIRESTORE_COLLECTION_PREFIX ?? '').trim(),
    nodeEnv: String(env.NODE_ENV ?? '').trim() || 'development',
  }
}

/**
 * 生产/Firestore 模式下强制要求配置 INBOX_TOKEN（fail-closed）。
 * @param {ReturnType<typeof loadConfig>} config
 */
export function assertServerConfig(config) {
  if (
    (config.nodeEnv === 'production' || config.storageMode === 'firestore') &&
    !config.inboxToken
  ) {
    throw new Error('INBOX_TOKEN must be configured in production/firestore mode')
  }
}
