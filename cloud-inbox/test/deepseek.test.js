import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildSystemPrompt,
  createDeepSeekClient,
  extractValidDate,
  getTodayInTimezone,
  isValidCalendarDate,
  parsePositiveAmount,
  validateParsedBill,
} from '../src/deepseek.js'
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from '../src/defaults.js'

describe('deepseek helpers & validation', () => {
  it('resolves Asia/Shanghai date across UTC midnight boundary', () => {
    // 2026-11-28T20:30:00Z is 2026-11-29 04:30:00 in Asia/Shanghai (UTC+8)
    const utcMoment = new Date('2026-11-28T20:30:00.000Z')
    assert.equal(getTodayInTimezone('Asia/Shanghai', utcMoment), '2026-11-29')
    assert.equal(getTodayInTimezone('UTC', utcMoment), '2026-11-28')
  })

  it('validates real calendar dates and rejects impossible dates', () => {
    assert.equal(isValidCalendarDate('2026-11-28'), true)
    assert.equal(isValidCalendarDate('2024-02-29'), true)
    assert.equal(isValidCalendarDate('2026-02-29'), false)
    assert.equal(isValidCalendarDate('2026-02-30'), false)
    assert.equal(isValidCalendarDate('2026-13-01'), false)
    assert.equal(isValidCalendarDate('2026/11/28'), false)

    assert.equal(extractValidDate('2026-11-28T14:25:00+08:00'), '2026-11-28')
    assert.equal(extractValidDate(' 2026-11-28 09:00 '), '2026-11-28')
    assert.equal(extractValidDate('2026-11-28xyz'), null)
    assert.equal(extractValidDate('2026-02-30'), null)
  })

  it('strictly parses positive amounts with at most 2 decimals', () => {
    assert.equal(parsePositiveAmount(28.5), 28.5)
    assert.equal(parsePositiveAmount(0.01), 0.01)
    assert.equal(parsePositiveAmount(9999999.99), 9999999.99)
    assert.equal(parsePositiveAmount('¥1,234.50'), 1234.5)
    assert.equal(parsePositiveAmount('￥ 35.5元'), 35.5)
    assert.equal(parsePositiveAmount('100块'), 100)

    assert.equal(parsePositiveAmount(0), null)
    assert.equal(parsePositiveAmount('0'), null)
    assert.equal(parsePositiveAmount('0.00'), null)
    assert.equal(parsePositiveAmount(-12.5), null)
    assert.equal(parsePositiveAmount('-28.50'), null)
    assert.equal(parsePositiveAmount(0.001), null)
    assert.equal(parsePositiveAmount('0.001'), null)
    assert.equal(parsePositiveAmount(12.345), null)
    assert.equal(parsePositiveAmount('12.345'), null)
    assert.equal(parsePositiveAmount('10.5.3'), null)
    assert.equal(parsePositiveAmount(Number.NaN), null)
    assert.equal(parsePositiveAmount(Number.POSITIVE_INFINITY), null)
    assert.equal(parsePositiveAmount('abc'), null)
    assert.equal(parsePositiveAmount(''), null)
    assert.equal(parsePositiveAmount(null), null)
    assert.equal(parsePositiveAmount(10000000), null)
  })

  it('builds prompt with 16 builtin categories fallback and actual-paid priority rules', () => {
    const prompt = buildSystemPrompt({ today: '2026-11-28' })
    for (const name of DEFAULT_EXPENSE_CATEGORIES) {
      assert.ok(prompt.includes(name), `missing expense category ${name}`)
    }
    for (const name of DEFAULT_INCOME_CATEGORIES) {
      assert.ok(prompt.includes(name), `missing income category ${name}`)
    }
    assert.ok(prompt.includes('实付'))
    assert.ok(prompt.includes('满减'))
    assert.ok(prompt.includes('立减金'))
    assert.ok(prompt.includes('红包'))
    assert.ok(prompt.includes('2026-11-28'))
  })

  it('validates parsed expense, income, fallback category, note trimming, and rejection cases', () => {
    const categories = {
      expense: ['餐饮', '交通', '其他'],
      income: ['工资', '其他'],
    }

    const validExpense = validateParsedBill(
      {
        valid: true,
        type: 'expense',
        amount: '¥28.50',
        categoryName: '餐饮',
        note: '  瑞幸咖啡\n生椰拿铁超长备注测试一二三四五六七八九十零一二三四五 ',
        occurredAt: '2026-11-28',
      },
      { categories, fallbackDate: '2026-11-27' },
    )
    assert.equal(validExpense.ok, true)
    assert.deepEqual(validExpense.value, {
      type: 'expense',
      amount: 28.5,
      categoryName: '餐饮',
      note: '瑞幸咖啡 生椰拿铁超长备注测试一二三四五六七八九十零一二三四五'.slice(0, 30),
      occurredAt: '2026-11-28',
    })

    const unknownCategoryFallback = validateParsedBill(
      {
        valid: true,
        type: 'income',
        amount: 8000,
        categoryName: '不在列表的分类',
        note: '11月工资',
        occurredAt: '2026-02-30',
      },
      { categories, fallbackDate: '2026-11-28' },
    )
    assert.equal(unknownCategoryFallback.ok, true)
    assert.deepEqual(unknownCategoryFallback.value, {
      type: 'income',
      amount: 8000,
      categoryName: '其他',
      note: '11月工资',
      occurredAt: '2026-11-28',
    })

    assert.equal(
      validateParsedBill({ valid: false, amount: null }, { categories, fallbackDate: '2026-11-28' })
        .ok,
      false,
    )
    assert.equal(
      validateParsedBill({ valid: true, type: 'expense', amount: 0 }, { categories }).ok,
      false,
    )
    assert.equal(
      validateParsedBill({ valid: true, type: 'expense', amount: 0.001 }, { categories }).ok,
      false,
    )
    assert.equal(
      validateParsedBill({ valid: true, type: 'transfer', amount: 10 }, { categories }).ok,
      false,
    )
  })

  it('calls OpenAI-compatible DeepSeek endpoint via mock fetch and parses fenced JSON', async () => {
    const captured = []
    const mockFetch = async (url, init) => {
      captured.push({ url, init })
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '```json\n{"valid":true,"type":"expense","amount":28.5,"categoryName":"餐饮","note":"瑞幸咖啡","occurredAt":"2026-11-28"}\n```',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const client = createDeepSeekClient({
      apiKey: 'mock-test-key',
      baseUrl: 'https://mock.deepseek.local/v1/',
      model: 'deepseek-chat',
      fetchImpl: mockFetch,
      timeoutMs: 5000,
    })

    const result = await client.parseBillText({
      text: '瑞幸咖啡 原价38 满减5 立减金2.5 红包2 实付28.50元',
      categories: { expense: ['餐饮', '其他'], income: ['工资', '其他'] },
      today: '2026-11-28',
      occurredAtHint: '2026-11-28',
    })

    assert.equal(captured.length, 1)
    assert.equal(captured[0].url, 'https://mock.deepseek.local/v1/chat/completions')
    assert.equal(captured[0].init.method, 'POST')
    assert.equal(captured[0].init.headers.Authorization, 'Bearer mock-test-key')

    const body = JSON.parse(captured[0].init.body)
    assert.equal(body.model, 'deepseek-chat')
    assert.equal(body.temperature, 0)
    assert.deepEqual(body.response_format, { type: 'json_object' })
    assert.equal(result.amount, 28.5)
    assert.equal(result.categoryName, '餐饮')
  })

  it('rejects when DeepSeek HTTP fails or key missing', async () => {
    const noKeyClient = createDeepSeekClient({ apiKey: '' })
    await assert.rejects(() => noKeyClient.parseBillText({ text: '午饭 20元' }))

    const errClient = createDeepSeekClient({
      apiKey: 'mock-key',
      fetchImpl: async () => new Response('upstream error', { status: 503 }),
    })
    await assert.rejects(() => errClient.parseBillText({ text: '午饭 20元' }), /HTTP 503/)
  })
})
