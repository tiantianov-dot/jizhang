/**
 * db/index.js — IndexedDB 引擎层（本文件只关心「怎么存取」，不关心业务）
 *
 * 职责：打开数据库、版本升级建表、事务包装、通用 CRUD 原语。
 * 领域逻辑（records/categories/settings 的读写规则）全部在 src/repositories/。
 * 数据模型字段约定见 src/models.js。
 *
 * object stores：
 *   records    账目    keyPath: id   索引: date / categoryId
 *   categories 分类    keyPath: id
 *   settings   设置    keyPath: key  （key-value 行）
 */

import { seedIfEmpty } from './seed'

const DB_NAME = 'jizhang'
const DB_VERSION = 1

let _db = null

/** 打开数据库（单例），首次创建/版本升级时建表建索引 */
export function open() {
  if (_db) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('records')) {
        const r = db.createObjectStore('records', { keyPath: 'id' })
        r.createIndex('date', 'date', { unique: false })
        r.createIndex('categoryId', 'categoryId', { unique: false })
      }
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' })
      }
    }
    req.onsuccess = () => {
      _db = req.result
      resolve(_db)
    }
    req.onerror = () => reject(req.error)
  })
}

/** IDBRequest → Promise */
export function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** 开一个事务并等待完成；fn 返回的最后一个 request 的 result 作为结果 */
export function tx(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode)
        const s = t.objectStore(store)
        const out = fn(s)
        t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out)
        t.onerror = () => reject(t.error)
        t.onabort = () => reject(t.error)
      }),
  )
}

/* ---------- 通用原语（repository 层使用） ---------- */

export async function putOne(store, value) {
  await tx(store, 'readwrite', (s) => s.put(value))
  return value
}

export async function getOne(store, key) {
  const db = await open()
  return wrap(db.transaction(store).objectStore(store).get(key))
}

export async function getAll(store) {
  const db = await open()
  return wrap(db.transaction(store).objectStore(store).getAll())
}

export async function deleteOne(store, key) {
  await tx(store, 'readwrite', (s) => s.delete(key))
}

export async function countByIndex(store, indexName, key) {
  const db = await open()
  return wrap(db.transaction(store).objectStore(store).index(indexName).count(key))
}

/** 生成 uuid（同步主键） */
export function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/* ---------- 初始化 ---------- */

/** 应用启动入口：打开数据库，并在首次启动时写入默认分类/默认设置 */
export async function initDB() {
  await open()
  await seedIfEmpty()
}
