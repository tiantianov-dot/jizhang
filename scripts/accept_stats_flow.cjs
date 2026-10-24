/* 验收脚本：统计图表 + 分类预算（月份切换 / 环图 / 柱图 / 预算进度 / 归档分类占比） */
const { chromium } = require('playwright-core')

const EXE = 'C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'
const BASE = 'http://localhost:5199'
const results = []
function check(name, ok, extra = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}

// 与注入数据对应的常量（单位：分）
const R1 = 1200 // 1 日 餐饮
const R2 = 3400 // 2 日 交通
const R3 = 5600 // 3 日 餐饮

const now = new Date()
const Y = now.getFullYear()
const M = String(now.getMonth() + 1).padStart(2, '0')
const CUR = `${Y}-${M}` // 当前 YYYY-MM
const DAYS = new Date(Y, Number(M), 0).getDate()

;(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true })
  const page = await browser.newPage()
  page.setDefaultTimeout(8000)

  // ---- 种子数据：1/2/3 日三笔支出，分类用真实种子分类 id ----
  await page.goto(BASE + '/')
  await page.waitForSelector('.cats .cat')
  // 注意：Promise 挂到 window 保活，避免 evaluate 上下文 GC 回收异步结果
  const ids = await page.evaluate(
    ([cur, r1, r2, r3]) =>
      (window.__seed = new Promise((resolve) => {
        const req = indexedDB.open('jizhang', 1)
        req.onsuccess = () => {
          const db = req.result
          const cats = db.transaction('categories').objectStore('categories').getAll()
          cats.onsuccess = () => {
            const food = cats.result.find((c) => c.name === '餐饮')
            const bus = cats.result.find((c) => c.name === '交通')
            const now = Date.now()
            const mk = (amount, day, categoryId) => ({
              id: crypto.randomUUID(),
              amount,
              type: 'expense',
              categoryId,
              note: '',
              date: `${cur}-${String(day).padStart(2, '0')}`,
              createdAt: now,
              updatedAt: now,
              deleted: false,
              private: false,
            })
            const tx = db.transaction('records', 'readwrite')
            tx.objectStore('records').put(mk(r1, 1, food.id))
            tx.objectStore('records').put(mk(r2, 2, bus.id))
            tx.objectStore('records').put(mk(r3, 3, food.id))
            tx.oncomplete = () => resolve('ok')
          }
        }
      })),
    [CUR, R1, R2, R3],
  )
  check('种子三笔支出注入', ids === 'ok')

  // 种子注入晚于应用首次加载，hash 跳转不会重跑 main.js —— 整页刷新让 store 重载
  await page.reload()
  await page.waitForSelector('.cats .cat')

  // ---- 统计页：概览 ----
  await page.goto(BASE + '/#/stats')
  await page.waitForSelector('.mbar')
  check('默认当前月', (await page.textContent('.mbar .mon')) === CUR)
  check('支出合计 ¥102.00', (await page.textContent('.sums')).includes('102.00'))

  // ---- 环图：两段 + 图例降序（餐饮 68 元 > 交通 34 元）----
  const segCount = await page.locator('.donut .seg').count()
  check('环图两个分类段', segCount === 2, `segs=${segCount}`)
  const legend = await page.locator('.legend').textContent()
  check('图例首行是餐饮（降序）', legend.includes('餐饮') && legend.indexOf('餐饮') < legend.indexOf('交通'), legend.trim())
  check('图例含百分比与金额', legend.includes('67%') && legend.includes('¥68.00'), legend.trim()) // 66.67% 按 Math.round → 67%

  // ---- 柱图：全月天数、最高柱=第 3 日、今天高亮 ----
  const barCount = await page.locator('.bar').count()
  check(`柱图 ${DAYS} 根（全月补零）`, barCount === DAYS, `bars=${barCount}`)
  const bar3 = await page.locator('.bar').nth(2).getAttribute('height')
  check('最高柱是第 3 日（h=100）', bar3 === '100', `h=${bar3}`)
  const todayBar = await page.locator(`.bar.today`).count()
  check('今天的柱子高亮', todayBar === 1, `todayBars=${todayBar}`)

  // ---- 分类预算：餐饮 ¥50（超支红）、交通 ¥50（ok）----
  await page.goto(BASE + '/#/categories')
  const setBudget = async (catName, budget) => {
    await page.locator('.row', { hasText: catName }).locator('.act').click()
    await page.fill('.form .field:has-text("月预算") .input', budget)
    await page.click('.form .acts .btn:not(.ghost)')
    await page.waitForSelector('.toast')
    await page.waitForTimeout(400)
  }
  await setBudget('餐饮', '50')
  await setBudget('交通', '50')

  await page.goto(BASE + '/#/stats')
  await page.waitForSelector('.mbar')
  const budgetText = await page.locator('.brow').allTextContents()
  check(
    '餐饮超支：68/50 显示超支行',
    budgetText.some((t) => t.includes('餐饮') && t.includes('¥68.00 / ¥50.00')),
    budgetText.join(' | '),
  )
  const overFill = await page.locator('.brow', { hasText: '餐饮' }).locator('.fill.over').count()
  const okFill = await page.locator('.brow', { hasText: '交通' }).locator('.fill').count()
  check('超支行进度条 over 状态', overFill === 1)
  check('未超支行进度条渲染', okFill === 1)

  // ---- 预算行点击跳分类管理 ----
  await page.locator('.brow', { hasText: '餐饮' }).click()
  check('预算行点击跳 /categories', page.url().includes('#/categories'))
  await page.goBack()

  // ---- 翻月：上月空态 ----
  await page.locator('.mbar .nav').first().click() // ‹
  await page.waitForTimeout(300)
  const prevMonText = await page.textContent('.mbar .mon')
  const d = new Date(Y, Number(M) - 2, 1) // 上一个月
  const PREV = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  check('上月标签正确', prevMonText === PREV, `${prevMonText} vs ${PREV}`)
  check('空月支出 ¥0.00', (await page.textContent('.sums')).includes('0.00'))
  check('空月环图占位', (await page.locator('.donut-wrap .placeholder').count()) === 1)
  check('空月柱图占位', (await page.locator('.bar-wrap .placeholder').count()) === 1)
  check('空月隐藏分类预算卡', (await page.locator('.brow').count()) === 0)

  // ---- 回到当前月：归档自定义分类后仍出现在占比里 ----
  await page.locator('.mbar .nav').nth(1).click() // ›
  await page.waitForTimeout(300)

  // 内置分类受保护不可删，改用一笔自定义分类验证「归档后统计仍按原分类显示」
  const archiveCatId = 'stats-archived-cat'
  await page.evaluate(
    ([catId, dateStr]) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('jizhang', 1)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction(['categories', 'records'], 'readwrite')
          tx.objectStore('categories').put({
            id: catId,
            name: '咖啡统计',
            emoji: '☕',
            color: '#111111',
            type: 'expense',
            monthlyBudget: 0,
            order: 999,
            archived: false,
            lastUsedAt: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
          tx.objectStore('records').put({
            id: 'stats-archived-rec',
            amount: 100,
            type: 'expense',
            categoryId: catId,
            note: '归档统计实证',
            date: dateStr,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            deleted: false,
            deletedAt: null,
            private: false,
            owner: 'me',
          })
          tx.oncomplete = () => {
            db.close()
            resolve('ok')
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
    [archiveCatId, `${Y}-${M}-15`],
  )
  await page.reload()
  await page.waitForSelector('.mbar')
  const legendBefore = await page.locator('.legend').textContent()
  check('自定义分类「咖啡统计」进入占比图例', legendBefore.includes('咖啡统计'), legendBefore.trim())

  await page.goto(BASE + '/#/categories')
  await page.locator('.row', { hasText: '咖啡统计' }).locator('.act').click()
  await page.click('.form .del')
  await page.click('.form .del')
  await page.waitForSelector('.toast')
  check('咖啡统计有引用 → 归档', (await page.textContent('.toast')).includes('已归档'))

  await page.goto(BASE + '/#/stats')
  await page.waitForSelector('.mbar')
  const legendAfter = await page.locator('.legend').textContent()
  check('归档分类仍出现在占比图例', legendAfter.includes('咖啡统计'), legendAfter.trim())

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
