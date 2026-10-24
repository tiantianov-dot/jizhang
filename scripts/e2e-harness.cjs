/**
 * E2E 共享工具 — 2026-10-24 B0–B5 验收（仅测试使用）
 *
 * 提供：浏览器启动、控制台/网络/页面异常采集、IndexedDB 夹具读写、
 * 故障注入钩子（指定第 N 次 put/getAll/delete 抛指定 DOMException）、断言计数。
 * 不修改应用源码；所有写入都发生在测试浏览器的临时 profile 里。
 */
const { chromium } = require('playwright-core')

const EXE =
  process.env.QA_CHROME ||
  'C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'
const BASE = process.env.QA_BASE || 'http://localhost:5199'

const BUILTIN = [
  ['expense', 'food', '餐饮', '🍚', '#D85A30'],
  ['expense', 'transport', '交通', '🚌', '#185FA5'],
  ['expense', 'shopping', '购物', '🛍️', '#993556'],
  ['expense', 'daily', '日用', '🧻', '#854F0B'],
  ['expense', 'housing', '居住', '🏠', '#534AB7'],
  ['expense', 'entertainment', '娱乐', '🎮', '#0F6E56'],
  ['expense', 'medical', '医疗', '💊', '#A32D2D'],
  ['expense', 'social', '社交', '🎁', '#D4537E'],
  ['expense', 'education', '学习', '📚', '#3B6D11'],
  ['expense', 'telecom', '通讯', '📱', '#378ADD'],
  ['expense', 'other', '其他', '📦', '#5F5E5A'],
  ['income', 'salary', '工资', '💰', '#0F6E56'],
  ['income', 'parttime', '兼职', '🧧', '#BA7517'],
  ['income', 'investment', '理财', '📈', '#993C1D'],
  ['income', 'redpacket', '红包', '🧧', '#E24B4A'],
  ['income', 'other', '其他', '📦', '#5F5E5A'],
].map(([type, key, name, emoji, color], order) => ({ type, key, name, emoji, color, order }))

const builtinId = (type, key) => `builtin:${type}:${key}`

function builtinOf(type, key) {
  return BUILTIN.find((item) => item.type === type && item.key === key)
}

/** 旧设备种子分类：随机 UUID 风格 ID + 完整 canonical 指纹 */
function legacyCategory(canonical, id, overrides = {}) {
  return {
    id,
    name: canonical.name,
    emoji: canonical.emoji,
    color: canonical.color,
    type: canonical.type,
    monthlyBudget: 0,
    order: canonical.order,
    archived: false,
    lastUsedAt: 0,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  }
}

let recordSeq = 0
function makeRecord(overrides = {}) {
  recordSeq += 1
  return {
    id: `rec-${recordSeq}`,
    amount: 100,
    type: 'expense',
    categoryId: builtinId('expense', 'food'),
    note: '',
    date: '2026-10-20',
    createdAt: 1000 + recordSeq,
    updatedAt: 1000 + recordSeq,
    deleted: false,
    deletedAt: null,
    private: false,
    owner: 'me',
    ...overrides,
  }
}

function createRun(title) {
  const state = {
    title,
    pass: 0,
    fail: 0,
    results: [],
    consoleErrors: [],
    pageErrors: [],
    externalRequests: [],
  }

  state.check = (name, ok, detail = '') => {
    if (ok) state.pass += 1
    else state.fail += 1
    state.results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  }

  state.attach = (page) => {
    page.setDefaultTimeout(8000)
    page.on('console', (msg) => {
      if (msg.type() === 'error') state.consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err) => state.pageErrors.push(err.message))
    page.on('request', (req) => {
      const url = req.url()
      if (/^(data|blob|about):/.test(url)) return
      try {
        const target = new URL(url)
        const local = new URL(BASE)
        if (!/^(https?|wss?):$/.test(target.protocol)) return
        if (target.hostname !== local.hostname || target.port !== local.port) {
          state.externalRequests.push(url)
        }
      } catch {
        state.externalRequests.push(url)
      }
    })
  }

  state.finish = async (browser) => {
    state.check(
      '控制台零错误',
      state.consoleErrors.length === 0,
      state.consoleErrors.slice(0, 3).join(' | '),
    )
    state.check(
      '无未捕获页面异常',
      state.pageErrors.length === 0,
      state.pageErrors.slice(0, 3).join(' | '),
    )
    state.check(
      '无后端/外部请求',
      state.externalRequests.length === 0,
      state.externalRequests.slice(0, 3).join(' | '),
    )
    await browser.close()
    console.log(state.results.join('\n'))
    console.log(`\n${title}: ${state.pass} PASS, ${state.fail} FAIL`)
    process.exit(state.fail ? 1 : 0)
  }

  return state
}

function installIdbFailureHook(context) {
  return context.addInitScript(() => {
    window.__idbFail = null
    const ops = ['put', 'add', 'getAll', 'get', 'delete', 'clear']
    for (const op of ops) {
      const original = IDBObjectStore.prototype[op]
      IDBObjectStore.prototype[op] = function (...args) {
        const fail = window.__idbFail
        if (fail && fail.store === this.name && fail.op === op) {
          if (fail.count > 1) {
            fail.count -= 1
            return original.apply(this, args)
          }
          fail.count -= 1
          if (fail.count <= 0) window.__idbFail = null
          const name = fail.name || 'AbortError'
          throw new DOMException(`injected ${name}`, name)
        }
        return original.apply(this, args)
      }
    }
  })
}

async function launch({ canShare } = {}) {
  const browser = await chromium.launch({ executablePath: EXE, headless: true })
  const context = await browser.newContext()
  await installIdbFailureHook(context)
  if (canShare === false) {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true })
    })
  }
  return { browser, context }
}

async function setFailure(page, spec) {
  await page.evaluate((value) => {
    window.__idbFail = value ? { count: 1, name: 'AbortError', ...value } : null
  }, spec)
}

function readStore(page, store) {
  return page.evaluate(
    (storeName) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('jizhang', 1)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const db = req.result
          const all = db.transaction(storeName).objectStore(storeName).getAll()
          all.onsuccess = () => {
            db.close()
            resolve(all.result)
          }
          all.onerror = () => reject(all.error)
        }
      }),
    store,
  )
}

function getSetting(page, key) {
  return page.evaluate(
    (settingKey) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('jizhang', 1)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const db = req.result
          const row = db.transaction('settings').objectStore('settings').get(settingKey)
          row.onsuccess = () => {
            db.close()
            resolve(row.result ? row.result.value : null)
          }
          row.onerror = () => reject(row.error)
        }
      }),
    key,
  )
}

function setSetting(page, key, value, updatedAt = Date.now()) {
  return page.evaluate(
    ([settingKey, settingValue, stamp]) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('jizhang', 1)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('settings', 'readwrite')
          tx.objectStore('settings').put({ key: settingKey, value: settingValue, updatedAt: stamp })
          tx.oncomplete = () => {
            db.close()
            resolve('ok')
          }
          tx.onerror = () => reject(tx.error)
          tx.onabort = () => reject(tx.error || new Error('aborted'))
        }
      }),
    [key, value, updatedAt],
  )
}

function deleteSetting(page, key) {
  return page.evaluate(
    (settingKey) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('jizhang', 1)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('settings', 'readwrite')
          tx.objectStore('settings').delete(settingKey)
          tx.oncomplete = () => {
            db.close()
            resolve('ok')
          }
          tx.onerror = () => reject(tx.error)
          tx.onabort = () => reject(tx.error || new Error('aborted'))
        }
      }),
    key,
  )
}

function putRows(page, store, rows) {
  return page.evaluate(
    ([storeName, values]) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('jizhang', 1)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction(storeName, 'readwrite')
          const objectStore = tx.objectStore(storeName)
          for (const row of values) objectStore.put(row)
          tx.oncomplete = () => {
            db.close()
            resolve('ok')
          }
          tx.onerror = () => reject(tx.error)
          tx.onabort = () => reject(tx.error || new Error('aborted'))
        }
      }),
    [store, rows],
  )
}

function deleteRows(page, store, keys) {
  return page.evaluate(
    ([storeName, values]) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('jizhang', 1)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction(storeName, 'readwrite')
          const objectStore = tx.objectStore(storeName)
          for (const key of values) objectStore.delete(key)
          tx.oncomplete = () => {
            db.close()
            resolve('ok')
          }
          tx.onerror = () => reject(tx.error)
          tx.onabort = () => reject(tx.error || new Error('aborted'))
        }
      }),
    [store, keys],
  )
}

/** 模拟旧库：清空分类/账目，写入旧随机 ID 分类与账目，并删除迁移完成标记 */
function replaceLocalData(page, { categories, records }) {
  return page.evaluate(
    ([cats, recs]) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('jizhang', 1)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction(['categories', 'records', 'settings'], 'readwrite')
          const categoryStore = tx.objectStore('categories')
          const recordStore = tx.objectStore('records')
          const settingStore = tx.objectStore('settings')
          categoryStore.clear()
          recordStore.clear()
          settingStore.delete('builtinIdentityVersion')
          for (const cat of cats) categoryStore.put(cat)
          for (const rec of recs) recordStore.put(rec)
          tx.oncomplete = () => {
            db.close()
            resolve('ok')
          }
          tx.onerror = () => reject(tx.error)
          tx.onabort = () => reject(tx.error || new Error('aborted'))
        }
      }),
    [categories, records],
  )
}

function sortRows(rows, key) {
  return [...rows].sort((a, b) => String(a[key]).localeCompare(String(b[key])))
}

async function snapshot(page) {
  const [records, categories, settings] = await Promise.all([
    readStore(page, 'records'),
    readStore(page, 'categories'),
    readStore(page, 'settings'),
  ])
  return JSON.stringify({
    records: sortRows(records, 'id'),
    categories: sortRows(categories, 'id'),
    settings: sortRows(settings, 'key'),
  })
}

async function callStore(page, storeName, action, payload) {
  return page.evaluate(
    ([name, method, args]) => {
      const app = document.querySelector('#app').__vue_app__
      const pinia =
        app.config.globalProperties.$pinia ||
        Object.getOwnPropertySymbols(app._context.provides)
          .map((symbol) => app._context.provides[symbol])
          .find((value) => value && value._s && typeof value._s.get === 'function')
      return pinia._s.get(name)[method](args)
    },
    [storeName, action, payload],
  )
}

async function reloadSettingsStore(page) {
  return page.evaluate(() => {
    const app = document.querySelector('#app').__vue_app__
    const pinia =
      app.config.globalProperties.$pinia ||
      Object.getOwnPropertySymbols(app._context.provides)
        .map((symbol) => app._context.provides[symbol])
        .find((value) => value && value._s && typeof value._s.get === 'function')
    return pinia._s.get('settings').load()
  })
}

async function openAdd(page, params = {}) {
  const query = new URLSearchParams(params).toString()
  await page.goto('about:blank')
  await page.goto(`${BASE}/#/add${query ? `?${query}` : ''}`)
  await page.waitForSelector('.cats .cat', { timeout: 10000 })
  await page.waitForTimeout(250)
}

async function waitToast(page, includes, timeout = 6000) {
  await page.waitForFunction(
    (text) => document.querySelector('.toast')?.textContent.includes(text),
    includes,
    { timeout },
  )
  return page.textContent('.toast')
}

function daysAgoIso(n) {
  const date = new Date()
  date.setDate(date.getDate() - n)
  return date.toISOString()
}

module.exports = {
  BASE,
  BUILTIN,
  builtinId,
  builtinOf,
  legacyCategory,
  makeRecord,
  createRun,
  launch,
  setFailure,
  readStore,
  getSetting,
  setSetting,
  deleteSetting,
  putRows,
  deleteRows,
  replaceLocalData,
  snapshot,
  callStore,
  reloadSettingsStore,
  openAdd,
  waitToast,
  daysAgoIso,
}
