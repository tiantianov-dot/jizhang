/* 验收脚本：分类管理（新增/编辑/归档/恢复/硬删 + 归档后历史流水显示修复实证） */
const { chromium } = require('playwright-core')

const EXE = 'C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'
const BASE = 'http://localhost:5199'
const results = []
function check(name, ok, extra = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}
const rowOf = (page, text) => page.locator('.row', { hasText: text })

;(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true })
  const page = await browser.newPage()
  page.setDefaultTimeout(8000)

  // ---- 1. 新增支出分类「咖啡」----
  await page.goto(BASE + '/#/categories')
  await page.click('.btn.add')
  await page.waitForSelector('.form')
  check('新增态类型可选', (await page.locator('.form .seg button').count()) === 2)
  await page.fill('.form .field:has-text("名称") .input', '咖啡')
  await page.fill('.form .input.sm', '☕')
  await page.click('.pick.round >> nth=0') // 选一个预设色
  await page.click('.form .acts .btn:not(.ghost)')
  await page.waitForSelector('.toast')
  check('新增保存反馈「已新增」', (await page.textContent('.toast')).includes('已新增'))
  await rowOf(page, '咖啡').waitFor()
  check('支出分类列表出现「咖啡」', (await rowOf(page, '咖啡').count()) === 1)
  check('引用数显示有效 0 / 回收站 0', (await rowOf(page, '咖啡').textContent()).includes('有效 0') && (await rowOf(page, '咖啡').textContent()).includes('回收站 0'))

  // ---- 2. 用新分类真实入账 ¥5 ----
  await page.goto(BASE + '/#/list')
  await page.goto(BASE + '/#/')
  await page.waitForSelector('.cats .cat')
  const coffeeBtn = page.locator('.cats .cat', { hasText: '咖啡' })
  check('记一笔页出现新分类', (await coffeeBtn.count()) === 1)
  await coffeeBtn.click()
  await page.click('.pad .key:has-text("5")')
  await page.click('.pad .key.ok')
  await page.waitForSelector('.toast')

  // ---- 3. 编辑：类型锁定 + 重命名 ----
  await page.goto(BASE + '/#/categories')
  await rowOf(page, '咖啡').locator('.act').click()
  await page.waitForSelector('.form')
  check('编辑态类型锁定', (await page.locator('.form .seg').count()) === 0 && (await page.textContent('.form .locked')).includes('不可修改'))
  await page.fill('.form .field:has-text("名称") .input', '拿铁')
  await page.click('.form .acts .btn:not(.ghost)')
  await page.waitForSelector('.toast')
  check('编辑保存反馈「已保存」', (await page.textContent('.toast')).includes('已保存'))
  await page.goto(BASE + '/#/list')
  await page.waitForSelector('.rows .row')
  const renamedRow = await rowOf(page, '拿铁').textContent()
  check('重命名后流水同步显示「拿铁 ☕」', renamedRow.includes('拿铁') && renamedRow.includes('☕'), renamedRow.trim())

  // ---- 4. 删除有引用的分类 → 归档（两段式确认）----
  await page.goto(BASE + '/#/categories')
  await rowOf(page, '拿铁').locator('.act').click()
  await page.waitForSelector('.form .del')
  await page.click('.form .del')
  check('首次点击进入确认态', (await page.textContent('.form .del')).includes('再点一次'))
  await page.click('.form .del')
  await page.waitForSelector('.toast')
  check('有引用 → 提示已归档', (await page.textContent('.toast')).includes('已归档'))

  // ---- 5. 核心修复实证：归档后历史流水仍显示原名原 emoji（而非 📦 未分类）----
  await page.goto(BASE + '/#/list')
  await page.waitForSelector('.rows .row')
  const afterArchive = await rowOf(page, '拿铁').textContent()
  check('归档后流水仍显示「拿铁 ☕」（P2 修复）', afterArchive.includes('拿铁') && afterArchive.includes('☕'), afterArchive.trim())

  // ---- 6. 归档分类不出现在记账页 ----
  await page.goto(BASE + '/#/')
  await page.waitForSelector('.cats .cat')
  check('记账页不再出现已归档分类', (await page.locator('.cats .cat', { hasText: '拿铁' }).count()) === 0)

  // ---- 7. 恢复已归档分类 ----
  await page.goto(BASE + '/#/categories')
  await rowOf(page, '拿铁').locator('.act').click() // 已归档段的「恢复」
  await page.waitForSelector('.toast')
  check('恢复反馈', (await page.textContent('.toast')).includes('已恢复'))
  check('恢复后回到支出分类段', (await page.locator('.sec ~ .card .row, .card .row', { hasText: '拿铁' }).count()) >= 1)
  await page.goto(BASE + '/#/')
  await page.waitForSelector('.cats .cat')
  check('记账页重新出现已恢复分类', (await page.locator('.cats .cat', { hasText: '拿铁' }).count()) === 1)

  // ---- 8. 硬删无引用分类 ----
  await page.goto(BASE + '/#/categories')
  await page.click('.btn.add')
  await page.fill('.form .field:has-text("名称") .input', '临时')
  await page.click('.form .acts .btn:not(.ghost)')
  await page.waitForSelector('.toast')
  await rowOf(page, '临时').locator('.act').click()
  await page.click('.form .del')
  await page.click('.form .del')
  await page.waitForSelector('.toast')
  const hardDelMsg = await page.textContent('.toast')
  check('无引用 → 彻底删除', hardDelMsg.includes('已删除') && !hardDelMsg.includes('归档'), hardDelMsg.trim())
  await page.waitForTimeout(300)
  check('硬删后列表无残留', (await rowOf(page, '临时').count()) === 0)

  await browser.close()
  console.log(results.join('\n'))
  const failed = results.filter((r) => r.startsWith('FAIL'))
  console.log(`\n${results.length - failed.length}/${results.length} PASS`)
  process.exit(failed.length ? 1 : 0)
})().catch((e) => {
  console.error('E2E ERROR:', e.message)
  console.log(results.join('\n'))
  process.exit(2)
})
