/**
 * E2E 验收：P0-2 批量分类（多选/筛选/默认保护/取消/部分失败/迁移）
 * 前置：dev server 跑在 5199；NODE_PATH 指向 playwright-core 所在 node_modules
 */
const h = require('./e2e-harness.cjs')

const run = h.createRun('批量分类 E2E')
const today = (() => {
  const now = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
})()

function customCategory(id, name, type = 'expense', archived = false) {
  return {
    id,
    name,
    emoji: '🧪',
    color: '#778899',
    type,
    monthlyBudget: 0,
    order: 999,
    archived,
    lastUsedAt: 0,
    createdAt: 2000,
    updatedAt: 2000,
  }
}

const categories = [
  customCategory('custom-a', '批A'),
  customCategory('custom-b', '批B'),
  customCategory('custom-c', '批C'),
  customCategory('custom-d', '批D'),
  customCategory('custom-e', '批E', 'income'),
  customCategory('custom-f', '批F'),
  customCategory('custom-g', '批G'),
  customCategory('custom-h', '批H'),
]
const records = [
  h.makeRecord({ id: 'rec-b1', amount: 1000, categoryId: 'custom-b', note: 'B有效', date: today }),
  h.makeRecord({ id: 'rec-b2', amount: 2000, categoryId: 'custom-b', note: 'B回收站', date: today, deleted: true, deletedAt: 3000 }),
  h.makeRecord({ id: 'rec-c1', amount: 3000, categoryId: 'custom-c', note: 'C有效', date: today }),
  h.makeRecord({ id: 'rec-c2', amount: 4000, categoryId: 'custom-c', note: 'C回收站', date: today, deleted: true, deletedAt: 3000 }),
  h.makeRecord({ id: 'rec-f1', amount: 5000, categoryId: 'custom-f', note: 'F有效', date: today }),
]

const rowOf = (page, name) => page.locator('.rows .row', { hasText: name })
const filterGroup = (page, index) => page.locator('.fgroup').nth(index)

;(async () => {
  const { browser, context } = await h.launch({ canShare: false })
  const page = await context.newPage()
  run.attach(page)

  await page.goto(h.BASE + '/#/settings')
  await page.waitForSelector('[data-testid="backup-counts"]', { timeout: 10000 })
  await h.putRows(page, 'categories', categories)
  await h.putRows(page, 'records', records)
  await page.goto(h.BASE + '/#/categories')
  await page.reload()
  await page.waitForSelector('.rows .row', { timeout: 10000 })

  /* ---------- 1. 默认分类受保护 + 引用计数口径 ---------- */
  run.check(
    '列表 = 16 内置 + 8 自定义',
    (await page.locator('.rows .row').count()) === 24,
    String(await page.locator('.rows .row').count()),
  )
  run.check(
    '16 个内置分类 checkbox 全部 disabled 且标注「内置，受保护」',
    (await page.locator('.rows .check:disabled').count()) === 16 &&
      (await page.locator('.rows .tag', { hasText: '内置，受保护' }).count()) === 16,
  )
  const usageB = await rowOf(page, '批B').textContent()
  run.check('引用计数显示「有效 1 / 回收站 1」', usageB.includes('有效 1') && usageB.includes('回收站 1'), usageB.trim())

  /* ---------- 2. 筛选后全选 / 清空 ---------- */
  await filterGroup(page, 1).locator('button', { hasText: '自定义' }).click()
  await page.waitForTimeout(150)
  run.check('来源筛选「自定义」只剩 8 项', (await page.locator('.rows .row').count()) === 8)
  await page.locator('.selact', { hasText: '全选当前' }).click()
  run.check(
    '筛选后全选 → 已选 8 个且全部为自定义',
    (await page.locator('.selcount').textContent()).includes('已选 8 个') &&
      (await page.locator('.rows .check:checked').count()) === 8,
  )
  run.check('批量操作栏出现', (await page.locator('.bulk').count()) === 1)
  await page.locator('.selact', { hasText: '清空' }).click()
  run.check(
    '清空选择 → 批量栏消失、已选 0',
    (await page.locator('.bulk').count()) === 0 &&
      (await page.locator('.selcount').textContent()).includes('已选 0 个'),
  )

  /* ---------- 3. 只有内置项时「全选当前」不可点（空选择反馈） ---------- */
  await filterGroup(page, 1).locator('button', { hasText: '默认' }).click()
  await page.waitForTimeout(150)
  run.check(
    '仅默认项时全选按钮 disabled，且无批量栏',
    (await page.locator('.selact', { hasText: '全选当前' }).isDisabled()) &&
      (await page.locator('.bulk').count()) === 0,
  )
  await filterGroup(page, 1).locator('button', { hasText: '全部' }).click()
  await page.waitForTimeout(150)

  /* ---------- 4. 取消确认不执行 ---------- */
  await rowOf(page, '批G').locator('.check').check()
  await page.click('button:has-text("执行批量操作")')
  await page.waitForSelector('.confirm')
  await page.locator('.confirm .btn.ghost').click()
  run.check('取消确认 → 不执行', (await page.locator('.confirm').count()) === 0)
  run.check(
    '取消后批G仍存在',
    (await h.readStore(page, 'categories')).some((cat) => cat.id === 'custom-g'),
  )
  await page.locator('.selact', { hasText: '清空' }).click()

  /* ---------- 5. 部分失败：第 2 项 put 注入 AbortError，逐项可见 ---------- */
  await rowOf(page, '批B').locator('.check').check()
  await rowOf(page, '批F').locator('.check').check()
  await h.setFailure(page, { store: 'categories', op: 'put', name: 'AbortError', count: 2 })
  await page.click('button:has-text("执行批量操作")')
  await page.click('.confirm .btn.danger')
  await page.waitForSelector('.result')
  await page.waitForTimeout(300)
  const resultRows = await page.locator('.result-row').allTextContents()
  run.check(
    '逐项结果：批B 已归档、批F 失败（不统一报成功）',
    resultRows.some((text) => text.includes('批B') && text.includes('已归档')) &&
      resultRows.some((text) => text.includes('批F') && text.includes('失败')),
    resultRows.join(' | '),
  )
  run.check(
    '部分失败 toast 报「1 项成功，1 项未执行」',
    (await page.textContent('.toast')).includes('1 项成功，1 项未执行'),
    await page.textContent('.toast'),
  )
  const catsMid = await h.readStore(page, 'categories')
  run.check(
    '库状态：批B 已归档、批F 未归档',
    catsMid.find((cat) => cat.id === 'custom-b')?.archived === true &&
      catsMid.find((cat) => cat.id === 'custom-f')?.archived === false,
  )

  /* ---------- 6. 重复点击只执行一次 ---------- */
  await rowOf(page, '批G').locator('.check').check()
  await page.click('button:has-text("执行批量操作")')
  await page.locator('.confirm .btn.danger').evaluate((button) => {
    button.click()
    button.click()
  })
  await page.waitForSelector('.result')
  await page.waitForTimeout(400)
  run.check(
    '重复点击确认 → 批G 仅删除一次，结果仅 1 行',
    (await page.locator('.result-row').count()) === 1 &&
      (await h.readStore(page, 'categories')).every((cat) => cat.id !== 'custom-g'),
  )

  /* ---------- 7. 迁移后删除：active + 软删全部改挂，目标 lastUsedAt 不变 ---------- */
  const targetBefore = (await h.readStore(page, 'categories')).find((cat) => cat.id === 'custom-d')
  await rowOf(page, '批C').locator('.check').check()
  await page.click('button:has-text("迁移后删除")')
  const options = await page.locator('select[aria-label="迁移目标分类"] option').allTextContents()
  run.check(
    '迁移目标只列同类型未归档项：含批D，不含批E（收入）/批B（已归档）/批C（自身）',
    options.some((text) => text.includes('批D')) &&
      !options.some((text) => text.includes('批E')) &&
      !options.some((text) => text.includes('批B')) &&
      !options.some((text) => text.includes('批C')),
    options.join(' | '),
  )
  await page.selectOption('select[aria-label="迁移目标分类"]', 'custom-d')
  await page.click('button:has-text("执行批量操作")')
  await page.click('.confirm .btn.danger')
  await page.waitForSelector('.result')
  await page.waitForTimeout(300)
  run.check(
    '迁移结果「已迁移并删除」',
    (await page.textContent('.result')).includes('已迁移并删除'),
    await page.textContent('.result'),
  )
  const catsAfter = await h.readStore(page, 'categories')
  const recsAfter = await h.readStore(page, 'records')
  run.check('源分类批C已硬删', catsAfter.every((cat) => cat.id !== 'custom-c'))
  run.check(
    'active + 软删账目全部改挂批D，deleted 状态保留',
    recsAfter.find((rec) => rec.id === 'rec-c1')?.categoryId === 'custom-d' &&
      recsAfter.find((rec) => rec.id === 'rec-c1')?.deleted === false &&
      recsAfter.find((rec) => rec.id === 'rec-c2')?.categoryId === 'custom-d' &&
      recsAfter.find((rec) => rec.id === 'rec-c2')?.deleted === true,
  )
  const targetAfter = catsAfter.find((cat) => cat.id === 'custom-d')
  run.check(
    '迁移不刷目标 lastUsedAt / updatedAt',
    targetAfter.lastUsedAt === targetBefore.lastUsedAt && targetAfter.updatedAt === targetBefore.updatedAt,
    `${JSON.stringify(targetBefore)} vs ${JSON.stringify(targetAfter)}`,
  )
  run.check(
    '迁移前后金额合计守恒（7000 分）',
    recsAfter
      .filter((rec) => rec.categoryId === 'custom-d')
      .reduce((sum, rec) => sum + rec.amount, 0) === 7000,
  )
  await h.callStore(page, 'records', 'restore', 'rec-c2')
  const restored = (await h.readStore(page, 'records')).find((rec) => rec.id === 'rec-c2')
  run.check(
    '迁移后恢复软删记录 → 仍指向目标分类且金额不变',
    restored.deleted === false && restored.categoryId === 'custom-d' && restored.amount === 4000,
    JSON.stringify(restored),
  )

  /* ---------- 8. 迁移后统计页跟随更新 ---------- */
  await page.goto(h.BASE + '/#/stats')
  await page.waitForSelector('.mbar')
  const legend = await page.locator('.legend').textContent()
  run.check(
    '统计图例出现批D、不再出现批C',
    legend.includes('批D') && !legend.includes('批C'),
    legend.trim(),
  )

  /* ---------- 9. repository 层硬拒绝：跨类型目标 / 默认项 / 空选择 ---------- */
  const cross = await h.callStore(page, 'categories', 'bulkApply', {
    ids: ['custom-h'],
    mode: 'migrate-remove',
    targetId: 'custom-e',
  })
  run.check(
    '跨类型迁移目标被拒且批H保留',
    cross.results.length === 1 &&
      cross.results[0].status === 'failed' &&
      cross.results[0].error.includes('收支类型不一致') &&
      (await h.readStore(page, 'categories')).some((cat) => cat.id === 'custom-h'),
    JSON.stringify(cross.results),
  )
  const builtinProtected = await h.callStore(page, 'categories', 'bulkApply', {
    ids: [h.builtinId('expense', 'food')],
    mode: 'archive-remove',
  })
  run.check(
    '直接对内置分类调用批量删除 → protected，不落库',
    builtinProtected.results[0]?.status === 'protected' &&
      (await h.readStore(page, 'categories')).some((cat) => cat.id === h.builtinId('expense', 'food')),
    JSON.stringify(builtinProtected.results),
  )
  const empty = await h.callStore(page, 'categories', 'bulkApply', { ids: [], mode: 'archive-remove' })
  run.check('空选择直接调用 → results=[]（无写入）', Array.isArray(empty.results) && empty.results.length === 0)

  await run.finish(browser)
})().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
