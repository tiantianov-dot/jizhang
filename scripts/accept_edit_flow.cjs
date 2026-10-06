/* 验收脚本：流水编辑与删除（真实 chromium 点验，非 happy-path 目测） */
const { chromium } = require('playwright-core')

const EXE = 'C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'
const BASE = 'http://localhost:5199'
const results = []
function check(name, ok, extra = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}

;(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true })
  const page = await browser.newPage()

  // 0. 记一笔：12 元餐饮（走真实 UI 三次点击路径）
  await page.goto(BASE + '/')
  await page.waitForSelector('.cats .cat', { timeout: 8000 })
  await page.click('.cats .cat') // 1. 选分类
  await page.click('.pad .key:has-text("1")')
  await page.click('.pad .key:has-text("2")') // 2. 金额 12
  await page.click('.pad .key.ok') // 3. ✓
  await page.waitForSelector('.toast', { timeout: 5000 })
  check('记一笔 3 次点击入账', (await page.textContent('.toast')).includes('已记'))

  // 1. 流水页出现该行 ¥12.00
  await page.goto(BASE + '/#/list')
  await page.waitForSelector('.rows .row', { timeout: 5000 })
  const amt1 = await page.textContent('.rows .row .amt')
  check('流水显示 ¥12.00', amt1.includes('12.00'), amt1.trim())

  // 2. 点行进编辑页，预填正确
  await page.click('.rows .row')
  await page.waitForSelector('.edit .amount', { timeout: 5000 })
  const disp = await page.textContent('.edit .amount')
  check('编辑页预填金额 ¥12.00', disp.includes('12.00'), disp.trim())

  // 3. 按 3 → ¥123.00 保存 → 列表更新
  await page.click('.pad .key:has-text("3")')
  const disp2 = await page.textContent('.edit .amount')
  check('键盘追加后显示 ¥123.00', disp2.includes('123.00'), disp2.trim())
  await page.click('.pad .key.ok')
  await page.waitForSelector('.rows .row', { timeout: 5000 })
  const amt2 = await page.textContent('.rows .row .amt')
  check('保存后流水更新为 ¥123.00', amt2.includes('123.00'), amt2.trim())
  check('保存后回到流水页', page.url().includes('#/list'))

  // 4. 删除两段式：第一次点击不删，第二次才删
  await page.click('.rows .row')
  await page.waitForSelector('.edit .del', { timeout: 5000 })
  await page.click('.edit .del')
  const confirmText = await page.textContent('.edit .del')
  check('首次点击进入确认态', confirmText.includes('再点一次'), confirmText.trim())
  check('确认态时仍在编辑页（未误删跳走）', page.url().includes('#/record/'))
  await page.click('.edit .del') // 第二次点击，真删
  await page.waitForSelector('.toast', { timeout: 5000 })
  check('删除后回到流水页 + 撤销 toast', page.url().includes('#/list'))
  const rowCountAfterDelete = await page.locator('.rows .row').count().catch(() => 0)
  check('删除后列表为空', rowCountAfterDelete === 0, `rows=${rowCountAfterDelete}`)

  // 5. 软删除实证：IndexedDB 里记录仍在且 deleted=true（数据不丢是底线）
  const softDeleted = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('jizhang', 1)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('records').objectStore('records').getAll()
          tx.onsuccess = () => resolve(tx.result.map((r) => ({ deleted: r.deleted, amount: r.amount })))
        }
      }),
  )
  check('软删除：记录仍在库且 deleted=true', softDeleted.length === 1 && softDeleted[0].deleted === true, JSON.stringify(softDeleted))

  // 6. 撤销：点 toast 恢复
  await page.click('.toast')
  await page.waitForSelector('.rows .row', { timeout: 5000 })
  const amt3 = await page.textContent('.rows .row .amt')
  check('撤销后恢复 ¥123.00', amt3.includes('123.00'), amt3.trim())

  // 7. 坏 id 直达编辑页 → 跳回 /list 不白屏
  await page.goto(BASE + '/#/record/not-a-real-id')
  await page.waitForTimeout(1200)
  check('坏 id 自动回流水页', page.url().includes('#/list'), page.url())

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
