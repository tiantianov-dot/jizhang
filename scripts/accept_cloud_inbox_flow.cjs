/**
 * E2E 验收：云端临时收件箱全链路 + 移动端竖屏布局 + 防泄露导出（M3）
 * 前置：dev/preview server 跑在 5199；NODE_PATH 指向 playwright-core 所在 node_modules
 */
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { chromium } = require('playwright-core')
const h = require('./e2e-harness.cjs')

const EXE =
  process.env.QA_CHROME ||
  'C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'
const SECRET_TOKEN = 'TEST-SECRET-TOKEN-998877'

function createRunner(title, allowedOrigins) {
  const state = {
    title,
    pass: 0,
    fail: 0,
    results: [],
    consoleErrors: [],
    pageErrors: [],
    externalRequests: [],
    allowExpected401: false,
    expected401Count: 0,
  }

  state.check = (name, ok, detail = '') => {
    if (ok) state.pass += 1
    else state.fail += 1
    state.results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  }

  state.attach = (page) => {
    page.setDefaultTimeout(8000)
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return
      const text = msg.text()
      if (state.allowExpected401 && text.includes('401 (Unauthorized)')) {
        state.expected401Count += 1
        return
      }
      state.consoleErrors.push(text)
    })
    page.on('pageerror', (err) => state.pageErrors.push(err.message))
    page.on('request', (req) => {
      const url = req.url()
      if (/^(data|blob|about):/.test(url)) return
      try {
        const parsed = new URL(url)
        if (!/^(https?|wss?):$/.test(parsed.protocol)) return
        if (!allowedOrigins.has(parsed.origin)) {
          state.externalRequests.push(url)
        }
      } catch {
        state.externalRequests.push(url)
      }
    })
  }

  return state
}

async function startMockCloudInbox() {
  const toUrl = (rel) => pathToFileURL(path.resolve(__dirname, rel)).href
  const [{ createApp }, { loadConfig }, { createMemoryStore }] = await Promise.all([
    import(toUrl('../cloud-inbox/src/app.js')),
    import(toUrl('../cloud-inbox/src/config.js')),
    import(toUrl('../cloud-inbox/src/storage/memoryStore.js')),
  ])

  const store = createMemoryStore()
  const config = loadConfig({
    INBOX_TOKEN: SECRET_TOKEN,
    ALLOW_LOCALHOST_ORIGINS: 'true',
    STORAGE_MODE: 'memory',
    DEFAULT_TIMEZONE: 'Asia/Shanghai',
  })

  let requestCount = 0
  const aiClient = {
    async parseBillText({ text, today }) {
      if (text.includes('瑞幸咖啡')) {
        return {
          valid: true,
          type: 'expense',
          amount: 28.5,
          categoryName: '餐饮',
          note: '瑞幸咖啡',
          occurredAt: today,
        }
      }
      if (text.includes('地铁出行')) {
        return {
          valid: true,
          type: 'expense',
          amount: 6,
          categoryName: '交通',
          note: '地铁扣款',
          occurredAt: today,
        }
      }
      return { valid: false, amount: null, reason: 'no_amount' }
    },
  }

  const handler = createApp({ config, store, aiClient })
  const server = http.createServer((req, res) => {
    requestCount += 1
    return handler(req, res)
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    store,
    getRequestCount: () => requestCount,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

;(async () => {
  const mockCloud = await startMockCloudInbox()
  const appOrigin = new URL(h.BASE).origin
  const allowedOrigins = new Set([appOrigin, mockCloud.baseUrl])
  const run = createRunner('云端收件箱全链路 E2E（390x844）', allowedOrigins)
  let browser

  try {
    browser = await chromium.launch({ executablePath: EXE, headless: true })
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      acceptDownloads: true,
    })
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true })
    })

    const page = await context.newPage()
    run.attach(page)

    /* ---------- 1. 未配置状态进入设置页：状态「未配置」，零请求 ---------- */
    await page.goto(`${h.BASE}/#/settings`)
    await page.waitForSelector('[data-testid="inbox-config-badge"]', { timeout: 10000 })
    const initialBadge = await page.textContent('[data-testid="inbox-config-badge"]')
    const initialStatus = await page.textContent('[data-testid="inbox-status"]')
    run.check(
      '1. 未配置进入设置页显示「未配置」且零云端请求',
      initialBadge.trim() === '未配置' &&
        initialStatus.trim() === '尚未同步' &&
        mockCloud.getRequestCount() === 0,
      `badge=${initialBadge}, reqs=${mockCloud.getRequestCount()}`,
    )

    /* ---------- 2. 移动端 390x844 竖屏排版检查：零横向溢出、控件在视口内 ---------- */
    const layoutMetrics = await page.evaluate(() => {
      const pageEl = document.querySelector('.page')
      const testIds = [
        'inbox-url',
        'inbox-token',
        'inbox-save',
        'inbox-test',
        'inbox-sync-categories',
        'inbox-sync-now',
      ]
      const boxes = testIds.map((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`)
        const rect = el ? el.getBoundingClientRect() : null
        return {
          id,
          ok: Boolean(rect && rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.right <= 390),
          rect,
        }
      })
      return {
        docOverflow: document.documentElement.scrollWidth > window.innerWidth,
        pageOverflow: pageEl ? pageEl.scrollWidth > pageEl.clientWidth : true,
        boxes,
      }
    })
    run.check(
      '2. 390x844 竖屏无横向溢出且收件箱全部控件在视口内',
      !layoutMetrics.docOverflow &&
        !layoutMetrics.pageOverflow &&
        layoutMetrics.boxes.every((b) => b.ok),
      JSON.stringify(layoutMetrics),
    )

    /* ---------- 3. 测试连接（401 错误密码 + 正确密码）与保存刷新持久化 ---------- */
    await page.fill('[data-testid="inbox-url"]', mockCloud.baseUrl)
    await page.fill('[data-testid="inbox-token"]', 'WRONG-TOKEN')
    run.allowExpected401 = true
    await page.click('[data-testid="inbox-test"]')
    await page.waitForFunction(() => document.querySelector('.msg')?.textContent.includes('401'))
    run.allowExpected401 = false
    const errMsg = await page.textContent('.msg')

    await page.fill('[data-testid="inbox-token"]', SECRET_TOKEN)
    await page.click('[data-testid="inbox-test"]')
    await page.waitForFunction(() => document.querySelector('.msg')?.textContent.includes('连接成功'))
    const okTestMsg = await page.textContent('.msg')

    await page.click('[data-testid="inbox-save"]')
    await page.waitForFunction(() => document.querySelector('.msg')?.textContent.includes('已保存'))

    await page.reload()
    await page.waitForSelector('[data-testid="inbox-config-badge"]', { timeout: 10000 })
    const reloadedBadge = await page.textContent('[data-testid="inbox-config-badge"]')
    const reloadedUrl = await page.inputValue('[data-testid="inbox-url"]')
    const reloadedToken = await page.inputValue('[data-testid="inbox-token"]')
    run.check(
      '3. 测试连接鉴权反馈、保存与刷新后配置持久化',
      errMsg.includes('401') &&
        okTestMsg.includes('连接成功') &&
        reloadedBadge.trim() === '已配置' &&
        reloadedUrl === mockCloud.baseUrl &&
        reloadedToken === SECRET_TOKEN,
    )

    /* ---------- 4. 同步 16 个未归档分类 ---------- */
    await page.click('[data-testid="inbox-sync-categories"]')
    await page.waitForFunction(() => document.querySelector('.msg')?.textContent.includes('已推送分类'))
    const syncedCategories = await mockCloud.store.getCategories()
    run.check(
      '4. 同步分类推送 16 个未归档分类（支出 11 + 收入 5）',
      Boolean(
        syncedCategories &&
          syncedCategories.expense.length === 11 &&
          syncedCategories.income.length === 5,
      ),
      JSON.stringify(syncedCategories),
    )

    /* ---------- 5. POST /ingest（复杂实付返回 text/plain + 无金额返回 422 不入队） ---------- */
    const ingestOk = await fetch(`${mockCloud.baseUrl}/ingest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SECRET_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: '瑞幸咖啡 原价¥38.00 满减-5.00 立减金-2.50 红包-2.00 实付¥28.50',
      }),
    })
    const ingestOkText = await ingestOk.text()

    const ingestInvalid = await fetch(`${mockCloud.baseUrl}/ingest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SECRET_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: '您的验证码是 884210' }),
    })
    const ingestInvalidText = await ingestInvalid.text()
    const queuedAfterIngest = await mockCloud.store.listPending()
    const firstCloudId = queuedAfterIngest[0]?.id || ''

    run.check(
      '5. POST /ingest 实付返回 text/plain 且无有效金额返回 422 不写脏数据',
      ingestOk.status === 200 &&
        ingestOk.headers.get('content-type')?.includes('text/plain; charset=utf-8') &&
        ingestOkText === '✅ 已暂存：餐饮 -¥28.50（瑞幸咖啡）' &&
        ingestInvalid.status === 422 &&
        ingestInvalidText === '⚠️ 未识别到有效金额，未记账' &&
        queuedAfterIngest.length === 1,
      `ok=${ingestOkText}, invalid=${ingestInvalidText}, len=${queuedAfterIngest.length}`,
    )

    /* ---------- 6. 点击「立即同步」后本地入库（整数分）且云端清空 ---------- */
    await page.click('[data-testid="inbox-sync-now"]')
    await page.waitForFunction(() => document.querySelector('.msg')?.textContent.includes('已同步 1 笔'))
    const recordsAfterManual = await h.readStore(page, 'records')
    const pendingAfterManual = await mockCloud.store.listPending()
    const firstRecord = recordsAfterManual.find((r) => r.id === `cloud:${firstCloudId}`)
    run.check(
      '6. 手动立即同步写入整数分账目（cloud:<id>）并 /ack 清空云端',
      Boolean(firstRecord && firstRecord.amount === 2850 && firstRecord.note === '瑞幸咖啡') &&
        pendingAfterManual.length === 0,
      `records=${recordsAfterManual.length}, pending=${pendingAfterManual.length}`,
    )

    /* ---------- 7. 切至流水页并模拟切回前台（visibilitychange）自动静默同步 ---------- */
    await page.goto(`${h.BASE}/#/list`)
    await page.waitForSelector('.rows .row', { timeout: 10000 })

    const ingestNotif = await fetch(`${mockCloud.baseUrl}/ingest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SECRET_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: '招商银行通知：地铁出行扣款6.00元' }),
    })
    run.check('7a. 模拟 iOS 27 动账通知投递云端成功', ingestNotif.status === 200)

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForSelector('[data-testid="cloud-sync-toast"]', { timeout: 8000 })
    const toastText = await page.textContent('[data-testid="cloud-sync-toast"]')
    await page.waitForFunction(() => document.querySelectorAll('.rows .row').length === 2)
    const listText = await page.textContent('.rows')
    const pendingAfterAuto = await mockCloud.store.listPending()

    run.check(
      '7b. visibilitychange 静默同步弹轻提示、实时刷新流水并清空云端',
      toastText.includes('已同步 1 笔云端账单') &&
        listText.includes('地铁扣款') &&
        listText.includes('6.00') &&
        pendingAfterAuto.length === 0,
      `toast=${toastText}`,
    )

    /* ---------- 8. 同 id 重放幂等验证：不重复入账且清空云端 ---------- */
    await mockCloud.store.addPending({
      id: firstCloudId,
      type: 'expense',
      amount: 28.5,
      categoryName: '餐饮',
      note: '瑞幸咖啡',
      occurredAt: firstRecord.date,
    })
    await page.goto(`${h.BASE}/#/settings`)
    await page.waitForSelector('[data-testid="inbox-sync-now"]', { timeout: 10000 })
    await page.click('[data-testid="inbox-sync-now"]')
    await page.waitForFunction(() =>
      document.querySelector('.msg')?.textContent.includes('已清理重复账单'),
    )
    const recordsAfterReplay = await h.readStore(page, 'records')
    const pendingAfterReplay = await mockCloud.store.listPending()
    run.check(
      '8. 同 id 重放幂等：本地账目数不变且云端被 /ack 清空',
      recordsAfterReplay.length === 2 && pendingAfterReplay.length === 0,
      `records=${recordsAfterReplay.length}, pending=${pendingAfterReplay.length}`,
    )

    /* ---------- 9. 真实导出 JSON 防泄露验证 ---------- */
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 })
    await page.click('[data-testid="backup-export"]')
    const download = await downloadPromise
    const downloadPath = await download.path()
    const rawExport = fs.readFileSync(downloadPath, 'utf8')
    const parsedExport = JSON.parse(rawExport)
    const exportedKeys = (parsedExport.settings || []).map((s) => s.key)
    run.check(
      '9. 真实导出 JSON 绝不含同步密码、收件箱 URL 及 cloudInbox 配置键',
      !rawExport.includes(SECRET_TOKEN) &&
        !rawExport.includes(mockCloud.baseUrl) &&
        !exportedKeys.includes('cloudInboxConfig') &&
        !exportedKeys.includes('cloudInboxStatus'),
      `keys=${JSON.stringify(exportedKeys)}`,
    )

    /* ---------- 10. 控制台、页面异常与外部请求终审 ---------- */
    run.check(
      '10a. 非预期控制台零错误（且仅在错误密码测试触发 1 次预期 401）',
      run.consoleErrors.length === 0 && run.expected401Count === 1,
      `unexpected=${JSON.stringify(run.consoleErrors)} expected401=${run.expected401Count}`,
    )
    run.check(
      '10b. 无未捕获页面异常',
      run.pageErrors.length === 0,
      run.pageErrors.slice(0, 3).join(' | '),
    )
    run.check(
      '10c. 仅请求本地应用与 Mock 云端，零外部请求',
      run.externalRequests.length === 0,
      run.externalRequests.slice(0, 3).join(' | '),
    )
  } finally {
    if (browser) await browser.close()
    await mockCloud.close()
  }

  console.log(run.results.join('\n'))
  console.log(`\n${run.title}: ${run.pass} PASS, ${run.fail} FAIL`)
  process.exit(run.fail ? 1 : 0)
})().catch((err) => {
  console.error('FATAL', err)
  process.exit(1)
})
