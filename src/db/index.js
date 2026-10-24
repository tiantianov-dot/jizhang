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
import { migrateBuiltinIdentity } from './migrations'

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
      const db = req.result
      // 其它连接请求升级时主动让路，避免旧标签页阻塞迁移
      db.onversionchange = () => {
        db.close()
        if (_db === db) _db = null
      }
      _db = db
      resolve(_db)
    }
    req.onerror = () => reject(req.error)
  })
}

/** 关闭并置空连接（测试隔离 / 需要重新打开时使用） */
export async function close() {
  if (!_db) return
  const db = _db
  _db = null
  db.close()
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
        let out
        try {
          out = fn(s)
        } catch (err) {
          // 回调同步抛错时事务里已排队的请求会被提交，必须显式 abort 才能整体回滚
          try {
            t.abort()
          } catch {
            // 事务可能已自行 abort，忽略重复 abort 异常
          }
          reject(err)
          return
        }
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

/**
 * 多 store 原子写：同一个 readwrite 事务内同步排队全部 put/delete。
 * 回调不穿插 await；任一 request 失败或同步抛错都显式 abort，只有 oncomplete 才成功。
 *
 * @param {{puts?: Object<string, object[]>, deletes?: Object<string, IDBValidKey[]>}} plan
 */
export function atomicWrite(plan = {}) {
  const puts = plan.puts || {}
  const deletes = plan.deletes || {}
  const names = new Set()
  for (const [store, rows] of Object.entries(puts)) {
    if (Array.isArray(rows) && rows.length) names.add(store)
  }
  for (const [store, keys] of Object.entries(deletes)) {
    if (Array.isArray(keys) && keys.length) names.add(store)
  }
  if (!names.size) return Promise.resolve()

  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction([...names], 'readwrite')
        let settled = false
        const fail = (err) => {
          if (settled) return
          settled = true
          try {
            t.abort()
          } catch {
            // 事务可能已自行 abort，忽略重复 abort 异常
          }
          reject(err)
        }

        t.oncomplete = () => {
          if (settled) return
          settled = true
          resolve()
        }
        t.onerror = () => {
          if (settled) return
          settled = true
          reject(t.error)
        }
        t.onabort = () => {
          if (settled) return
          settled = true
          reject(t.error || new Error('transaction aborted'))
        }

        try {
          for (const [store, rows] of Object.entries(puts)) {
            if (!Array.isArray(rows) || rows.length === 0) continue
            const objectStore = t.objectStore(store)
            for (const row of rows) objectStore.put(row)
          }
          for (const [store, keys] of Object.entries(deletes)) {
            if (!Array.isArray(keys) || keys.length === 0) continue
            const objectStore = t.objectStore(store)
            for (const key of keys) objectStore.delete(key)
          }
        } catch (err) {
          fail(err)
        }
      }),
  )
}

export async function countByIndex(store, indexName, key) {
  const db = await open()
  return wrap(db.transaction(store).objectStore(store).index(indexName).count(key))
}

/** 生成 uuid（同步主键）；HTTPS/PWA 环境必有 crypto.randomUUID，不做降级以免多写者撞 id */
export function uuid() {
  return crypto.randomUUID()
}

/* ---------- 初始化 ---------- */

/** 应用启动入口：打开数据库，首次播种，再执行一次性内置身份迁移 */
export async function initDB() {
  await open()
  await seedIfEmpty()
  await migrateBuiltinIdentity()
}
