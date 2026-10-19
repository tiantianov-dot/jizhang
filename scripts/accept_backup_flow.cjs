/**
 * E2E 验收：数据备份防呆（lastBackupAt + 设置页提醒三态 + 导出文件名）
 * 前置：dev server 跑在 5199；NODE_PATH 指向 playwright-core 所在 node_modules
 * 运行：NODE_PATH=~/.workbuddy/binaries/node/workspace/node_modules node scripts/accept_backup_flow.cjs
 */
const { chromium } = require('playwright-core')

const EXE = 'C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'
const BASE = 'http://localhost:5199'

let pass = 0
let fail = 0
function check(name, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL'
  if (ok) pass++
  else fail++
  console.log(`[${mark}] ${name}${!ok && detail ? ` — ${detail}` : ''}`)
}

/** 直取 Pinia settings store 并调用其真实 load()（模拟外部写入后刷新） */
async function reloadSettingsStore(page) {
  return page.evaluate(async () => {
    const app = document.querySelector('#app').__vue_app__
    const pinia =
      app.config.globalProperties.$pinia ||
      Object.getOwnPropertySymbols(app._context.provides)
        .map((s) => app._context.provides[s])
        .find((v) => v && v._s && typeof v._s.get === 'function')
    const store = pinia._s.get('settings')
    await store.load()
    return store.lastBackupAt
  })
}

/** 把 settings 表里的 lastBackupAt 直接改写（绕过 UI，制造「N 天前备份过」的库状态） */
async function setLastBackupAtInDB(page, iso) {
  return page.evaluate(
    (v) =>
      new Promise((resolve) => {
        const req = indexedDB.open('jizhang', 1)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('settings', 'readwrite')
          tx.objectStore('settings').put({ key: 'lastBackupAt', value: v })
          tx.oncomplete = () => resolve('ok')
        }
      }),
    iso,
  )
}

/** 通用：直接写/读 settings 表某一键（制造本地状态，绕过 UI） */
async function setSettingInDB(page, key, value) {
  return page.evaluate(
    ([k, v]) =>
      new Promise((resolve) => {
        const req = indexedDB.open('jizhang', 1)
        req.onsuccess = () => {
          const tx = req.result.transaction('settings', 'readwrite')
          tx.objectStore('settings').put({ key: k, value: v, updatedAt: Date.now() })
          tx.oncomplete = () => resolve('ok')
        }
      }),
    [key, value],
  )
}
async function getSettingInDB(page, key) {
  return page.evaluate(
    (k) =>
      new Promise((resolve) => {
        const req = indexedDB.open('jizhang', 1)
        req.onsuccess = () => {
          const g = req.result.transaction('settings').objectStore('settings').get(k)
          g.onsuccess = () => resolve(g.result ? g.result.value : null)
        }
      }),
    key,
  )
}

const daysAgoIso = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

;(async () => {
  const browser = await chromium.launch({ executablePath: EXE })
  const context = await browser.newContext()
  // headless Chromium 里 navigator.canShare 会返回 true 但 share() 必然 reject——
  // 强制走「降级下载」路径（与桌面 Chrome 一致），才能捕获 download 事件断言文件名。
  // iOS 真机分享路径无法在 headless 中模拟，属预期测试边界。
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)

  /* ---------- 1. 全新库：无账目 → 不显示任何提醒 ---------- */
  await page.goto(BASE + '/')
  await page.waitForSelector('.cats .cat')
  await page.goto(BASE + '/#/settings')
  await page.waitForSelector('.card')
  check('空库不显示备份提醒', (await page.locator('.bstat').count()) === 0)

  /* ---------- 2. 有账目 + 从未备份 → 红点「还没备份过」 ---------- */
  await page.goto(BASE + '/')
  await page.waitForSelector('.cats .cat')
  await page.click('.cats .cat') // 1. 选分类
  await page.locator('.pad .key').first().click() // 2. 金额 1
  const downloadPromise = page.waitForEvent('download', { timeout: 8000 }).catch(() => null)
  await page.click('.pad .ok') // 3. 入账
  await downloadPromise // 吃掉这次误触发的下载（不会发生，纯防御）

  await page.goto(BASE + '/#/settings')
  await page.waitForSelector('.bstat')
  const stat1 = await page.textContent('.bstat')
  const dot1 = await page.locator('.dot').getAttribute('class')
  check('有账目从未备份 → 提醒出现', stat1.includes('还没备份过'), stat1)
  check('红点态（never）', dot1 && dot1.includes('never'), dot1)

  /* ---------- 3. 导出 → 文件名日期格式 + lastBackupAt 记录 + 「今天」 ---------- */
  const dlPromise = page.waitForEvent('download', { timeout: 8000 })
  await page.click('button:has-text("导出 JSON")')
  const dl = await dlPromise
  const stampRe = /^jizhang-backup-\d{8}-\d{4}\.json$/
  check('导出文件名 YYYYMMDD-HHmm', stampRe.test(dl.suggestedFilename()), dl.suggestedFilename())

  await page.waitForTimeout(400)
  const stat2 = await page.textContent('.bstat')
  const dot2 = await page.locator('.dot').getAttribute('class')
  check('导出后显示「上次备份：今天」', stat2.includes('今天'), stat2)
  check('绿点态（ok）', dot2 && dot2.includes('ok'), dot2)

  // lastBackupAt 真实落库（settings 表）
  const inDb = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('jizhang', 1)
        req.onsuccess = () => {
          const g = req.result.transaction('settings').objectStore('settings').get('lastBackupAt')
          g.onsuccess = () => resolve(g.result)
        }
      }),
  )
  check('lastBackupAt 已写入 IndexedDB', inDb && typeof inDb.value === 'string', JSON.stringify(inDb))

  /* ---------- 4. 手工把备份时间改成 10 天前 → 黄色「已 10 天未备份」 ---------- */
  await setLastBackupAtInDB(page, daysAgoIso(10))
  await reloadSettingsStore(page)
  await page.waitForTimeout(200)
  const stat3 = await page.textContent('.bstat')
  const dot3 = await page.locator('.dot').getAttribute('class')
  check('10 天前 → 黄色「已 10 天未备份」', stat3.includes('已 10 天未备份'), stat3)
  check('黄点态（stale）', dot3 && dot3.includes('stale'), dot3)

  /* ---------- 5. 3 天前 → 正常灰字 ---------- */
  await setLastBackupAtInDB(page, daysAgoIso(3))
  await reloadSettingsStore(page)
  await page.waitForTimeout(200)
  const stat4 = await page.textContent('.bstat')
  check('3 天前 → 「上次备份：3 天前」', stat4.includes('3 天前'), stat4)

  /* ---------- 6. 导入语义：不回滚 lastBackupAt + 白名单按键过滤（含正向预言） ---------- */
  // 导出前先写一个可识别的白名单键，保证备份文件里一定带上它
  await setSettingInDB(page, 'ownerName', 'QA-EXPORT-NAME')
  const dl2Promise = page.waitForEvent('download', { timeout: 8000 })
  await page.click('button:has-text("导出 JSON")')
  const dl2 = await dl2Promise
  const payloadText = (await dl2.path()) ? require('fs').readFileSync(await dl2.path(), 'utf8') : null
  check('拿到导出 payload（供导入）', !!payloadText)

  // 导出侧白名单实证（fail-closed 的前半边）
  const payload = JSON.parse(payloadText)
  const exportedKeys = (payload.settings || []).map((s) => s.key)
  const WHITELIST = ['monthlyBudget', 'ownerName', 'uiGlassIntensity', 'uiGlassDim']
  check('导出不含 lastBackupAt（设备本地备份状态不外发）', !exportedKeys.includes('lastBackupAt'), JSON.stringify(exportedKeys))
  check('导出不含 syncConfig（将来放凭据也不会被打包外发）', !exportedKeys.includes('syncConfig'), JSON.stringify(exportedKeys))
  check('导出 settings ⊆ 白名单四键', exportedKeys.every((k) => WHITELIST.includes(k)), JSON.stringify(exportedKeys))

  await setLastBackupAtInDB(page, daysAgoIso(20))
  // 关键：本地把 ownerName 改成另一个值。若导入是「什么都不写」的空操作，
  // 下面的正向断言就会红 —— 它给「不回滚 lastBackupAt」提供判别力，防弱预言。
  await setSettingInDB(page, 'ownerName', 'QA-LOCAL-NEWER')
  // 再往文件里塞两个白名单外键，验证导入是**按键过滤**而不是整包丢弃
  payload.settings = [
    ...(payload.settings || []),
    { key: 'evilImportKey', value: 'should-be-dropped', updatedAt: Date.now() },
    { key: 'syncConfig', value: { token: 'LEAK' }, updatedAt: Date.now() },
  ]
  await page.setInputFiles('input[type=file]', {
    name: 'test.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  })
  await page.waitForTimeout(600)
  const afterImport = await reloadSettingsStore(page)
  check('导入成功提示', (await page.textContent('.msg')).includes('导入完成'))

  // ★正向预言：白名单键确实被文件值覆盖（证明导入干了活）
  const ownerAfter = await getSettingInDB(page, 'ownerName')
  check(
    '★正向：白名单键 ownerName 被备份文件里的值覆盖（导入不是空操作）',
    ownerAfter === 'QA-EXPORT-NAME',
    `实际=${JSON.stringify(ownerAfter)}，期望=QA-EXPORT-NAME`,
  )
  // ★按键过滤（fail-closed 的后半边）
  const evilAfter = await getSettingInDB(page, 'evilImportKey')
  const syncAfter = await getSettingInDB(page, 'syncConfig')
  check('★fail-closed：未知键 evilImportKey 没被导入落库', evilAfter === null, JSON.stringify(evilAfter))
  check('★fail-closed：syncConfig 没被导入落库', syncAfter === null, JSON.stringify(syncAfter))

  // 语义边界（U4 起，口径已变更）：settings 走键白名单，`lastBackupAt` **不在白名单内**，
  // 因此它既不进导出也不进导入 —— 导入后必须保持「导入前的本地值」（本脚本设为 20 天前）。
  // 旧语义「导入后 lastBackupAt 变成备份文件里的快照（3 天前）」已作废：
  // 那等于让一次恢复动作把设备的备份提醒回滚，同步语义下还会互相压制提醒。
  const snapshotDate = daysAgoIso(3).slice(0, 10)
  const localDate = daysAgoIso(20).slice(0, 10)
  const todayDate = new Date().toISOString().slice(0, 10)
  check(
    '导入不回滚 lastBackupAt（白名单外键：保持导入前的本地 20 天前，既不快照也不现在）',
    !!afterImport &&
      afterImport.slice(0, 10) === localDate &&
      afterImport.slice(0, 10) !== snapshotDate &&
      afterImport.slice(0, 10) !== todayDate,
    `afterImport=${afterImport}，期望本地=${localDate}，快照=${snapshotDate}，今天=${todayDate}`,
  )

  await browser.close()
  console.log(`\n结果: ${pass} PASS, ${fail} FAIL`)
  process.exit(fail ? 1 : 0)
})().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
