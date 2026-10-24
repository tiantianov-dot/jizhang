/**
 * E2E 验收：P1-1 / P1-2 备份三态、提醒周期、导出确认、计数披露与恶意导入
 * 前置：dev server 跑在 5199；NODE_PATH 指向 playwright-core 所在 node_modules
 */
const fs = require('fs')
const h = require('./e2e-harness.cjs')

const run = h.createRun('备份三态与 P1-2 E2E')

async function saveRecord(page, { amount, note, privateFlag = false }) {
  await h.openAdd(page, { amount: String(amount), note })
  if (privateFlag) await page.click('.lock')
  await page.click('.pad .ok')
  await h.waitToast(page, '已记')
  const records = await h.readStore(page, 'records')
  return records.find((rec) => rec.note === note && !rec.deleted)
}

async function deleteRecord(page, id) {
  await page.goto(`${h.BASE}/#/record/${id}`)
  await page.waitForSelector('.note')
  const lockTitle = await page.getAttribute('.lock', 'title')
  await page.click('.del')
  await page.click('.del')
  await page.waitForURL(/#\/list/, { timeout: 8000 })
  return lockTitle
}

async function gotoSettings(page) {
  await page.goto(h.BASE + '/#/settings')
  await page.waitForSelector('[data-testid="backup-counts"]', { timeout: 10000 })
}

async function statusText(page) {
  return page.textContent('[data-testid="backup-status"]')
}

async function countsText(page) {
  return page.textContent('[data-testid="backup-counts"]')
}

async function exportPayload(page) {
  const downloadPromise = page.waitForEvent('download', { timeout: 10000 })
  await page.click('[data-testid="backup-export"]')
  const download = await downloadPromise
  const path = await download.path()
  return {
    name: download.suggestedFilename(),
    payload: JSON.parse(fs.readFileSync(path, 'utf8')),
  }
}

;(async () => {
  const { browser, context } = await h.launch({ canShare: false })
  const page = await context.newPage()
  run.attach(page)

  /* ---------- 1. 首次空库：设置页显示「尚未备份」，记一笔页无提醒 ---------- */
  await gotoSettings(page)
  run.check(
    '空库设置页显示「尚未备份」',
    (await statusText(page)).includes('尚未备份') &&
      (await page.textContent('[data-testid="backup-last-at"]')).includes('尚未备份'),
    await statusText(page),
  )
  run.check(
    '空库计数全 0',
    (await countsText(page)).replace(/\s+/g, ' ').includes('有效 0 · 回收站 0 · 本机标记 0 · 备份总计 0'),
    await countsText(page),
  )
  const settingsCopy = await page.textContent('.page')
  run.check(
    '设置页文案不暗示同步/加密：明确「不代表加密或密码保护」且无「不同步」',
    settingsCopy.includes('不代表加密或密码保护') && !settingsCopy.includes('不同步'),
  )
  await h.openAdd(page)
  run.check('空账本记一笔页不显示备份提醒', (await page.locator('[data-testid="backup-reminder"]').count()) === 0)
  const addLockTitle = await page.getAttribute('.lock', 'title')
  run.check(
    '记一笔页本机标记文案不暗示同步/加密',
    addLockTitle.includes('本机标记') &&
      addLockTitle.includes('不代表加密或密码保护') &&
      !addLockTitle.includes('同步'),
    addLockTitle,
  )

  /* ---------- 2. 造 4 笔：3 有效（含 1 私密）+ 1 回收站 ---------- */
  await saveRecord(page, { amount: 12.34, note: 'ACTIVE-A' })
  await saveRecord(page, { amount: 5, note: 'ACTIVE-B' })
  await saveRecord(page, { amount: 7.5, note: 'PRIVATE-P', privateFlag: true })
  const deletedRecord = await saveRecord(page, { amount: 3, note: 'DELETED-D' })
  const editLockTitle = await deleteRecord(page, deletedRecord.id)
  run.check(
    '编辑页本机标记文案不暗示同步/加密',
    editLockTitle.includes('本机标记') &&
      editLockTitle.includes('不代表加密或密码保护') &&
      !editLockTitle.includes('同步'),
    editLockTitle,
  )

  await gotoSettings(page)
  const dbRecords = await h.readStore(page, 'records')
  const expected = {
    active: dbRecords.filter((rec) => !rec.deleted).length,
    deleted: dbRecords.filter((rec) => rec.deleted).length,
    private: dbRecords.filter((rec) => rec.private).length,
    total: dbRecords.length,
  }
  const shownCounts = (await countsText(page)).replace(/\s+/g, ' ')
  run.check(
    '计数披露与库内数组逐项一致（有效3/回收站1/本机标记1/总计4）',
    expected.active === 3 &&
      expected.deleted === 1 &&
      expected.private === 1 &&
      expected.total === 4 &&
      shownCounts.includes(`有效 ${expected.active}`) &&
      shownCounts.includes(`回收站 ${expected.deleted}`) &&
      shownCounts.includes(`本机标记 ${expected.private}`) &&
      shownCounts.includes(`备份总计 ${expected.total}`),
    `${shownCounts} / db=${JSON.stringify(expected)}`,
  )
  run.check(
    '状态仍为「尚未备份」',
    (await page.locator('[data-testid="backup-status"]').getAttribute('data-status')) === 'never',
  )

  /* ---------- 3. download 未确认不写时间；确认后才写；真实 JSON 内容一致 ---------- */
  const exported = await exportPayload(page)
  run.check('导出文件名 YYYYMMDD-HHmm.json', /^jizhang-backup-\d{8}-\d{4}\.json$/.test(exported.name), exported.name)
  run.check('备份版本为 v2', exported.payload.version === 2, String(exported.payload.version))
  const payloadRecords = exported.payload.records
  run.check(
    '真实 JSON 与计数逐项一致',
    payloadRecords.filter((rec) => !rec.deleted).length === expected.active &&
      payloadRecords.filter((rec) => rec.deleted).length === expected.deleted &&
      payloadRecords.filter((rec) => rec.private).length === expected.private &&
      payloadRecords.length === expected.total,
  )
  run.check(
    '软删与 private 记录确实写入备份',
    payloadRecords.some((rec) => rec.id === deletedRecord.id && rec.deleted === true) &&
      payloadRecords.some((rec) => rec.note === 'PRIVATE-P' && rec.private === true),
  )
  const exportedKeys = (exported.payload.settings || []).map((row) => row.key)
  const whitelist = [
    'monthlyBudget',
    'ownerName',
    'uiGlassIntensity',
    'uiGlassFill',
    'backupReminderDays',
    'backupReminderEnabled',
  ]
  run.check(
    '导出 settings ⊆ 白名单，且不含 lastBackupAt / seedVersion / builtinIdentityVersion',
    exportedKeys.every((key) => whitelist.includes(key)) &&
      !exportedKeys.includes('lastBackupAt') &&
      !exportedKeys.includes('seedVersion') &&
      !exportedKeys.includes('builtinIdentityVersion'),
    JSON.stringify(exportedKeys),
  )
  run.check(
    'download 未确认前 lastBackupAt 仍为空',
    (await h.getSetting(page, 'lastBackupAt')) === null,
    String(await h.getSetting(page, 'lastBackupAt')),
  )
  run.check(
    '出现「我已保存，更新备份时间」确认入口',
    (await page.locator('[data-testid="backup-confirm-saved"]').count()) === 1,
  )
  await page.click('[data-testid="backup-confirm-saved"]')
  await page.waitForFunction(() => document.querySelector('.msg')?.textContent.includes('备份时间已更新'))
  const savedAt = await h.getSetting(page, 'lastBackupAt')
  run.check('确认后才写入 lastBackupAt', typeof savedAt === 'string' && savedAt.length > 0, String(savedAt))
  run.check(
    '确认后状态变 ok（今天）',
    (await page.locator('[data-testid="backup-status"]').getAttribute('data-status')) === 'ok' &&
      (await statusText(page)).includes('今天'),
    await statusText(page),
  )

  await page.reload()
  await page.waitForSelector('[data-testid="backup-counts"]', { timeout: 10000 })
  run.check(
    '刷新后备份状态保持 ok 且上次导出时间可见',
    (await page.locator('[data-testid="backup-status"]').getAttribute('data-status')) === 'ok' &&
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test((await page.textContent('[data-testid="backup-last-at"]')).replace('上次导出：', '').trim()),
    await page.textContent('[data-testid="backup-last-at"]'),
  )

  /* ---------- 4. 周期 3/7/14/30 边界、关闭提醒与刷新持久化 ---------- */
  await h.setSetting(page, 'lastBackupAt', h.daysAgoIso(10))
  await h.reloadSettingsStore(page)
  await page.waitForTimeout(250)
  run.check(
    '10 天前 + 周期 7 → stale',
    (await page.locator('[data-testid="backup-status"]').getAttribute('data-status')) === 'stale' &&
      (await statusText(page)).includes('已 10 天未备份（周期 7 天）'),
    await statusText(page),
  )
  await page.selectOption('[data-testid="backup-days"]', '14')
  await page.waitForTimeout(250)
  run.check(
    '周期改 14 → 立即重算 ok',
    (await page.locator('[data-testid="backup-status"]').getAttribute('data-status')) === 'ok' &&
      (await statusText(page)).includes('上次备份：10 天前'),
    await statusText(page),
  )
  run.check('周期 14 已落库', (await h.getSetting(page, 'backupReminderDays')) === 14)
  await page.selectOption('[data-testid="backup-days"]', '3')
  await page.waitForTimeout(250)
  run.check('周期 3 → stale', (await page.locator('[data-testid="backup-status"]').getAttribute('data-status')) === 'stale')
  await page.selectOption('[data-testid="backup-days"]', '30')
  await page.waitForTimeout(250)
  run.check('周期 30 → ok', (await page.locator('[data-testid="backup-status"]').getAttribute('data-status')) === 'ok')
  await page.selectOption('[data-testid="backup-days"]', '7')
  await page.waitForTimeout(250)
  run.check('周期 7 → stale', (await page.locator('[data-testid="backup-status"]').getAttribute('data-status')) === 'stale')

  await page.click('[data-testid="backup-reminder-toggle"]')
  await page.waitForTimeout(200)
  run.check(
    '关闭提醒后状态行隐藏，但上次导出时间仍显示',
    (await page.locator('[data-testid="backup-status"]').count()) === 0 &&
      (await page.textContent('[data-testid="backup-last-at"]')).includes('上次导出：'),
  )
  run.check('关闭提醒不删账目/分类', (await h.readStore(page, 'records')).length === 4 && (await h.readStore(page, 'categories')).length === 16)
  run.check('关闭提醒落库 backupReminderEnabled=false', (await h.getSetting(page, 'backupReminderEnabled')) === false)
  await page.reload()
  await page.waitForSelector('[data-testid="backup-counts"]', { timeout: 10000 })
  run.check(
    '刷新后提醒仍关闭、周期仍 7',
    (await page.locator('[data-testid="backup-status"]').count()) === 0 &&
      (await page.inputValue('[data-testid="backup-days"]')) === '7',
  )
  await page.click('[data-testid="backup-reminder-toggle"]')
  await page.waitForTimeout(200)
  run.check(
    '重新开启提醒 → 状态行恢复',
    (await page.locator('[data-testid="backup-status"]').count()) === 1 &&
      (await h.getSetting(page, 'backupReminderEnabled')) === true,
  )

  /* ---------- 5. 分享取消 / 失败 / 成功的时间语义 ---------- */
  const beforeShare = await h.getSetting(page, 'lastBackupAt')
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    Object.defineProperty(navigator, 'share', {
      value: async () => {
        throw new DOMException('cancelled', 'AbortError')
      },
      configurable: true,
    })
  })
  await page.click('[data-testid="backup-export"]')
  await page.waitForFunction(() => document.querySelector('.msg')?.textContent.includes('已取消分享'))
  run.check(
    '分享取消 → 明确提示且不写时间',
    (await h.getSetting(page, 'lastBackupAt')) === beforeShare,
    await page.textContent('.msg'),
  )
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', {
      value: async () => {
        throw new Error('share failed')
      },
      configurable: true,
    })
  })
  await page.click('[data-testid="backup-export"]')
  await page.waitForFunction(() => document.querySelector('.msg')?.textContent.includes('分享失败'))
  run.check('分享失败 → 不写时间', (await h.getSetting(page, 'lastBackupAt')) === beforeShare)
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { value: async () => {}, configurable: true })
  })
  await page.click('[data-testid="backup-export"]')
  await page.waitForFunction(() => document.querySelector('.msg')?.textContent.includes('已导出备份'))
  const afterShare = await h.getSetting(page, 'lastBackupAt')
  run.check(
    '分享 resolved → 写时间并提示确认落盘',
    typeof afterShare === 'string' && afterShare !== beforeShare,
    String(afterShare),
  )

  /* ---------- 6. 恶意导入：lastBackupAt/迁移标记不被改，新周期键可恢复 ---------- */
  await h.setSetting(page, 'lastBackupAt', h.daysAgoIso(20))
  const seedBefore = await h.getSetting(page, 'seedVersion')
  const identityBefore = await h.getSetting(page, 'builtinIdentityVersion')
  const beforeRecords = (await h.readStore(page, 'records')).length
  const beforeCategories = (await h.readStore(page, 'categories')).length
  const malicious = JSON.parse(JSON.stringify(exported.payload))
  const localOnly = ['lastBackupAt', 'seedVersion', 'builtinIdentityVersion', 'syncConfig', 'evilImportKey', 'backupReminderDays', 'backupReminderEnabled']
  malicious.settings = (malicious.settings || []).filter((row) => !localOnly.includes(row.key))
  const future = Date.now() + 600000
  malicious.settings.push(
    { key: 'lastBackupAt', value: new Date().toISOString(), updatedAt: future },
    { key: 'seedVersion', value: 99, updatedAt: future },
    { key: 'builtinIdentityVersion', value: 99, updatedAt: future },
    { key: 'syncConfig', value: { token: 'LEAK' }, updatedAt: future },
    { key: 'evilImportKey', value: 'nope', updatedAt: future },
    { key: 'backupReminderDays', value: 14, updatedAt: future },
    { key: 'backupReminderEnabled', value: false, updatedAt: future },
  )
  await page.setInputFiles('input[type=file]', {
    name: 'malicious.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(malicious)),
  })
  await page.waitForSelector('[data-testid="import-preview"]', { timeout: 8000 })
  await page.click('button:has-text("确认导入")')
  await page.waitForFunction(() => document.querySelector('.msg')?.textContent.includes('导入完成'), undefined, { timeout: 10000 })
  const importedLast = await h.getSetting(page, 'lastBackupAt')
  run.check(
    '恶意导入不改本地 lastBackupAt（仍为 20 天前）',
    typeof importedLast === 'string' && importedLast.slice(0, 10) === h.daysAgoIso(20).slice(0, 10),
    String(importedLast),
  )
  run.check(
    '恶意导入不改 seedVersion / builtinIdentityVersion',
    (await h.getSetting(page, 'seedVersion')) === seedBefore &&
      (await h.getSetting(page, 'builtinIdentityVersion')) === identityBefore,
    `${seedBefore}/${identityBefore}`,
  )
  run.check(
    '白名单外键 syncConfig / evilImportKey 未落库',
    (await h.getSetting(page, 'syncConfig')) === null &&
      (await h.getSetting(page, 'evilImportKey')) === null,
  )
  run.check(
    '新周期键可从备份恢复（14 天 / 关闭提醒）',
    (await h.getSetting(page, 'backupReminderDays')) === 14 &&
      (await h.getSetting(page, 'backupReminderEnabled')) === false,
  )
  run.check(
    '恶意导入不增删账目与分类',
    (await h.readStore(page, 'records')).length === beforeRecords &&
      (await h.readStore(page, 'categories')).length === beforeCategories,
  )

  /* ---------- 7. 记一笔页轻提示：开启+过期才出现，ok/关闭时隐藏 ---------- */
  await h.setSetting(page, 'backupReminderEnabled', false)
  await h.openAdd(page)
  run.check('提醒关闭时记一笔页无轻提示', (await page.locator('[data-testid="backup-reminder"]').count()) === 0)
  await h.setSetting(page, 'backupReminderEnabled', true)
  await h.setSetting(page, 'lastBackupAt', h.daysAgoIso(20))
  await h.openAdd(page)
  await page.waitForSelector('[data-testid="backup-reminder"]', { timeout: 6000 })
  run.check(
    '过期 + 开启 → 记一笔页出现非阻塞提醒',
    (await page.textContent('[data-testid="backup-reminder"]')).includes('20 天未备份'),
    await page.textContent('[data-testid="backup-reminder"]'),
  )
  await page.click('[data-testid="backup-reminder"]')
  await page.waitForURL(/#\/settings/)
  run.check('轻提示跳转设置页', page.url().includes('#/settings'))
  await h.setSetting(page, 'lastBackupAt', new Date().toISOString())
  await h.openAdd(page)
  await page.waitForTimeout(400)
  run.check('备份为 ok 时记一笔页无轻提示', (await page.locator('[data-testid="backup-reminder"]').count()) === 0)

  await run.finish(browser)
})().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
