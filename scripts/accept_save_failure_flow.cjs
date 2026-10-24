/**
 * E2E 验收：P0-3B 保存三态（明确 abort / 结果未知 / reload 失败）与撤销安全
 * 前置：dev server 跑在 5199；NODE_PATH 指向 playwright-core 所在 node_modules
 */
const h = require('./e2e-harness.cjs')

const run = h.createRun('保存三态 E2E')
const FAILED_MSG = '未保存，请检查浏览器存储后重试'
const UNKNOWN_MSG = '保存结果未确认，请先到流水页核实'
const REFRESH_MSG = '已保存，列表暂未刷新'

async function recordsWithNote(page, note) {
  return (await h.readStore(page, 'records')).filter((rec) => rec.note === note)
}

;(async () => {
  const { browser, context } = await h.launch({ canShare: false })
  const page = await context.newPage()
  run.attach(page)

  /* ---------- 1. 明确 abort：不误报成功、保留输入、零落库 ---------- */
  await h.openAdd(page, { amount: '12.34', note: 'ABORT-CASE' })
  await h.setFailure(page, { store: 'records', op: 'put', name: 'AbortError' })
  await page.click('.pad .ok')
  await h.waitToast(page, FAILED_MSG)
  run.check('明确 abort → 显示「未保存」', (await page.textContent('.toast')).includes(FAILED_MSG))
  run.check(
    '失败后保留金额与备注',
    (await page.textContent('.amount')).includes('12.34') && (await page.inputValue('.note')) === 'ABORT-CASE',
    `${await page.textContent('.amount')} / ${await page.inputValue('.note')}`,
  )
  run.check('失败后未落库', (await recordsWithNote(page, 'ABORT-CASE')).length === 0)

  /* ---------- 2. 结果未知：不自动重试、保留输入 ---------- */
  await page.fill('.note', 'UNKNOWN-CASE')
  await h.setFailure(page, { store: 'records', op: 'put', name: 'UnknownError' })
  await page.click('.pad .ok')
  await h.waitToast(page, UNKNOWN_MSG)
  run.check('未知结果 → 显示「保存结果未确认」', (await page.textContent('.toast')).includes(UNKNOWN_MSG))
  await page.waitForTimeout(1300)
  run.check('未知结果不自动重试（1.3s 后仍零落库）', (await recordsWithNote(page, 'UNKNOWN-CASE')).length === 0)
  run.check(
    '未知结果后输入仍保留',
    (await page.textContent('.amount')).includes('12.34') && (await page.inputValue('.note')) === 'UNKNOWN-CASE',
  )

  /* ---------- 3. 写库成功但 reload 失败：显示已保存，不引导重复提交 ---------- */
  await page.fill('.note', 'REFRESH-CASE')
  await h.setFailure(page, { store: 'records', op: 'getAll', name: 'AbortError' })
  await page.click('.pad .ok')
  await h.waitToast(page, REFRESH_MSG)
  const refreshed = await recordsWithNote(page, 'REFRESH-CASE')
  run.check('reload 失败 → 显示「已保存，列表暂未刷新」且账目确实已落库', refreshed.length === 1)
  run.check(
    'reload 失败时写库成功，表单按成功语义清空',
    (await page.textContent('.amount')).includes('0.00') && (await page.inputValue('.note')) === '',
  )
  await page.click('.toast')
  await page.waitForTimeout(250)
  const refreshedAfterToast = await recordsWithNote(page, 'REFRESH-CASE')
  run.check(
    '点击「已保存」提示不会撤销该笔（无撤销句柄）',
    refreshedAfterToast.length === 1 && refreshedAfterToast[0].deleted === false,
  )

  /* ---------- 4. 失败提示不得误撤销上一笔成功账 ---------- */
  await h.openAdd(page, { amount: '7', note: 'GOOD' })
  await page.click('.pad .ok')
  await h.waitToast(page, '已记')
  const goodBefore = (await recordsWithNote(page, 'GOOD'))[0]
  run.check('上一笔成功保存并带撤销提示', (await page.textContent('.toast')).includes('撤销') && !!goodBefore)
  await page.fill('.note', 'BAD')
  await page.locator('.pad .key').first().click() // 上一笔成功后金额已清空，重新输入 1 元
  await h.setFailure(page, { store: 'records', op: 'put', name: 'AbortError' })
  await page.click('.pad .ok')
  await h.waitToast(page, FAILED_MSG)
  await page.click('.toast')
  await page.waitForTimeout(300)
  const goodAfter = (await recordsWithNote(page, 'GOOD'))[0]
  run.check(
    '失败 toast 点击后上一笔仍未被软删',
    goodAfter && goodAfter.deleted === false,
    JSON.stringify(goodAfter),
  )
  run.check('失败的那笔未落库', (await recordsWithNote(page, 'BAD')).length === 0)

  /* ---------- 5. 编辑页保存失败：留在本页、保留输入、库内不变 ---------- */
  await page.goto(`${h.BASE}/#/record/${goodBefore.id}`)
  await page.waitForSelector('.note')
  await page.fill('.note', 'EDIT-FAIL')
  await h.setFailure(page, { store: 'records', op: 'put', name: 'AbortError' })
  await page.click('.pad .ok')
  await h.waitToast(page, FAILED_MSG)
  run.check('编辑保存失败仍留在编辑页', page.url().includes(`#/record/${goodBefore.id}`), page.url())
  run.check('编辑保存失败保留输入', (await page.inputValue('.note')) === 'EDIT-FAIL')
  run.check(
    '编辑保存失败不改库内原值',
    (await h.readStore(page, 'records')).find((rec) => rec.id === goodBefore.id)?.note === 'GOOD',
  )

  /* ---------- 6. 分类表单保存失败：不收起表单 ---------- */
  await page.goto(h.BASE + '/#/categories')
  await page.waitForSelector('.rows')
  await page.click('.btn.add')
  await page.waitForSelector('.form')
  await page.fill('.form .field:has-text("名称") .input', '失败分类')
  await h.setFailure(page, { store: 'categories', op: 'put', name: 'AbortError' })
  await page.click('.form .acts .btn:not(.ghost)')
  await page.waitForFunction(
    (text) => document.querySelector('.toast')?.textContent.includes(text),
    FAILED_MSG,
    { timeout: 6000 },
  )
  run.check('分类保存失败显示失败反馈且表单未收起', (await page.locator('.form').count()) === 1)
  run.check(
    '分类保存失败未落库',
    !(await h.readStore(page, 'categories')).some((cat) => cat.name === '失败分类'),
  )

  /* ---------- 7. 撤销失败：保留可重试句柄，不假装成功 ---------- */
  await h.openAdd(page, { amount: '9', note: 'UNDO-FAIL' })
  await page.click('.pad .ok')
  await h.waitToast(page, '已记')
  const undoRecord = (await recordsWithNote(page, 'UNDO-FAIL'))[0]
  await h.setFailure(page, { store: 'records', op: 'put', name: 'AbortError' })
  await page.click('.toast')
  await page.waitForFunction(
    () => document.querySelector('.toast')?.textContent.includes('撤销失败'),
    undefined,
    { timeout: 6000 },
  )
  run.check(
    '撤销失败提示且账目仍有效（未假装撤销成功）',
    (await h.readStore(page, 'records')).find((rec) => rec.id === undoRecord.id)?.deleted === false,
  )
  await page.click('.toast')
  await page.waitForTimeout(500)
  run.check(
    '撤销句柄保留：再点一次成功软删',
    (await h.readStore(page, 'records')).find((rec) => rec.id === undoRecord.id)?.deleted === true,
  )

  await run.finish(browser)
})().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
