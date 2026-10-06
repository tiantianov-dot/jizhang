/**
 * E2E 验收：流水页月份切换 + 搜索筛选
 * 前置：dev server 跑在 5199；NODE_PATH 指向 playwright-core 所在 node_modules
 * 运行：NODE_PATH=~/.workbuddy/binaries/node/workspace/node_modules node scripts/accept_list_flow.cjs
 */
const { chromium } = require('playwright-core')

const EXE = 'C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'
const BASE = 'http://localhost:5199'

const results = []
function check(name, ok, extra = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}

/** 与服务端同口径的翻月计算（用于推导期望值，不依赖被测代码） */
function shiftMonth(m, d) {
  const [y, mm] = m.split('-').map(Number)
  const dt = new Date(y, mm - 1 + d, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}
function diffMonths(a, b) {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return ay * 12 + am - (by * 12 + bm)
}

const now = new Date()
const Y = now.getFullYear()
const CUR = `${Y}-${String(now.getMonth() + 1).padStart(2, '0')}`
const JAN = `${Y}-01` // 与 DEC 相差正好一个月 → 构成 12 → 次年 1 的跨年
const DEC = `${Y - 1}-12`

/* 种子数据（分） */
const R_FOOD = 1200 // CUR 1 日 餐饮「午餐」
const R_TAXI = 3400 // CUR 2 日 交通「TAXI」
const R_FOOD2 = 5600 // CUR 3 日 餐饮（无备注）
const R_PAY = 800000 // CUR 5 日 工资「当月工资」
const R_YEAR = 9900 // DEC 3 日 餐饮「去年年会」
const R_NEW = 100 // JAN 1 日 交通「元旦」

const rows = (page) => page.locator('.rows .row')
const msum = (page) => page.textContent('.msum')
const mon = (page) => page.textContent('.mbar .mon')
const fbtn = (page) => page.textContent('.fbtn')

/** 从当前月连点 ‹ / › 到目标月（真实点按，顺带验证连续翻月） */
async function gotoMonth(page, target, from) {
  const diff = diffMonths(target, from)
  const btn = diff < 0 ? 0 : 1
  for (let i = 0; i < Math.abs(diff); i++) await page.locator('.mbar .nav').nth(btn).click()
  await page.waitForTimeout(120)
}

/** 直接读 Pinia store 并在页面内调用其真实 load()（模拟「别处改了分类」的实时同步） */
async function reloadCategoriesStore(page) {
  return page.evaluate(async () => {
    const app = document.querySelector('#app').__vue_app__
    const pinia =
      app.config.globalProperties.$pinia ||
      Object.getOwnPropertySymbols(app._context.provides)
        .map((s) => app._context.provides[s])
        .find((v) => v && v._s && typeof v._s.get === 'function')
    const store = pinia._s.get('categories')
    await store.load()
    return store.list.length
  })
}

/** 直接把某个分类置为归档（等价 CategoriesView 的归档结果），并让 store 重新读取 */
async function archiveCategoryInDB(page, id, archived) {
  return page.evaluate(
    ([catId, flag]) =>
      new Promise((resolve) => {
        const req = indexedDB.open('jizhang', 1)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('categories', 'readwrite')
          const store = tx.objectStore('categories')
          const get = store.get(catId)
          get.onsuccess = () => {
            const c = get.result
            c.archived = flag
            c.updatedAt = Date.now()
            store.put(c)
          }
          tx.oncomplete = () => resolve('ok')
        }
      }),
    [id, archived],
  )
}

;(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true })
  const page = await browser.newPage()
  page.setDefaultTimeout(8000)

  /* ---------- 种子：当月 4 笔 + 去年 12 月 1 笔 + 次年 1 月 1 笔 ---------- */
  await page.goto(BASE + '/')
  await page.waitForSelector('.cats .cat')
  const catIds = await page.evaluate(
    ([cur, dec, jan, r]) =>
      (window.__seed = new Promise((resolve) => {
        const req = indexedDB.open('jizhang', 1)
        req.onsuccess = () => {
          const db = req.result
          const cats = db.transaction('categories').objectStore('categories').getAll()
          cats.onsuccess = () => {
            const byName = (n, t) => cats.result.find((c) => c.name === n && c.type === t)
            const food = byName('餐饮', 'expense')
            const bus = byName('交通', 'expense')
            const pay = byName('工资', 'income')
            const now = Date.now()
            const mk = (amount, type, categoryId, note, date) => ({
              id: crypto.randomUUID(),
              amount,
              type,
              categoryId,
              note,
              date,
              createdAt: now,
              updatedAt: now,
              deleted: false,
              private: false,
            })
            const tx = db.transaction('records', 'readwrite')
            const st = tx.objectStore('records')
            st.put(mk(r.food, 'expense', food.id, '午餐', `${cur}-01`))
            st.put(mk(r.taxi, 'expense', bus.id, 'TAXI', `${cur}-02`))
            st.put(mk(r.food2, 'expense', food.id, '', `${cur}-03`))
            st.put(mk(r.pay, 'income', pay.id, '当月工资', `${cur}-05`))
            st.put(mk(r.year, 'expense', food.id, '去年年会', `${dec}-03`))
            st.put(mk(r.new, 'expense', bus.id, '元旦', `${jan}-01`))
            tx.oncomplete = () =>
              resolve({ foodId: food.id, busId: bus.id, payId: pay.id })
          }
        }
      })),
    [
      CUR,
      DEC,
      JAN,
      { food: R_FOOD, taxi: R_TAXI, food2: R_FOOD2, pay: R_PAY, year: R_YEAR, new: R_NEW },
    ],
  )
  check('种子数据注入（6 笔，跨 3 个月）', !!catIds.foodId && !!catIds.busId, JSON.stringify(catIds))

  await page.reload()
  await page.waitForSelector('.cats .cat')
  await page.goto('about:blank')
  await page.goto(BASE + '/#/list')
  await page.waitForSelector('.mbar')

  /* ---------- 1. 默认当前月 + 只显示当月账目 ---------- */
  check('默认展示当前月', (await mon(page)) === CUR, await mon(page))
  check('当月只显示 4 笔（不含其他月）', (await rows(page).count()) === 4, `rows=${await rows(page).count()}`)
  const s1 = await msum(page)
  check(
    '当月合计 支 ¥102.00 / 收 ¥8000.00',
    s1.includes('102.00') && s1.includes('8000.00'),
    s1.replace(/\s+/g, ' '),
  )

  /* ---------- 2. 翻到上月：空态 + 合计归零 ---------- */
  await page.locator('.mbar .nav').first().click()
  await page.waitForTimeout(150)
  check('翻到上月标签正确', (await mon(page)) === shiftMonth(CUR, -1), await mon(page))
  check('空月显示「本月没有账目」', (await page.textContent('.placeholder')) === '本月没有账目')
  check('空月合计归零', (await msum(page)).includes('0.00'), (await msum(page)).replace(/\s+/g, ' '))

  /* ---------- 3. 跨年翻月（12 → 次年 1，双向） ---------- */
  await gotoMonth(page, DEC, shiftMonth(CUR, -1))
  check(`跨年翻月到 ${DEC}（上年 12 月）`, (await mon(page)) === DEC, await mon(page))
  check('12 月只显示该月 1 笔 ¥99.00', (await rows(page).count()) === 1 && (await rows(page).first().textContent()).includes('99.00'))
  await page.locator('.mbar .nav').nth(1).click()
  await page.waitForTimeout(150)
  check(`12 → 次年 1 月（${JAN}）`, (await mon(page)) === JAN, await mon(page))
  check('1 月只显示该月 1 笔「元旦」', (await rows(page).count()) === 1 && (await rows(page).first().textContent()).includes('元旦'))
  await page.locator('.mbar .nav').first().click()
  await page.waitForTimeout(150)
  check('次年 1 → 上年 12（反向同样正确）', (await mon(page)) === DEC, await mon(page))

  /* ---------- 4. 回到当前月 ---------- */
  await page.goto('about:blank')
  await page.goto(BASE + '/#/list')
  await page.waitForSelector('.mbar')
  check('重新进入回到当前月', (await mon(page)) === CUR && (await rows(page).count()) === 4)

  /* ---------- 5. 搜索：即时过滤 + 大小写不敏感 ---------- */
  await page.fill('.filters .input', 'taxi')
  await page.waitForTimeout(450)
  check('搜备注即时过滤（taxi → 1 笔）', (await rows(page).count()) === 1, `rows=${await rows(page).count()}`)
  check('搜索结果正确（TAXI ¥34.00）', (await rows(page).first().textContent()).includes('34.00'))
  check('当月合计随筛选联动（支 ¥34.00）', (await msum(page)).includes('34.00'), (await msum(page)).replace(/\s+/g, ' '))
  await page.fill('.filters .input', 'TAXI')
  await page.waitForTimeout(450)
  check('大小写不敏感（TAXI 同样命中）', (await rows(page).count()) === 1)

  /* ---------- 6. 清空恢复 + 防抖期间清空立即恢复 ---------- */
  await page.fill('.filters .input', '午餐')
  await page.waitForTimeout(100) // 仍在 300ms 防抖窗口内
  await page.fill('.filters .input', '')
  await page.waitForTimeout(500) // 越过防抖窗口：若未取消挂起过滤，这里会变成 1 笔
  check('防抖期间清空 → 挂起过滤被取消，恢复全月 4 笔', (await rows(page).count()) === 4, `rows=${await rows(page).count()}`)
  await page.fill('.filters .input', '午餐')
  await page.waitForTimeout(450)
  check('中文备注可搜（1 笔）', (await rows(page).count()) === 1)
  await page.fill('.filters .input', '')
  await page.waitForTimeout(450)
  check('清空搜索框恢复全部', (await rows(page).count()) === 4 && (await msum(page)).includes('102.00'))

  /* ---------- 7. 搜索无结果：空态文案 + 月份条仍可用 ---------- */
  await page.fill('.filters .input', 'zzzz')
  await page.waitForTimeout(450)
  check('搜索无结果文案「没有匹配的账目」', (await page.textContent('.placeholder')) === '没有匹配的账目')
  check('无结果时月份切换条仍在', (await page.locator('.mbar .nav').count()) === 2)
  await page.locator('.mbar .nav').first().click()
  await page.waitForTimeout(450)
  check('无结果时仍可翻月', (await mon(page)) === shiftMonth(CUR, -1), await mon(page))
  await page.locator('.mbar .nav').nth(1).click()
  await page.fill('.filters .input', '')
  await page.waitForTimeout(450)

  /* ---------- 8. 分类筛选弹层 ---------- */
  await page.click('.fbtn')
  await page.waitForSelector('.mask .sheet')
  const sheetText = (await page.textContent('.sheet')).replace(/\s+/g, ' ')
  check('弹层三段齐全（全部/支出分类/收入分类）', sheetText.includes('支出分类') && sheetText.includes('收入分类') && sheetText.includes('全部'), sheetText.slice(0, 60))
  await page.locator('.sheet .item', { hasText: '餐饮' }).click()
  await page.waitForTimeout(200)
  check('选中分类后弹层收起', (await page.locator('.mask').count()) === 0)
  check('筛选生效：只剩餐饮 2 笔', (await rows(page).count()) === 2, `rows=${await rows(page).count()}`)
  check('筛选后合计联动（支 ¥68.00）', (await msum(page)).includes('68.00'), (await msum(page)).replace(/\s+/g, ' '))
  check('入口按钮显示选中分类', (await fbtn(page)).includes('餐饮') && (await page.locator('.fbtn.on').count()) === 1, await fbtn(page))

  await page.click('.fbtn')
  await page.waitForSelector('.mask .sheet')
  await page.locator('.sheet .item', { hasText: '全部' }).click()
  await page.waitForTimeout(200)
  check('选「全部」恢复 4 笔', (await rows(page).count()) === 4 && (await fbtn(page)).trim() === '全部', await fbtn(page))

  /* ---------- 9. 筛选中的分类被归档 → 按钮回落「全部」 ---------- */
  await page.click('.fbtn')
  await page.waitForSelector('.mask .sheet')
  await page.locator('.sheet .item', { hasText: '交通' }).click()
  await page.waitForTimeout(200)
  check('筛选交通生效（1 笔 ¥34.00）', (await rows(page).count()) === 1 && (await rows(page).first().textContent()).includes('34.00'))

  await archiveCategoryInDB(page, catIds.busId, true)
  await reloadCategoriesStore(page)
  await page.waitForTimeout(200)
  check('分类被归档后按钮回落「全部」', (await fbtn(page)).trim() === '全部', await fbtn(page))
  check('回落时不再有选中态', (await page.locator('.fbtn.on').count()) === 0)
  check('回落即撤销筛选（恢复 4 笔）', (await rows(page).count()) === 4, `rows=${await rows(page).count()}`)
  await page.click('.fbtn')
  await page.waitForSelector('.mask .sheet')
  check('归档分类不再出现在筛选弹层', (await page.locator('.sheet .item', { hasText: '交通' }).count()) === 0)
  // 点遮罩顶部空白处（弹层靠底，遮罩中心点会落在卡片上）
  await page.locator('.mask').click({ position: { x: 20, y: 20 } })
  await page.waitForTimeout(200)
  check('点遮罩收起弹层', (await page.locator('.mask').count()) === 0)

  // 复原归档，避免污染后续断言
  await archiveCategoryInDB(page, catIds.busId, false)
  await reloadCategoriesStore(page)
  await page.waitForTimeout(200)

  /* ---------- 10. 既有行为零回归：整行进编辑 + 删除撤销 ---------- */
  await page.locator('.rows .row').first().click()
  await page.waitForTimeout(300)
  check('整行点击进入编辑页', page.url().includes('#/record/'), page.url())
  await page.waitForSelector('.edit .del')
  await page.click('.edit .del')
  await page.click('.edit .del')
  await page.waitForSelector('.toast')
  check('删除后回到流水页 + 撤销 toast', page.url().includes('#/list'))
  check('删除后列表少一笔', (await rows(page).count()) === 3, `rows=${await rows(page).count()}`)
  await page.click('.toast')
  await page.waitForTimeout(400)
  check('撤销后恢复 4 笔', (await rows(page).count()) === 4, `rows=${await rows(page).count()}`)

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
