import { DEFAULT_TIMEZONE, MAX_AMOUNT, MAX_NOTE_LENGTH, resolveCategories } from './defaults.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const AMOUNT_CLEAN_RE = /[¥￥$€£,\s元块圆整]/g
const POSITIVE_DECIMAL_RE = /^\d+(\.\d+)?$/

/**
 * 获取指定时区下的当天日期（YYYY-MM-DD），默认 Asia/Shanghai 防 UTC 跨日错账。
 * @param {string} [timeZone]
 * @param {Date} [nowDate]
 * @returns {string}
 */
export function getTodayInTimezone(timeZone = DEFAULT_TIMEZONE, nowDate = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(nowDate)

  let year = ''
  let month = ''
  let day = ''
  for (const part of parts) {
    if (part.type === 'year') year = part.value
    else if (part.type === 'month') month = part.value
    else if (part.type === 'day') day = part.value
  }
  return `${year}-${month}-${day}`
}

/**
 * 校验 YYYY-MM-DD 是否为真实日历日期（拒绝 2026-02-30 等无效日期）。
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidCalendarDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/**
 * 提取合法的 YYYY-MM-DD 日期（兼容 ISO 时间戳前缀），非法则返回 null。
 * @param {unknown} value
 * @returns {string | null}
 */
export function extractValidDate(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length < 10) return null
  if (trimmed.length > 10 && trimmed[10] !== 'T' && trimmed[10] !== ' ') return null
  const datePart = trimmed.slice(0, 10)
  return isValidCalendarDate(datePart) ? datePart : null
}

/**
 * 严格正数金额校验（必须 > 0 且精确至多两位小数，最大 9999999.99）。
 * @param {unknown} rawAmount
 * @returns {number | null}
 */
export function parsePositiveAmount(rawAmount) {
  if (typeof rawAmount === 'number') {
    if (!Number.isFinite(rawAmount) || rawAmount <= 0 || rawAmount > MAX_AMOUNT) return null
    const fen = Math.round(rawAmount * 100)
    if (fen < 1 || Math.abs(rawAmount * 100 - fen) > 1e-6) return null
    return Number((fen / 100).toFixed(2))
  }

  if (typeof rawAmount !== 'string') return null
  const cleaned = rawAmount.trim().replace(AMOUNT_CLEAN_RE, '')
  if (!POSITIVE_DECIMAL_RE.test(cleaned)) return null

  const dotIdx = cleaned.indexOf('.')
  if (dotIdx !== -1 && cleaned.length - dotIdx - 1 > 2) return null

  const num = Number(cleaned)
  if (!Number.isFinite(num) || num <= 0 || num > MAX_AMOUNT) return null
  const fen = Math.round(num * 100)
  if (fen < 1 || Math.abs(num * 100 - fen) > 1e-6) return null
  return Number((fen / 100).toFixed(2))
}

/**
 * 构建 DeepSeek 系统提示词，强制实付金额优先提取与无金额拒猜。
 * @param {{ categories?: { expense?: string[], income?: string[] }, today?: string }} [opts]
 * @returns {string}
 */
export function buildSystemPrompt({ categories, today } = {}) {
  const resolved = resolveCategories(categories)
  const effectiveToday = extractValidDate(today) ?? getTodayInTimezone()

  return [
    '你是极简记账 App 的账单文本解析引擎。',
    '输入可能是：1）微信/支付宝/云闪付/外卖/电商支付成功页的本地 OCR 纯文本；2）iOS 动账推送通知（银行卡、微信、支付宝收支提醒）。',
    `当前参考日期（北京时间）：${effectiveToday}。`,
    `可选支出分类（expense）：${resolved.expense.join('、')}`,
    `可选收入分类（income）：${resolved.income.join('、')}`,
    '',
    '解析规则（必须严格遵守）：',
    '1. 实付优先铁律：遇到原价、商品总额、划线价、活动优惠、满减、店铺立减、支付立减金、红包、积分抵扣时，必须提取最终实付/实际扣款金额（如「实付」「实付款」「实际支付」「付款金额」「已支付」「扣款」），绝不取优惠前原价。',
    '2. 收支方向判定：消费付款、扣款、转出为 "expense"；收款、工资入账、兼职到账、理财收益、红包领取、退款到账为 "income"。',
    '3. 无金额拒猜：若文本为普通聊天、验证码、广告、菜单浏览或不含明确交易实付金额，必须输出 {"valid":false,"amount":null,"reason":"no_amount"}，严禁编造或猜测金额。',
    '4. 分类与备注：categoryName 必须严格从上面对应收支类型的分类列表中挑选，无法确定时选「其他」；note 为简短商户/用途摘要（最多 30 字，无内容可留空串）。',
    '5. 日期：occurredAt 输出 YYYY-MM-DD；若文本中未包含明确交易日期，使用当前参考日期。',
    '6. 仅输出单个合法 JSON 对象，禁止输出任何解释或多余文本，格式如下：',
    '{"valid":true,"type":"expense","amount":28.50,"categoryName":"餐饮","note":"瑞幸咖啡","occurredAt":"YYYY-MM-DD"}',
  ].join('\n')
}

/**
 * 确定性校验与规范化 DeepSeek 解析结果。
 * @param {unknown} raw
 * @param {{ categories?: { expense?: string[], income?: string[] }, fallbackDate?: string }} [opts]
 * @returns {{ ok: true, value: { type: 'expense'|'income', amount: number, categoryName: string, note: string, occurredAt: string } } | { ok: false, reason: string }}
 */
export function validateParsedBill(raw, { categories, fallbackDate } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'invalid_payload' }
  }

  if (raw.valid === false || raw.amount === null || raw.amount === undefined) {
    return { ok: false, reason: 'no_amount' }
  }

  const type = typeof raw.type === 'string' ? raw.type.trim().toLowerCase() : ''
  if (type !== 'expense' && type !== 'income') {
    return { ok: false, reason: 'invalid_type' }
  }

  const amount = parsePositiveAmount(raw.amount)
  if (amount === null) {
    return { ok: false, reason: 'invalid_amount' }
  }

  const resolved = resolveCategories(categories)
  const pool = resolved[type]
  const rawCategory = typeof raw.categoryName === 'string' ? raw.categoryName.trim() : ''
  let categoryName
  if (rawCategory && pool.includes(rawCategory)) {
    categoryName = rawCategory
  } else if (pool.includes('其他')) {
    categoryName = '其他'
  } else {
    categoryName = pool[0] ?? '其他'
  }

  const note =
    raw.note === null || raw.note === undefined
      ? ''
      : String(raw.note).replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE_LENGTH)

  const safeFallback = extractValidDate(fallbackDate) ?? getTodayInTimezone()
  const occurredAt = extractValidDate(raw.occurredAt) ?? safeFallback

  return {
    ok: true,
    value: {
      type,
      amount,
      categoryName,
      note,
      occurredAt,
    },
  }
}

function extractJsonFromContent(content) {
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Empty response content from DeepSeek')
  }
  const stripped = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  try {
    return JSON.parse(stripped)
  } catch (cause) {
    throw new Error('Invalid JSON returned by DeepSeek', { cause })
  }
}

/**
 * 创建 DeepSeek OpenAI 兼容客户端。
 * @param {{ apiKey?: string, baseUrl?: string, model?: string, fetchImpl?: typeof fetch, timeoutMs?: number }} [opts]
 */
export function createDeepSeekClient({
  apiKey = '',
  baseUrl = 'https://api.deepseek.com/v1',
  model = 'deepseek-chat',
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000,
} = {}) {
  const endpoint = `${String(baseUrl).replace(/\/+$/, '')}/chat/completions`

  return {
    /**
     * @param {{ text: string, categories?: { expense?: string[], income?: string[] }, today?: string, occurredAtHint?: string | null }} params
     */
    async parseBillText({ text, categories, today, occurredAtHint }) {
      if (!apiKey) {
        throw new Error('DEEPSEEK_API_KEY is not configured')
      }
      if (typeof fetchImpl !== 'function') {
        throw new Error('fetch implementation is unavailable')
      }

      const userParts = []
      if (occurredAtHint) {
        userParts.push(`外部提示日期：${occurredAtHint}`)
      }
      userParts.push(`待解析文本：\n${text}`)

      const controller = new AbortController()
      const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null

      try {
        const res = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: buildSystemPrompt({ categories, today }),
              },
              {
                role: 'user',
                content: userParts.join('\n\n'),
              },
            ],
          }),
          signal: controller.signal,
        })

        if (!res.ok) {
          throw new Error(`DeepSeek API returned HTTP ${res.status}`)
        }

        const data = await res.json()
        const content = data?.choices?.[0]?.message?.content
        return extractJsonFromContent(content)
      } finally {
        if (timer !== null) {
          clearTimeout(timer)
        }
      }
    },
  }
}
