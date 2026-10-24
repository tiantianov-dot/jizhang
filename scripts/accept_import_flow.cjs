/**
 * E2E 验收：P0-1 / P0-3A 导入安全（v1 双随机 ID、预览、重复导入、失败零写入）
 * 前置：dev server 跑在 5199；NODE_PATH 指向 playwright-core 所在 node_modules
 * 运行：NODE_PATH=... node scripts/accept_import_flow.cjs
 */
const h = require('./e2e-harness.cjs')

const run = h.createRun('导入安全 E2E')
const P = h.BUILTIN
const localId = (type, key) => `legacy-a-${type}-${key}`
const backupId = (type, key) => `legacy-b-${type}-${key}`

function parseSummary(text) {
  const records = text.match(/账目[：:\s]*新增\s*(\d+)\s*·\s*更新\s*(\d+)\s*·\s*跳过\s*(\d+)/)
  const categories = text.match(
    /分类[：:\s]*新增\s*(\d+)\s*·\s*匹配\s*(\d+)\s*·\s*更新\s*(\d+)\s*·\s*跳过\s*(\d+)\s*·\s*冲突\s*(\d+)/,
  )
  const settings = text.match(/设置[：:\s]*更新\s*(\d+)\s*·\s*跳过\s*(\d+)/)
  const soft = text.match(/其中软删[：:\s]*新增\s*(\d+)\s*·\s*更新\s*(\d+)/)
  return {
    records: records && { added: +records[1], updated: +records[2], skipped: +records[3] },
    categories:
      categories && {
        added: +categories[1],
        matched: +categories[2],
        updated: +categories[3],
        skipped: +categories[4],
        conflicts: +categories[5],
      },
    settings: settings && { updated: +settings[1], skipped: +settings[2] },
    softDeleted: soft && { added: +soft[1], updated: +soft[2] },
  }
}

function sameSummary(a, b) {
  // 预览额外展示「其中软删」子行；最终 toast 只复述主计数。
  // 这里比较两边都展示的主计数，软删是否真正落库由后续账目断言覆盖。
  return JSON.stringify({
    records: a.records,
    categories: a.categories,
    settings: a.settings,
  }) === JSON.stringify({
    records: b.records,
    categories: b.categories,
    settings: b.settings,
  })
}

async function upload(page, payload, name = 'backup.json') {
  await page.setInputFiles('input[type=file]', {
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  })
}

async function waitImportError(page) {
  await page.waitForFunction(
    () => document.querySelector('.msg')?.textContent.includes('导入失败'),
    undefined,
    { timeout: 8000 },
  )
  return page.textContent('.msg')
}

async function reloadSettings(page) {
  await page.reload()
  await page.waitForSelector('[data-testid="backup-counts"]', { timeout: 10000 })
}

;(async () => {
  const { browser, context } = await h.launch({ canShare: false })
  const page = await context.newPage()
  run.attach(page)

  await page.goto(h.BASE + '/#/settings')
  await page.waitForSelector('[data-testid="backup-counts"]', { timeout: 10000 })
  const seeded = await h.readStore(page, 'categories')
  run.check(
    '新库种子为 16 个固定内置 ID',
    seeded.length === 16 && seeded.every((cat) => cat.id.startsWith('builtin:')),
    `${seeded.length} 个：${seeded.map((cat) => cat.id).slice(0, 3).join(',')}`,
  )

  /* ---------- 1. 模拟旧设备：16 个随机 ID 默认分类 + 自定义「咖啡」 ---------- */
  const localCategories = P.map((canonical) =>
    h.legacyCategory(canonical, localId(canonical.type, canonical.key)),
  )
  const localCoffee = {
    id: 'local-coffee',
    name: '咖啡',
    emoji: '☕',
    color: '#111111',
    type: 'expense',
    monthlyBudget: 0,
    order: 999,
    archived: false,
    lastUsedAt: 0,
    createdAt: 900,
    updatedAt: 900,
  }
  const localRecord = h.makeRecord({
    id: 'local-rec-1',
    amount: 3300,
    categoryId: localId('expense', 'food'),
    note: '迁移前账目',
    createdAt: 1100,
    updatedAt: 1100,
  })
  await h.replaceLocalData(page, {
    categories: [...localCategories, localCoffee],
    records: [localRecord],
  })
  // 标记已迁移，先保持旧随机 ID，验证“本地随机 ID + 备份另一套随机 ID”
  await h.setSetting(page, 'builtinIdentityVersion', 1)
  await reloadSettings(page)

  const oldLocal = await h.readStore(page, 'categories')
  run.check(
    '旧库前提成立：本地 16 个默认分类仍是随机 ID（与内置固定 ID 不同）',
    oldLocal.length === 17 &&
      oldLocal.every((cat) => !cat.id.startsWith('builtin:')) &&
      oldLocal.some((cat) => cat.id === localId('expense', 'food')),
    `${oldLocal.length} 个分类`,
  )

  /* ---------- 2. v1 备份：另一套随机 ID + 同名自定义 + 软删/private ---------- */
  const backupCategories = P.map((canonical) =>
    h.legacyCategory(canonical, backupId(canonical.type, canonical.key)),
  )
  const backupCoffee = {
    id: 'device-coffee',
    name: '咖啡',
    emoji: '🍵',
    color: '#222222',
    type: 'expense',
    monthlyBudget: 0,
    order: 999,
    archived: false,
    lastUsedAt: 0,
    createdAt: 1000,
    updatedAt: 1000,
  }
  const backupCoffee2 = {
    ...backupCoffee,
    id: 'device-coffee-2',
    emoji: '🥤',
    color: '#333333',
    updatedAt: 1000,
  }
  const v1Records = [
    h.makeRecord({
      id: 'v1-food',
      amount: 2500,
      categoryId: backupId('expense', 'food'),
      note: 'v1午饭',
      date: '2026-10-18',
      createdAt: 5000,
      updatedAt: 5000,
      private: undefined,
      owner: undefined,
      deletedAt: undefined,
    }),
    h.makeRecord({
      id: 'v1-salary',
      amount: 100000,
      type: 'income',
      categoryId: backupId('income', 'salary'),
      note: 'v1工资',
      date: '2026-10-18',
      createdAt: 5001,
      updatedAt: 5001,
    }),
    h.makeRecord({
      id: 'v1-coffee',
      amount: 1800,
      categoryId: 'device-coffee',
      note: 'v1咖啡',
      date: '2026-10-19',
      createdAt: 5002,
      updatedAt: 5002,
    }),
    h.makeRecord({
      id: 'v1-coffee-2',
      amount: 1800,
      categoryId: 'device-coffee-2',
      note: 'v1咖啡2（同额同日）',
      date: '2026-10-19',
      createdAt: 5003,
      updatedAt: 5003,
    }),
    h.makeRecord({
      id: 'v1-other-expense',
      amount: 300,
      categoryId: backupId('expense', 'other'),
      note: 'v1其他支出',
      date: '2026-10-19',
      createdAt: 5004,
      updatedAt: 5004,
    }),
    h.makeRecord({
      id: 'v1-other-income',
      amount: 400,
      type: 'income',
      categoryId: backupId('income', 'other'),
      note: 'v1其他收入',
      date: '2026-10-19',
      createdAt: 5005,
      updatedAt: 5005,
    }),
    h.makeRecord({
      id: 'v1-deleted',
      amount: 500,
      categoryId: backupId('expense', 'daily'),
      note: 'v1回收站',
      date: '2026-10-19',
      deleted: true,
      deletedAt: 6000,
      createdAt: 5006,
      updatedAt: 5006,
    }),
    h.makeRecord({
      id: 'v1-private',
      amount: 600,
      categoryId: backupId('expense', 'shopping'),
      note: 'v1本机标记',
      date: '2026-10-19',
      private: true,
      createdAt: 5007,
      updatedAt: 5007,
    }),
  ]
  // 故意缺 private / owner / deletedAt 字段，验证 normalize 补全
  delete v1Records[0].private
  delete v1Records[0].owner
  delete v1Records[0].deletedAt
  delete v1Records[0].deleted

  const v1Payload = {
    app: 'jizhang',
    version: 1,
    exportedAt: '2026-10-19T12:00:00.000Z',
    records: v1Records,
    categories: [...backupCategories, backupCoffee, backupCoffee2],
    settings: [
      { key: 'monthlyBudget', value: 12345, updatedAt: 100 },
      { key: 'lastBackupAt', value: '2020-01-01T00:00:00.000Z', updatedAt: 999999 },
      { key: 'evilImportKey', value: 'nope', updatedAt: 999999 },
    ],
  }

  await reloadSettings(page)
  const beforeImport = await h.snapshot(page)
  await upload(page, v1Payload, 'jizhang-v1.json')
  await page.waitForSelector('[data-testid="import-preview"]', { timeout: 8000 })
  const previewText = await page.textContent('[data-testid="import-preview"]')
  const preview = parseSummary(previewText)
  const duringPreview = await h.snapshot(page)
  run.check('预览阶段零写入（三 store 快照不变）', duringPreview === beforeImport)
  run.check(
    '预览：账目新增 8（含软删 1）',
    preview.records?.added === 8 && preview.softDeleted?.added === 1,
    JSON.stringify(preview),
  )
  run.check(
    '预览：16 个旧默认分类全部匹配，仅新增 2 个同名自定义',
    preview.categories?.matched === 16 && preview.categories?.added === 2,
    JSON.stringify(preview.categories),
  )
  run.check('预览：settings 白名单外键被忽略（仅 1 条跳过）', preview.settings?.skipped === 1, JSON.stringify(preview.settings))

  await page.click('button:has-text("确认导入")')
  await page.waitForFunction(() => document.querySelector('.msg')?.textContent.includes('导入完成'), undefined, { timeout: 10000 })
  const doneMsg = await page.textContent('.msg')
  const finalSummary = parseSummary(doneMsg)
  run.check('导入预览主计数 = 最终结果主计数', sameSummary(preview, finalSummary), `预览=${JSON.stringify(preview)} 最终=${JSON.stringify(finalSummary)}`)

  const catsAfter = await h.readStore(page, 'categories')
  const recsAfter = await h.readStore(page, 'records')
  const builtinCount = catsAfter.filter((cat) => cat.id.startsWith('builtin:')).length
  run.check(
    '导入后仍无固定 ID（旧库未被提前改写），分类 = 16 随机默认 + 3 自定义',
    catsAfter.length === 19 && builtinCount === 0,
    `${catsAfter.length} 个，builtin=${builtinCount}`,
  )

  const foodRec = recsAfter.find((rec) => rec.id === 'v1-food')
  const salaryRec = recsAfter.find((rec) => rec.id === 'v1-salary')
  const otherExp = recsAfter.find((rec) => rec.id === 'v1-other-expense')
  const otherInc = recsAfter.find((rec) => rec.id === 'v1-other-income')
  run.check(
    '账目分类 ID 被改写为本地同类分类（不是备份里的旧 ID）',
    foodRec?.categoryId === localId('expense', 'food') &&
      salaryRec?.categoryId === localId('income', 'salary') &&
      otherExp?.categoryId === localId('expense', 'other') &&
      otherInc?.categoryId === localId('income', 'other'),
    JSON.stringify({
      food: foodRec?.categoryId,
      salary: salaryRec?.categoryId,
      otherExpense: otherExp?.categoryId,
      otherIncome: otherInc?.categoryId,
    }),
  )
  const catById = new Map(catsAfter.map((cat) => [cat.id, cat]))
  const allReferencesValid = recsAfter.every((rec) => {
    const cat = catById.get(rec.categoryId)
    return cat && cat.type === rec.type
  })
  run.check('所有账目（含软删）引用都存在且收支一致', allReferencesValid)

  run.check(
    'v1 字段补全：缺省 private=false / owner=me / deleted=false / deletedAt=null',
    foodRec &&
      foodRec.private === false &&
      foodRec.owner === 'me' &&
      foodRec.deleted === false &&
      foodRec.deletedAt === null,
    JSON.stringify(foodRec),
  )
  run.check(
    '回收站记录保留 deleted/deletedAt',
    recsAfter.find((rec) => rec.id === 'v1-deleted')?.deleted === true &&
      recsAfter.find((rec) => rec.id === 'v1-deleted')?.deletedAt === 6000,
  )
  run.check(
    '本机标记记录保留 private=true',
    recsAfter.find((rec) => rec.id === 'v1-private')?.private === true,
  )
  run.check(
    '同额同日但不同 ID 的两笔都保留（不按金额/日期去重）',
    recsAfter.some((rec) => rec.id === 'v1-coffee') &&
      recsAfter.some((rec) => rec.id === 'v1-coffee-2'),
  )
  const coffeeLocal = catsAfter.find((cat) => cat.id === 'local-coffee')
  run.check(
    '同名自定义不被合并/覆盖：本地「咖啡」原样保留',
    coffeeLocal && coffeeLocal.emoji === '☕' && coffeeLocal.color === '#111111',
    JSON.stringify(coffeeLocal),
  )
  run.check(
    '备份中两个同名自定义「咖啡」分别新增（不互相合并）',
    catsAfter.some((cat) => cat.id === 'device-coffee' && cat.emoji === '🍵') &&
      catsAfter.some((cat) => cat.id === 'device-coffee-2' && cat.emoji === '🥤'),
  )
  run.check(
    '恶意 settings 未落库：lastBackupAt / evilImportKey 保持不存在',
    (await h.getSetting(page, 'lastBackupAt')) === null &&
      (await h.getSetting(page, 'evilImportKey')) === null,
  )
  run.check(
    '较旧的 monthlyBudget(updatedAt=100) 不覆盖本地',
    (await h.getSetting(page, 'monthlyBudget')) !== 12345,
  )

  /* ---------- 3. 同一文件第二次导入：稳定 skipped ---------- */
  const beforeSecond = await h.snapshot(page)
  await upload(page, v1Payload, 'jizhang-v1.json')
  await page.waitForSelector('[data-testid="import-preview"]', { timeout: 8000 })
  const secondPreview = parseSummary(await page.textContent('[data-testid="import-preview"]'))
  run.check(
    '二次导入预览：账目新增 0 / 跳过 8，分类新增 0 / 匹配 16 / 跳过 2',
    secondPreview.records?.added === 0 &&
      secondPreview.records?.skipped === 8 &&
      secondPreview.categories?.added === 0 &&
      secondPreview.categories?.matched === 16 &&
      secondPreview.categories?.skipped === 2,
    JSON.stringify(secondPreview),
  )
  await page.click('button:has-text("确认导入")')
  await page.waitForFunction(() => document.querySelector('.msg')?.textContent.includes('导入完成'), undefined, { timeout: 10000 })
  const afterSecond = await h.snapshot(page)
  run.check('二次导入后三 store 快照完全不变（真正不增长）', afterSecond === beforeSecond)
  run.check(
    '二次导入后分类/账目数量稳定',
    (await h.readStore(page, 'categories')).length === 19 &&
      (await h.readStore(page, 'records')).length === 9,
  )

  /* ---------- 4. 移除迁移标记 → 启动时原子 rekey 到固定内置 ID ---------- */
  await h.deleteSetting(page, 'builtinIdentityVersion')
  await reloadSettings(page)
  const migratedCats = await h.readStore(page, 'categories')
  const migratedRecs = await h.readStore(page, 'records')
  const migratedBuiltin = migratedCats.filter((cat) => cat.id.startsWith('builtin:'))
  run.check(
    '旧随机默认分类全部 rekey 为 16 个固定内置 ID',
    migratedBuiltin.length === 16 &&
      migratedCats.length === 19 &&
      !migratedCats.some((cat) => cat.id.startsWith('legacy-a-')),
    `builtin=${migratedBuiltin.length} total=${migratedCats.length}`,
  )
  run.check(
    '迁移后全部账目（含导入的软删）引用有效且收支一致',
    migratedRecs.every((rec) => {
      const cat = migratedCats.find((item) => item.id === rec.categoryId)
      return cat && cat.type === rec.type
    }),
  )
  run.check(
    '迁移标记已写入 builtinIdentityVersion=1',
    (await h.getSetting(page, 'builtinIdentityVersion')) === 1,
  )
  run.check(
    '迁移不改自定义分类，本地「咖啡」仍为 ☕',
    migratedCats.find((cat) => cat.id === 'local-coffee')?.emoji === '☕',
  )

  /* ---------- 5. 未来版本 / 缺失集合 / 悬空引用：写入前拒绝 ---------- */
  for (const [label, payload] of [
    ['未知未来版本 version=99', { ...v1Payload, version: 99 }],
    ['缺失 categories 集合', { app: 'jizhang', version: 1, records: [], settings: [] }],
    [
      '账目引用不存在的分类',
      {
        app: 'jizhang',
        version: 2,
        records: [
          h.makeRecord({
            id: 'dangling-1',
            categoryId: 'no-such-category',
            note: '悬空引用',
          }),
        ],
        categories: [],
        settings: [],
      },
    ],
    [
      '账目收支与分类不一致',
      {
        app: 'jizhang',
        version: 2,
        records: [
          h.makeRecord({
            id: 'mismatch-1',
            type: 'expense',
            categoryId: h.builtinId('income', 'salary'),
            note: '类型不符',
          }),
        ],
        categories: [],
        settings: [],
      },
    ],
  ]) {
    await reloadSettings(page)
    const before = await h.snapshot(page)
    await upload(page, payload, 'reject.json')
    const message = await waitImportError(page)
    const previewShown = (await page.locator('[data-testid="import-preview"]').count()) > 0
    const after = await h.snapshot(page)
    run.check(`${label} → 拒绝且零写入`, !previewShown && after === before, message)
  }

  /* ---------- 6. 合法预览后取消 → 不写 ---------- */
  await reloadSettings(page)
  const beforeCancel = await h.snapshot(page)
  const cancelPayload = {
    app: 'jizhang',
    version: 2,
    records: [h.makeRecord({ id: 'cancel-1', note: '取消导入', amount: 700, date: '2026-10-21' })],
    categories: [],
    settings: [],
  }
  await upload(page, cancelPayload, 'cancel.json')
  await page.waitForSelector('[data-testid="import-preview"]', { timeout: 8000 })
  await page.click('button:has-text("取消")')
  await page.waitForFunction(() => document.querySelector('.msg')?.textContent.includes('已取消导入'))
  run.check('预览后取消 → 三 store 快照不变', (await h.snapshot(page)) === beforeCancel)

  /* ---------- 7. 确认时写入故障 → 原子回滚 ---------- */
  await reloadSettings(page)
  const beforeFailure = await h.snapshot(page)
  await upload(page, cancelPayload, 'atomic.json')
  await page.waitForSelector('[data-testid="import-preview"]', { timeout: 8000 })
  await h.setFailure(page, { store: 'records', op: 'put', name: 'AbortError' })
  await page.click('button:has-text("确认导入")')
  const failureMessage = await waitImportError(page)
  const afterFailure = await h.snapshot(page)
  run.check(
    '第 1 次 records.put 注入 AbortError → 导入失败且三 store 快照不变',
    afterFailure === beforeFailure,
    failureMessage,
  )
  run.check(
    '故障导入未留下半成品账目',
    !(await h.readStore(page, 'records')).some((rec) => rec.id === 'cancel-1'),
  )

  await run.finish(browser)
})().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
