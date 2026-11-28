import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, describe, it } from 'node:test'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { createMemoryStore } from '../src/storage/memoryStore.js'

const TEST_TOKEN = 'test-bearer-token-unit-only'

async function startTestServer({
  aiHandler,
  now = () => new Date('2026-11-28T10:00:00+08:00'),
} = {}) {
  const store = createMemoryStore({ now })
  const config = loadConfig({
    INBOX_TOKEN: TEST_TOKEN,
    ALLOWED_ORIGINS: 'https://example.github.io',
    ALLOW_LOCALHOST_ORIGINS: 'true',
    STORAGE_MODE: 'memory',
    DEFAULT_TIMEZONE: 'Asia/Shanghai',
  })

  const aiClient = {
    async parseBillText(params) {
      return aiHandler(params)
    },
  }

  const server = createServer(createApp({ config, store, aiClient, now }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`
  return { server, baseUrl, store, config }
}

describe('cloud-inbox HTTP contract', () => {
  let ctx
  let aiBehavior

  before(async () => {
    aiBehavior = async ({ text, categories, today }) => {
      if (text.includes('瑞幸咖啡')) {
        return {
          valid: true,
          type: 'expense',
          amount: 28.5,
          categoryName: categories.expense.includes('咖啡') ? '咖啡' : '餐饮',
          note: '瑞幸咖啡',
          occurredAt: today,
        }
      }
      if (text.includes('工资入账')) {
        return {
          valid: true,
          type: 'income',
          amount: 8000,
          categoryName: '工资',
          note: '11月工资',
          occurredAt: today,
        }
      }
      if (text.includes('无备注餐饮')) {
        return {
          valid: true,
          type: 'expense',
          amount: 18,
          categoryName: '餐饮',
          note: '',
          occurredAt: today,
        }
      }
      if (text.includes('触发超时')) {
        throw new Error('Upstream timeout')
      }
      if (text.includes('微小金额')) {
        return {
          valid: true,
          type: 'expense',
          amount: 0.001,
          categoryName: '其他',
          note: '无效',
          occurredAt: today,
        }
      }
      return { valid: false, amount: null, reason: 'no_amount' }
    }

    ctx = await startTestServer({
      aiHandler: (params) => aiBehavior(params),
    })
  })

  after(async () => {
    await new Promise((resolve) => ctx.server.close(resolve))
  })

  it('GET /health is public, leak-free, and rejects non-GET with 405', async () => {
    const res = await fetch(`${ctx.baseUrl}/health`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(body, { ok: true, service: 'jizhang-cloud-inbox' })
    assert.equal(JSON.stringify(body).includes(TEST_TOKEN), false)

    const postRes = await fetch(`${ctx.baseUrl}/health`, { method: 'POST' })
    assert.equal(postRes.status, 405)
  })

  it('returns 401 on all protected endpoints when Authorization header is missing or invalid', async () => {
    const targets = [
      ['POST', '/ingest', JSON.stringify({ text: '午饭 20元' })],
      ['GET', '/pending', undefined],
      ['POST', '/ack', JSON.stringify({ ids: ['1'] })],
      ['PUT', '/categories', JSON.stringify({ expense: ['餐饮'], income: ['工资'] })],
    ]

    const badHeaders = [
      undefined,
      'Basic dXNlcjpwYXNz',
      'Bearer',
      'Bearer wrong',
      `Bearer ${'x'.repeat(TEST_TOKEN.length)}`,
    ]

    for (const [method, path, body] of targets) {
      for (const auth of badHeaders) {
        const headers = body ? { 'Content-Type': 'application/json' } : {}
        if (auth !== undefined) headers.Authorization = auth
        const res = await fetch(`${ctx.baseUrl}${path}`, { method, headers, body })
        assert.equal(res.status, 401, `${method} ${path} with auth=${auth}`)
        const payload = await res.json()
        assert.deepEqual(payload, { error: 'unauthorized' })
      }
    }
  })

  it('handles OPTIONS preflight and CORS origin allowlist properly', async () => {
    const preflightAllowed = await fetch(`${ctx.baseUrl}/pending`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://example.github.io',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Authorization, Content-Type',
      },
    })
    assert.equal(preflightAllowed.status, 204)
    assert.equal(
      preflightAllowed.headers.get('access-control-allow-origin'),
      'https://example.github.io',
    )
    assert.equal(preflightAllowed.headers.get('vary'), 'Origin')
    assert.ok(
      preflightAllowed.headers.get('access-control-allow-headers')?.includes('Authorization'),
    )

    const preflightLocal = await fetch(`${ctx.baseUrl}/ingest`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5199' },
    })
    assert.equal(preflightLocal.status, 204)
    assert.equal(preflightLocal.headers.get('access-control-allow-origin'), 'http://localhost:5199')

    const preflightDisallowed = await fetch(`${ctx.baseUrl}/pending`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example.net' },
    })
    assert.equal(preflightDisallowed.status, 204)
    assert.equal(preflightDisallowed.headers.get('access-control-allow-origin'), null)
    assert.equal(preflightDisallowed.headers.get('vary'), 'Origin')
  })

  it('supports ingest -> pending -> ack -> categories lifecycle and edge rejections', async () => {
    const authHeaders = {
      Authorization: `Bearer ${TEST_TOKEN}`,
      'Content-Type': 'application/json',
    }

    // 1. Complex OCR payment screenshot (fallback builtin categories)
    const ingestExpense = await fetch(`${ctx.baseUrl}/ingest`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        text: '瑞幸咖啡 原价¥38.00 店铺满减-5.00 支付立减金-2.50 红包-2.00 实付¥28.50',
      }),
    })
    assert.equal(ingestExpense.status, 200)
    assert.equal(ingestExpense.headers.get('content-type'), 'text/plain; charset=utf-8')
    assert.equal(await ingestExpense.text(), '✅ 已暂存：餐饮 -¥28.50（瑞幸咖啡）')

    // 2. Sync custom categories via PUT /categories and confirm immediate effect
    const putCats = await fetch(`${ctx.baseUrl}/categories`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        expense: [' 咖啡 ', '餐饮', '咖啡', '', '交通'],
        income: ['工资', '其他'],
      }),
    })
    assert.equal(putCats.status, 200)
    const putCatsJson = await putCats.json()
    assert.equal(putCatsJson.ok, true)
    assert.equal(putCatsJson.expenseCount, 3)
    assert.equal(putCatsJson.incomeCount, 2)

    // Now 瑞幸咖啡 matches synced custom category 「咖啡」
    const ingestCustomCat = await fetch(`${ctx.baseUrl}/ingest`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ text: '瑞幸咖啡 实付28.50' }),
    })
    assert.equal(ingestCustomCat.status, 200)
    assert.equal(await ingestCustomCat.text(), '✅ 已暂存：咖啡 -¥28.50（瑞幸咖啡）')

    // 3. Income notification & no-note formatting
    const ingestIncome = await fetch(`${ctx.baseUrl}/ingest`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ text: '招商银行通知：工资入账8000.00元' }),
    })
    assert.equal(ingestIncome.status, 200)
    assert.equal(await ingestIncome.text(), '✅ 已暂存：工资 +¥8000.00（11月工资）')

    const ingestNoNote = await fetch(`${ctx.baseUrl}/ingest`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ text: '无备注餐饮 实付18元' }),
    })
    assert.equal(ingestNoNote.status, 200)
    assert.equal(await ingestNoNote.text(), '✅ 已暂存：餐饮 -¥18.00')

    // 4. Rejections that must NOT write dirty entries to pending queue
    const noAmountRes = await fetch(`${ctx.baseUrl}/ingest`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ text: '你好，您的验证码是 123456' }),
    })
    assert.equal(noAmountRes.status, 422)
    assert.equal(noAmountRes.headers.get('content-type'), 'text/plain; charset=utf-8')
    assert.equal(await noAmountRes.text(), '⚠️ 未识别到有效金额，未记账')

    const tinyAmountRes = await fetch(`${ctx.baseUrl}/ingest`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ text: '微小金额测试' }),
    })
    assert.equal(tinyAmountRes.status, 422)

    const emptyTextRes = await fetch(`${ctx.baseUrl}/ingest`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ text: '   ' }),
    })
    assert.equal(emptyTextRes.status, 400)
    assert.equal(await emptyTextRes.text(), '⚠️ 未提供有效文字内容，未记账')

    const malformedJsonRes = await fetch(`${ctx.baseUrl}/ingest`, {
      method: 'POST',
      headers: authHeaders,
      body: '{bad json',
    })
    assert.equal(malformedJsonRes.status, 400)

    const oversizedRes = await fetch(`${ctx.baseUrl}/ingest`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ text: 'a'.repeat(70000) }),
    })
    assert.equal(oversizedRes.status, 413)

    const aiErrRes = await fetch(`${ctx.baseUrl}/ingest`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ text: '触发超时' }),
    })
    assert.equal(aiErrRes.status, 502)

    // 5. Verify pending queue contains strictly the 4 valid items
    const pendingRes1 = await fetch(`${ctx.baseUrl}/pending`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    })
    assert.equal(pendingRes1.status, 200)
    const { items } = await pendingRes1.json()
    assert.equal(items.length, 4)

    // 6. Ack only first 2 items + nonexistent id; remaining 2 must stay intact
    const ackRes = await fetch(`${ctx.baseUrl}/ack`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ ids: [items[0].id, items[1].id, items[0].id, 'does-not-exist'] }),
    })
    assert.equal(ackRes.status, 200)
    assert.deepEqual(await ackRes.json(), {
      acked: 2,
      ids: [items[0].id, items[1].id],
    })

    const pendingRes2 = await fetch(`${ctx.baseUrl}/pending`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    })
    const remaining = await pendingRes2.json()
    assert.deepEqual(
      remaining.items.map((x) => x.id),
      [items[2].id, items[3].id],
    )
  })

  it('rejects malformed ack/categories payloads and unknown routes safely', async () => {
    const authHeaders = {
      Authorization: `Bearer ${TEST_TOKEN}`,
      'Content-Type': 'application/json',
    }

    const badAck = await fetch(`${ctx.baseUrl}/ack`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ ids: 'not-an-array' }),
    })
    assert.equal(badAck.status, 400)

    const badCats = await fetch(`${ctx.baseUrl}/categories`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ expense: 'bad' }),
    })
    assert.equal(badCats.status, 400)

    const notFound = await fetch(`${ctx.baseUrl}/unknown`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    })
    assert.equal(notFound.status, 404)
  })

  it('respects ALLOW_LOCALHOST_ORIGINS=false and empty inboxToken fail-closed', async () => {
    const strictStore = createMemoryStore()
    const strictConfig = loadConfig({
      INBOX_TOKEN: '',
      ALLOWED_ORIGINS: '',
      ALLOW_LOCALHOST_ORIGINS: 'false',
      STORAGE_MODE: 'memory',
    })
    const strictServer = createServer(
      createApp({
        config: strictConfig,
        store: strictStore,
        aiClient: { async parseBillText() {} },
      }),
    )
    await new Promise((resolve) => strictServer.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${strictServer.address().port}`

    try {
      const preflight = await fetch(`${url}/pending`, {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:5199' },
      })
      assert.equal(preflight.status, 204)
      assert.equal(preflight.headers.get('access-control-allow-origin'), null)

      const unauth = await fetch(`${url}/pending`, {
        headers: { Authorization: 'Bearer anything' },
      })
      assert.equal(unauth.status, 401)
    } finally {
      await new Promise((resolve) => strictServer.close(resolve))
    }
  })
})
