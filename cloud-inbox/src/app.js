import { verifyBearerToken } from './auth.js'
import { buildCorsHeaders } from './cors.js'
import { extractValidDate, getTodayInTimezone, validateParsedBill } from './deepseek.js'
import { MAX_BODY_BYTES, resolveCategories, sanitizeCategoryList } from './defaults.js'
import {
  formatIngestSuccess,
  REPLY_AI_UNAVAILABLE,
  REPLY_EMPTY_TEXT,
  REPLY_NO_AMOUNT,
  REPLY_PAYLOAD_TOO_LARGE,
} from './formatReply.js'

const SERVICE_NAME = 'jizhang-cloud-inbox'

function sendText(res, status, text, headers = {}) {
  res.writeHead(status, {
    ...headers,
    'Content-Type': 'text/plain; charset=utf-8',
  })
  res.end(text)
}

function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, {
    ...headers,
    'Content-Type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(payload))
}

function createHttpError(statusCode, code) {
  const err = new Error(code)
  err.statusCode = statusCode
  err.code = code
  return err
}

async function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buf.length
    if (total > maxBytes) {
      throw createHttpError(413, 'payload_too_large')
    }
    chunks.push(buf)
  }
  const rawText = Buffer.concat(chunks).toString('utf8').trim()
  if (!rawText) {
    throw createHttpError(400, 'empty_body')
  }
  try {
    return JSON.parse(rawText)
  } catch {
    throw createHttpError(400, 'invalid_json')
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * 创建无状态 HTTP 请求监听函数，所有状态与外部依赖均通过参数注入。
 * @param {{
 *   config: { inboxToken: string, allowedOrigins?: string[], allowLocalhostOrigins?: boolean, defaultTimezone?: string },
 *   store: {
 *     addPending: Function,
 *     listPending: Function,
 *     ackPending: Function,
 *     getCategories: Function,
 *     saveCategories: Function,
 *   },
 *   aiClient: { parseBillText: Function },
 *   now?: () => Date,
 * }} deps
 */
export function createApp({ config, store, aiClient, now = () => new Date() }) {
  async function handleIngest(req, res, corsHeaders) {
    let body
    try {
      body = await readJsonBody(req)
    } catch (err) {
      if (err.statusCode === 413) {
        return sendText(res, 413, REPLY_PAYLOAD_TOO_LARGE, corsHeaders)
      }
      return sendText(res, 400, REPLY_EMPTY_TEXT, corsHeaders)
    }

    if (!isPlainObject(body) || typeof body.text !== 'string' || !body.text.trim()) {
      return sendText(res, 400, REPLY_EMPTY_TEXT, corsHeaders)
    }

    const today = getTodayInTimezone(config.defaultTimezone, now())
    const occurredAtHint = extractValidDate(body.occurredAt)
    const storedCategories = await store.getCategories()
    const categories = resolveCategories(storedCategories)

    let rawParsed
    try {
      rawParsed = await aiClient.parseBillText({
        text: body.text.trim(),
        categories,
        today,
        occurredAtHint,
      })
    } catch {
      return sendText(res, 502, REPLY_AI_UNAVAILABLE, corsHeaders)
    }

    const validation = validateParsedBill(rawParsed, {
      categories,
      fallbackDate: occurredAtHint ?? today,
    })
    if (!validation.ok) {
      return sendText(res, 422, REPLY_NO_AMOUNT, corsHeaders)
    }

    const saved = await store.addPending(validation.value)
    return sendText(res, 200, formatIngestSuccess(saved), corsHeaders)
  }

  async function handlePending(res, corsHeaders) {
    const items = await store.listPending()
    return sendJson(res, 200, { items }, corsHeaders)
  }

  async function handleAck(req, res, corsHeaders) {
    let body
    try {
      body = await readJsonBody(req)
    } catch (err) {
      return sendJson(
        res,
        err.statusCode || 400,
        { error: err.code || 'invalid_json' },
        corsHeaders,
      )
    }

    if (
      !isPlainObject(body) ||
      !Array.isArray(body.ids) ||
      body.ids.some((id) => typeof id !== 'string')
    ) {
      return sendJson(res, 400, { error: 'invalid_ids' }, corsHeaders)
    }

    const result = await store.ackPending(body.ids)
    return sendJson(res, 200, result, corsHeaders)
  }

  async function handlePutCategories(req, res, corsHeaders) {
    let body
    try {
      body = await readJsonBody(req)
    } catch (err) {
      return sendJson(
        res,
        err.statusCode || 400,
        { error: err.code || 'invalid_json' },
        corsHeaders,
      )
    }

    if (!isPlainObject(body) || !Array.isArray(body.expense) || !Array.isArray(body.income)) {
      return sendJson(res, 400, { error: 'invalid_categories' }, corsHeaders)
    }

    const expense = sanitizeCategoryList(body.expense)
    const income = sanitizeCategoryList(body.income)
    const saved = await store.saveCategories({
      expense,
      income,
      updatedAt: now().toISOString(),
    })

    return sendJson(
      res,
      200,
      {
        ok: true,
        expenseCount: saved.expense.length,
        incomeCount: saved.income.length,
        updatedAt: saved.updatedAt,
      },
      corsHeaders,
    )
  }

  return async function requestListener(req, res) {
    const corsHeaders = buildCorsHeaders(req.headers.origin, config)

    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders)
        res.end()
        return
      }

      const url = new URL(req.url || '/', 'http://localhost')
      const { pathname } = url

      if (pathname === '/health') {
        if (req.method !== 'GET') {
          return sendJson(
            res,
            405,
            { error: 'method_not_allowed' },
            { ...corsHeaders, Allow: 'GET' },
          )
        }
        return sendJson(res, 200, { ok: true, service: SERVICE_NAME }, corsHeaders)
      }

      if (!verifyBearerToken(req.headers.authorization, config.inboxToken)) {
        return sendJson(res, 401, { error: 'unauthorized' }, corsHeaders)
      }

      if (pathname === '/ingest') {
        if (req.method !== 'POST') {
          return sendJson(
            res,
            405,
            { error: 'method_not_allowed' },
            { ...corsHeaders, Allow: 'POST' },
          )
        }
        return await handleIngest(req, res, corsHeaders)
      }

      if (pathname === '/pending') {
        if (req.method !== 'GET') {
          return sendJson(
            res,
            405,
            { error: 'method_not_allowed' },
            { ...corsHeaders, Allow: 'GET' },
          )
        }
        return await handlePending(res, corsHeaders)
      }

      if (pathname === '/ack') {
        if (req.method !== 'POST') {
          return sendJson(
            res,
            405,
            { error: 'method_not_allowed' },
            { ...corsHeaders, Allow: 'POST' },
          )
        }
        return await handleAck(req, res, corsHeaders)
      }

      if (pathname === '/categories') {
        if (req.method !== 'PUT') {
          return sendJson(
            res,
            405,
            { error: 'method_not_allowed' },
            { ...corsHeaders, Allow: 'PUT' },
          )
        }
        return await handlePutCategories(req, res, corsHeaders)
      }

      return sendJson(res, 404, { error: 'not_found' }, corsHeaders)
    } catch {
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'internal_error' }, corsHeaders)
      } else if (!res.writableEnded) {
        res.end()
      }
    }
  }
}
