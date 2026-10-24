/**
 * db/testIsolation.js — 仅测试辅助（不进入 UI / 生产路径）
 *
 * resetDatabase()：关闭单例连接 → deleteDatabase，保证每个用例从空库开始。
 * snapshot()：一次只读事务取 records/categories/settings 全量，按主键排序并规范化
 *             JSON，用于原子性断言（导入前后逐字段比较）。
 */
import { close, open, wrap } from './index'

const DB_NAME = 'jizhang'
const STORES = ['records', 'categories', 'settings']

export async function resetDatabase() {
  await close()
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('deleteDatabase blocked'))
  })
}

function primaryKey(store, row) {
  return String(store === 'settings' ? row?.key : row?.id)
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** @returns {Promise<{records: string[], categories: string[], settings: string[]}>} */
export async function snapshot() {
  const db = await open()
  const t = db.transaction(STORES)
  const requests = STORES.map((name) => t.objectStore(name).getAll())
  const rowsByStore = await Promise.all(requests.map((req) => wrap(req)))
  const out = {}
  STORES.forEach((name, index) => {
    out[name] = rowsByStore[index]
      .sort((a, b) => primaryKey(name, a).localeCompare(primaryKey(name, b)))
      .map(stable)
  })
  return out
}

export async function snapshotJSON() {
  return JSON.stringify(await snapshot())
}
