/**
 * E2E 验收：统一入口协议（URL 参数预填 + 前贴板 JSON）
 * 前置：dev server 跑在 5199；NODE_PATH 指向 playwright-core 所在 node_modules
 * 运行：NODE_PATH=~/.workbuddy/binaries/node/workspace/node_modules node scripts/accept_entry_flow.cjs
 */
const { chromium } = require('playwright-core')

const EXE = 'C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'
const BASE = 'http://localhost:5199'
const CLIP_EMPTY = '剪贴板里没有可识别的记账内容'

let pass = 0
let fail = 0
function check(name, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL'
  if (ok) pass++
  else fail++
  console.log(`[${mark}] ${name}${!ok && detail ? ` — ${detail}` : ''}`)
}

async function readRecords(page) {
  return page.evaluate(
    () =>
      (window.__q = new Promise((resolve) => {
        const req = indexedDB.open('jizhang', 1)
        req.onsuccess = () => {
          const st = req.result.transaction('records').objectStore('records')
          const all = st.getAll()
          all.onsuccess = () => resolve(all.result)
        }
      })),
  )
}

;(async () => {
  const browser = await chromium.launch({ executablePath: EXE })
  // 剪贴板读写权限都授予，模拟 iOS 用户手势后的读取
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
  const page = await context.newPage()

  /* ---------- 1. 冷启动 URL 参数全字段预填 ---------- */
  const url1 = `${BASE}/#/add?amount=12.5&type=expense&note=${encodeURIComponent('午饭')}&category=${encodeURIComponent('餐饮')}&date=2026-10-05`
  await page.goto('about:blank')
  await page.goto(url1)
  await page.waitForSelector('.cats .cat', { timeout: 8000 })
  await page.waitForTimeout(300)

  check('金额预填 ¥12.50', (await page.textContent('.amount')).includes('12.50'))
  check('备注预填「午饭」', (await page.inputValue('.note')) === '午饭')
  check('日期预填 2026-10-05', (await page.inputValue('.date')) === '2026-10-05')
  const catOn = await page.textContent('.cats .cat.on')
  check('分类选中「餐饮」', catOn && catOn.includes('餐饮'), catOn)

  // 参数一次性：读完即从地址栏清除
  const hash = await page.evaluate(() => location.hash)
  check('URL 参数已清除（防刷新重复预填）', hash === '#/', hash)

  // 点 ✓ 入账：确认写库金额是分（1250）
  await page.click('.pad .ok')
  await page.waitForTimeout(600)
  const recs1 = await readRecords(page)
  const saved = recs1.find((r) => r.note === '午饭')
  check('入账金额 1250 分', saved && saved.amount === 1250, JSON.stringify(saved))
  check('入账分类为餐饮 id', saved && saved.categoryId, JSON.stringify(saved))

  /* ---------- 2. 收入类型 + 分类名匹配 ---------- */
  await page.goto('about:blank')
  await page.goto(`${BASE}/#/add?amount=8000&type=income&category=${encodeURIComponent('工资')}`)
  await page.waitForSelector('.cats .cat', { timeout: 8000 })
  await page.waitForTimeout(300)
  check('收入态切换', (await page.textContent('.seg .on')) === '收入')
  const catOn2 = await page.textContent('.cats .cat.on')
  check('收入分类「工资」选中', catOn2 && catOn2.includes('工资'), catOn2)

  /* ---------- 2b. 类型与分类不匹配（income + 支出分类）→ 留默认不崩 ---------- */
  await page.goto('about:blank')
  await page.goto(`${BASE}/#/add?amount=50&type=income&category=${encodeURIComponent('餐饮')}`)
  await page.waitForTimeout(300)
  check('跨类型分类名忽略不崩', (await page.textContent('.seg .on')) === '收入')

  /* ---------- 3. 全非法参数 → 完全不预填 ---------- */
  await page.goto('about:blank')
  await page.goto(`${BASE}/#/add?amount=abc&date=2026-13-99&type=xyz&foo=1`)
  await page.waitForTimeout(300)
  check('非法金额不预填', (await page.textContent('.amount')).includes('0.00'))
  const today = await page.evaluate(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  })
  check('非法日期回落今天', (await page.inputValue('.date')) === today)
  check('未知键忽略且页面正常', (await page.$$eval('.cats .cat', (els) => els.length)) > 0)

  /* ---------- 3b. 刷新后不重复预填（query 已清） ---------- */
  await page.reload()
  await page.waitForTimeout(500)
  check('刷新后表单为空', (await page.textContent('.amount')).includes('0.00') && (await page.inputValue('.note')) === '')

  /* ---------- 4. 剪贴板 JSON 入口 ---------- */
  await page.goto(`${BASE}/`)
  await page.waitForSelector('.cats .cat', { timeout: 8000 })
  await page.evaluate(
    (t) => navigator.clipboard.writeText(t),
    JSON.stringify({ app: 'jizhang', amount: 30, type: 'expense', note: '打车', date: '2026-10-04' }),
  )
  await page.click('.paste')
  await page.waitForTimeout(300)
  check('剪贴板预填 ¥30.00', (await page.textContent('.amount')).includes('30.00'))
  check('剪贴板预填备注', (await page.inputValue('.note')) === '打车')
  check('剪贴板成功 toast', (await page.textContent('.toast')) === '已从剪贴板填入')

  // 剪贴板合法 → 覆盖已有输入时提示「已覆盖原输入」
  await page.evaluate(
    (t) => navigator.clipboard.writeText(t),
    JSON.stringify({ app: 'jizhang', amount: 66, note: '奶茶' }),
  )
  await page.click('.paste')
  await page.waitForTimeout(300)
  check('覆盖原输入提示', (await page.textContent('.toast')) === '已覆盖原输入')
  check('覆盖后金额 ¥66.00', (await page.textContent('.amount')).includes('66.00'))

  // 非法 JSON / 非 jizhang 标识
  await page.evaluate(() => navigator.clipboard.writeText('{"app":"other","amount":99}'))
  await page.click('.paste')
  await page.waitForTimeout(300)
  check('非 jizhang 标识拒收', (await page.textContent('.toast')) === CLIP_EMPTY)
  await page.evaluate(() => navigator.clipboard.writeText('不是 JSON 的普通文本'))
  await page.click('.paste')
  await page.waitForTimeout(300)
  check('非 JSON 拒收', (await page.textContent('.toast')) === CLIP_EMPTY)
  check('拒收后金额不受影响', (await page.textContent('.amount')).includes('66.00'))

  // 仅提示类 toast 点击即关闭（无账可撤销）
  await page.click('.toast')
  await page.waitForTimeout(200)
  const toastGone = await page.$('.toast')
  check('提示类 toast 点击关闭', toastGone === null)

  /* ---------- 5. iOS 场景模拟：已在记一笔页，hash 换成带参（不重挂载） ---------- */
  await page.goto('about:blank')
  await page.goto(`${BASE}/`)
  await page.waitForSelector('.cats .cat', { timeout: 8000 })
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    location.hash = `#/add?amount=8.8&note=${encodeURIComponent('公交')}`
  })
  await page.waitForTimeout(400)
  check('不重挂载场景参数仍生效（watch 兜住）', (await page.textContent('.amount')).includes('8.80'))
  check('不重挂载场景备注生效', (await page.inputValue('.note')) === '公交')

  /* ---------- 6. autosave=1：打开即自动入账 + 撤销兜底 ---------- */
  await page.goto('about:blank')
  await page.goto(`${BASE}/#/add?amount=5.5&note=${encodeURIComponent('自动测试')}&autosave=1`)
  await page.waitForSelector('.cats .cat', { timeout: 8000 })
  await page.waitForSelector('.toast', { timeout: 5000 })
  check('autosave 自动入账 toast（可撤销）', (await page.textContent('.toast')).includes('已记') && (await page.textContent('.toast')).includes('撤销'))
  check('入账后表单清空', (await page.textContent('.amount')).includes('0.00'))
  const recs2 = await readRecords(page)
  const auto = recs2.find((r) => r.note === '自动测试')
  check('自动入账落库 550 分', auto && auto.amount === 550, JSON.stringify(auto))
  await page.click('.toast')
  await page.waitForTimeout(400)
  const recs3 = await readRecords(page)
  const undone = recs3.find((r) => r.note === '自动测试')
  check('点 toast 撤销自动账（软删实证）', undone && undone.deleted === true, JSON.stringify(undone))

  /* ---------- 6b. autosave 但金额无效 → 不自动入账，保持手动 ---------- */
  await page.goto('about:blank')
  await page.goto(`${BASE}/#/add?amount=abc&note=${encodeURIComponent('无效自动')}&autosave=1`)
  await page.waitForSelector('.cats .cat', { timeout: 8000 })
  await page.waitForTimeout(500)
  const recs4 = await readRecords(page)
  check('金额无效时 autosave 不触发（无落库）', !(await page.$('.toast')) && !recs4.some((r) => r.note === '无效自动'))

  /* ---------- 6c. 剪贴板 JSON 带 autosave ---------- */
  await page.goto('about:blank')
  await page.goto(`${BASE}/`)
  await page.waitForSelector('.cats .cat', { timeout: 8000 })
  await page.evaluate(
    (t) => navigator.clipboard.writeText(t),
    JSON.stringify({ app: 'jizhang', amount: 7, autosave: true }),
  )
  await page.click('.paste')
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('已记'), { timeout: 4000 })
  const recs5 = await readRecords(page)
  check('剪贴板 autosave 自动入账 700 分', recs5.some((r) => r.amount === 700 && !r.deleted))

  /* ---------- 7. 金额清洗：OCR / 截图带出来的脏写法 ---------- */
  // 「简记」式截图记账会把 OCR 原文里的金额直接塞进 URL，形态千奇百怪，
  // 必须在服务层洗干净，否则整条入口链路白给（Number('¥1,234.50') === NaN）
  const dirty = [
    ['%C2%A51%2C234.50', 123450, '¥1,234.50（货币符 + 千分位）'],
    ['35.50%E5%85%83', 3550, '35.50元（中文单位后缀）'],
    ['%EF%BF%A5%2012', 1200, '￥ 12（全角 U+FFE5 + 空格）'],
    ['1234.5', 123450, '1234.5（纯数字）'],
    ['1%20234.5', 123450, '1 234.5（空格千分位）'],
  ]
  for (const [raw, expectFen, label] of dirty) {
    await page.goto('about:blank')
    await page.goto(`${BASE}/#/add?amount=${raw}&autosave=1`)
    await page.waitForSelector('.cats .cat', { timeout: 8000 })
    await page.waitForFunction(
      () => !!document.querySelector('.toast')?.textContent.includes('已记'),
      { timeout: 4000 },
    ).catch(() => {})
    const rs = await readRecords(page)
    check(`金额清洗：${label}`, rs.some((r) => r.amount === expectFen && !r.deleted),
      `期望 ${expectFen} 分，实际 ${JSON.stringify(rs.map((r) => r.amount))}`)
  }

  // 反例：洗不出合法金额时绝不入账（防「10.5.3」这类脏串被当金额）
  await page.goto('about:blank')
  await page.goto(`${BASE}/#/add?amount=10.5.3&autosave=1`)
  await page.waitForSelector('.cats .cat', { timeout: 8000 })
  await page.waitForTimeout(600)
  const recsDirty = await readRecords(page)
  check('脏串 10.5.3 不入账（金额非法）', !recsDirty.some((r) => !r.deleted && String(r.note).includes('脏')))

  await browser.close()
  console.log(`\n结果: ${pass} PASS, ${fail} FAIL`)
  process.exit(fail ? 1 : 0)
})().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
