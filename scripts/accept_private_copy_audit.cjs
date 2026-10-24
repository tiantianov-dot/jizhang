/**
 * 文案审计：P12-A3（不暗示不存在的同步/加密/锁）
 * 覆盖：流水页行内标记、记一笔、编辑页、设置页披露。
 * 预期可能因 ListView 旧文案而失败；本脚本只取证，不改源码。
 */
const h = require('./e2e-harness.cjs')

const run = h.createRun('P12-A3 文案审计')
const today = (() => {
  const now = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
})()

function copyOk(title) {
  return (
    typeof title === 'string' &&
    title.includes('本机标记') &&
    title.includes('不代表加密或密码保护') &&
    !title.includes('私密') &&
    !title.includes('同步')
  )
}

;(async () => {
  const { browser, context } = await h.launch({ canShare: false })
  const page = await context.newPage()
  run.attach(page)

  await page.goto(h.BASE + '/#/settings')
  await page.waitForSelector('[data-testid="backup-counts"]', { timeout: 10000 })
  await h.putRows(page, 'records', [
    h.makeRecord({
      id: 'private-copy-1',
      amount: 100,
      categoryId: h.builtinId('expense', 'food'),
      note: '私密文案检查',
      date: today,
      private: true,
    }),
  ])

  await page.goto('about:blank')
  await page.goto(h.BASE + '/#/list')
  await page.waitForSelector('.rows .row', { timeout: 10000 })
  const listTitle = await page.locator('.rows .row .lock').first().getAttribute('title')
  run.check('流水页私密标记文案不暗示加密/锁', copyOk(listTitle), `title=${JSON.stringify(listTitle)}`)

  await h.openAdd(page)
  const addTitle = await page.getAttribute('.lock', 'title')
  run.check('记一笔本机标记文案', copyOk(addTitle), `title=${JSON.stringify(addTitle)}`)

  await page.goto(`${h.BASE}/#/record/private-copy-1`)
  await page.waitForSelector('.note')
  const editTitle = await page.getAttribute('.lock', 'title')
  run.check('编辑页本机标记文案', copyOk(editTitle), `title=${JSON.stringify(editTitle)}`)

  await page.goto(h.BASE + '/#/settings')
  await page.waitForSelector('[data-testid="backup-counts"]', { timeout: 10000 })
  const settingsCopy = await page.textContent('.page')
  run.check(
    '设置页披露不暗示加密/同步/锁',
    settingsCopy.includes('不代表加密或密码保护') &&
      !settingsCopy.includes('不同步') &&
      !settingsCopy.includes('已加密'),
  )

  await run.finish(browser)
})().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
