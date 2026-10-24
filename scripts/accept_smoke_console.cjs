/**
 * E2E 冒烟：全路由控制台零错误 / 无未捕获异常 / 无外部请求
 * 前置：dev server 跑在 5199；NODE_PATH 指向 playwright-core 所在 node_modules
 */
const h = require('./e2e-harness.cjs')

const run = h.createRun('全路由冒烟')

;(async () => {
  const { browser, context } = await h.launch({ canShare: false })
  const page = await context.newPage()
  run.attach(page)

  const routes = [
    ['#/', '.cats .cat'],
    ['#/list', '.page'],
    ['#/stats', '.mbar'],
    ['#/settings', '[data-testid="backup-counts"]'],
    ['#/categories', '.rows .row'],
    ['#/add', '.cats .cat'],
  ]
  for (const [hash, selector] of routes) {
    await page.goto(h.BASE + '/' + hash)
    await page.waitForSelector(selector, { timeout: 10000 })
  }
  run.check('六个主路由均可加载', true)
  await run.finish(browser)
})().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
