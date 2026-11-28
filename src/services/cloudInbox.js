/**
 * services/cloudInbox.js — 云端临时收件箱同步服务
 *
 * 严格遵循单向分层：通过注入或默认的 repositories/records 与 repositories/categories 落库，
 * 金额经 services/entry.js 的 normalizeEntryDraft 转为整数分，本地写入成功后再调 /ack。
 */
import * as defaultRecordsRepo from '@/repositories/records'
import * as defaultCategoriesRepo from '@/repositories/categories'
import { normalizeEntryDraft } from '@/services/entry'

export const CLOUD_RECORD_ID_PREFIX = 'cloud:'
const DEFAULT_TIMEOUT_MS = 10000

/**
 * 将云端账单 id 确定性映射为本地 RecordItem.id。
 * @param {unknown} cloudId
 * @returns {string}
 */
export function makeCloudRecordId(cloudId) {
  if (typeof cloudId !== 'string') return ''
  const trimmed = cloudId.trim()
  if (!trimmed) return ''
  return `${CLOUD_RECORD_ID_PREFIX}${trimmed}`
}

/**
 * 规整云端收件箱 URL（只接受 http/https，去除末尾斜杠）。
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeInboxUrl(raw) {
  if (typeof raw !== 'string') return ''
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    return ''
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
  if (!parsed.hostname || parsed.username || parsed.password) return ''
  return trimmed
}

/**
 * 判断收件箱配置是否完整（URL 与密码均非空有效）。
 * @param {{ url?: unknown, token?: unknown } | null | undefined} config
 * @returns {boolean}
 */
export function isInboxConfigured(config) {
  return Boolean(
    normalizeInboxUrl(config?.url) && typeof config?.token === 'string' && config.token.trim(),
  )
}

/**
 * 从全部分类中提取未归档的支出/收入名称清单，供 PUT /categories 使用。
 * @param {Array<{ name?: string, type?: string, archived?: boolean }>} categories
 * @returns {{ expense: string[], income: string[] }}
 */
export function buildCategoriesPayload(categories) {
  const expense = []
  const income = []
  const seenExpense = new Set()
  const seenIncome = new Set()

  if (!Array.isArray(categories)) return { expense, income }

  for (const cat of categories) {
    if (!cat || cat.archived) continue
    const name = typeof cat.name === 'string' ? cat.name.trim() : ''
    if (!name) continue
    if (cat.type === 'expense' && !seenExpense.has(name)) {
      seenExpense.add(name)
      expense.push(name)
    } else if (cat.type === 'income' && !seenIncome.has(name)) {
      seenIncome.add(name)
      income.push(name)
    }
  }

  return { expense, income }
}

function extractIsoDatePrefix(raw) {
  if (typeof raw !== 'string') return ''
  const trimmed = raw.trim()
  if (trimmed.length < 10) return ''
  if (trimmed.length > 10 && trimmed[10] !== 'T' && trimmed[10] !== ' ') return ''
  return trimmed.slice(0, 10)
}

function resolveCategoryId(categories, type, categoryName) {
  const list = Array.isArray(categories) ? categories : []
  const active = list.filter((c) => c && !c.archived && c.type === type)
  if (categoryName) {
    const matched = active.find((c) => typeof c.name === 'string' && c.name.trim() === categoryName)
    if (matched) return matched.id
  }
  const fallbackBuiltinId = `builtin:${type}:other`
  const activeBuiltinOther = active.find((c) => c.id === fallbackBuiltinId)
  if (activeBuiltinOther) return activeBuiltinOther.id
  if (active.length > 0) return active[0].id
  const anyBuiltinOther = list.find((c) => c && c.id === fallbackBuiltinId)
  return anyBuiltinOther ? anyBuiltinOther.id : ''
}

/**
 * 将云端待同步条目规整为本地 RecordItem 写入参数；无效金额/类型/缺 ID 返回 null。
 * @param {Record<string, unknown>} item
 * @param {Array<object>} categories
 * @returns {{ id: string, amount: number, type: 'expense'|'income', categoryId: string, note: string, date: string, private: false } | null}
 */
export function mapCloudItemToRecordInput(item, categories) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const id = makeCloudRecordId(item.id)
  if (!id) return null

  const cleanedNote = typeof item.note === 'string' ? item.note.replace(/\s+/g, ' ').trim() : ''
  const draft = normalizeEntryDraft({
    amount: item.amount,
    type: item.type,
    note: cleanedNote,
    date: extractIsoDatePrefix(item.occurredAt),
    category: item.categoryName ?? item.category,
  })

  if (!draft.valid.amount || draft.amount <= 0 || !draft.valid.type) return null

  const categoryId = resolveCategoryId(categories, draft.type, draft.categoryName)
  if (!categoryId) return null

  return {
    id,
    amount: draft.amount,
    type: draft.type,
    categoryId,
    note: draft.note,
    date: draft.date,
    private: false,
  }
}

function createInboxError(code, message, status = 0) {
  const err = new Error(message)
  err.code = code
  err.status = status
  return err
}

async function requestInbox(
  config,
  path,
  { method = 'GET', body } = {},
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
) {
  const baseUrl = normalizeInboxUrl(config?.url)
  const token = typeof config?.token === 'string' ? config.token.trim() : ''
  if (!baseUrl || !token) {
    throw createInboxError('NOT_CONFIGURED', '请先配置收件箱地址与同步密码')
  }
  if (typeof fetchImpl !== 'function') {
    throw createInboxError('NETWORK_ERROR', '当前环境不支持网络请求')
  }

  const headers = {
    Authorization: `Bearer ${token}`,
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const controller = new AbortController()
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null

  try {
    let res
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
    } catch (err) {
      if (err?.name === 'AbortError') {
        throw createInboxError('TIMEOUT', '连接超时，请检查云端服务地址')
      }
      throw createInboxError('NETWORK_ERROR', '无法连接云端收件箱，请检查地址、网络或跨域配置')
    }

    if (res.status === 401) {
      throw createInboxError('UNAUTHORIZED', '同步密码错误（401）', 401)
    }
    if (!res.ok) {
      throw createInboxError('HTTP_ERROR', `云端服务返回错误（HTTP ${res.status}）`, res.status)
    }

    try {
      return await res.json()
    } catch {
      throw createInboxError('INVALID_RESPONSE', '云端返回数据格式异常', res.status)
    }
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
}

/**
 * 测试与云端收件箱的连通性、CORS 与 Bearer 密码校验（只读 GET /pending）。
 * @param {{ url?: string, token?: string }} config
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [deps]
 */
export async function testConnection(
  config,
  { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  if (!isInboxConfigured(config)) {
    return { ok: false, code: 'NOT_CONFIGURED', error: '请先填写有效的收件箱地址与同步密码' }
  }
  try {
    const data = await requestInbox(config, '/pending', { method: 'GET' }, fetchImpl, timeoutMs)
    if (!Array.isArray(data?.items)) {
      return { ok: false, code: 'INVALID_RESPONSE', error: '云端返回数据结构异常' }
    }
    return { ok: true, pendingCount: data.items.length }
  } catch (err) {
    return {
      ok: false,
      code: err?.code || 'ERROR',
      error: err?.message || '连接测试失败',
    }
  }
}

/**
 * 推送本地未归档的支出/收入分类清单到 PUT /categories。
 * @param {{ url?: string, token?: string }} config
 * @param {{ fetchImpl?: typeof fetch, categoriesRepo?: typeof defaultCategoriesRepo, timeoutMs?: number }} [deps]
 */
export async function syncCategories(
  config,
  {
    fetchImpl = globalThis.fetch,
    categoriesRepo = defaultCategoriesRepo,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {},
) {
  if (!isInboxConfigured(config)) {
    return {
      ok: false,
      configured: false,
      code: 'NOT_CONFIGURED',
      error: '请先填写有效的收件箱地址与同步密码',
    }
  }
  try {
    const allCategories = await categoriesRepo.listAll()
    const payload = buildCategoriesPayload(allCategories)
    const data = await requestInbox(
      config,
      '/categories',
      { method: 'PUT', body: payload },
      fetchImpl,
      timeoutMs,
    )
    return {
      ok: true,
      configured: true,
      expenseCount: payload.expense.length,
      incomeCount: payload.income.length,
      updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : '',
    }
  } catch (err) {
    return {
      ok: false,
      configured: true,
      code: err?.code || 'ERROR',
      error: err?.message || '同步分类失败',
    }
  }
}

/**
 * 拉取云端 /pending 账单：按 cloud:<id> 事务级防重 → 写入本地 records → 仅对本地已确认成功条目调 /ack。
 * @param {{ url?: string, token?: string }} config
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   recordsRepo?: typeof defaultRecordsRepo,
 *   categoriesRepo?: typeof defaultCategoriesRepo,
 *   timeoutMs?: number,
 * }} [deps]
 */
export async function syncPending(
  config,
  {
    fetchImpl = globalThis.fetch,
    recordsRepo = defaultRecordsRepo,
    categoriesRepo = defaultCategoriesRepo,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {},
) {
  if (!isInboxConfigured(config)) {
    return {
      ok: true,
      configured: false,
      synced: 0,
      skippedDuplicates: 0,
      failed: 0,
      invalid: 0,
      acked: 0,
      ackFailed: false,
    }
  }

  let data
  try {
    data = await requestInbox(config, '/pending', { method: 'GET' }, fetchImpl, timeoutMs)
  } catch (err) {
    return {
      ok: false,
      configured: true,
      synced: 0,
      skippedDuplicates: 0,
      failed: 0,
      invalid: 0,
      acked: 0,
      ackFailed: false,
      code: err?.code || 'ERROR',
      error: err?.message || '拉取待同步账单失败',
    }
  }

  const items = Array.isArray(data?.items) ? data.items : []
  if (items.length === 0) {
    return {
      ok: true,
      configured: true,
      synced: 0,
      skippedDuplicates: 0,
      failed: 0,
      invalid: 0,
      acked: 0,
      ackFailed: false,
    }
  }

  const candidateIds = items.map((item) => makeCloudRecordId(item?.id)).filter(Boolean)
  const [existingSet, categories] = await Promise.all([
    recordsRepo.existingIds(candidateIds),
    categoriesRepo.listAll(),
  ])

  let synced = 0
  let skippedDuplicates = 0
  let failed = 0
  let invalid = 0
  const idsToAck = []

  for (const item of items) {
    const cloudId = typeof item?.id === 'string' ? item.id.trim() : ''
    const localId = makeCloudRecordId(cloudId)
    if (!localId) {
      invalid += 1
      continue
    }
    if (existingSet.has(localId)) {
      skippedDuplicates += 1
      idsToAck.push(cloudId)
      continue
    }

    const recordInput = mapCloudItemToRecordInput(item, categories)
    if (!recordInput) {
      invalid += 1
      continue
    }

    try {
      await recordsRepo.add(recordInput)
      synced += 1
      existingSet.add(localId)
      idsToAck.push(cloudId)
    } catch {
      // 本地写库失败时严禁加入 idsToAck，确保云端安全保留
      failed += 1
    }
  }

  let acked = 0
  let ackFailed = false
  let ackError = ''

  if (idsToAck.length > 0) {
    const uniqueAckIds = [...new Set(idsToAck)]
    try {
      const ackRes = await requestInbox(
        config,
        '/ack',
        { method: 'POST', body: { ids: uniqueAckIds } },
        fetchImpl,
        timeoutMs,
      )
      acked = Number.isInteger(ackRes?.acked) ? ackRes.acked : uniqueAckIds.length
    } catch (err) {
      ackFailed = true
      ackError = err?.message || '云端确认清理失败'
    }
  }

  const hasWriteFailure = failed > 0
  return {
    ok: !hasWriteFailure,
    configured: true,
    synced,
    skippedDuplicates,
    failed,
    invalid,
    acked,
    ackFailed,
    ...(ackError ? { ackError } : {}),
    ...(hasWriteFailure ? { error: '部分账单写入本地失败，已保留在云端' } : {}),
  }
}
