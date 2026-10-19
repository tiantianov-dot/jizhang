/**
 * services/merge.js — 备份与同步共用的合并内核（纯函数，不碰 db / store / 网络）
 *
 * 规则（与 backup.js 既有语义一致）：
 * - 按 id 对齐；远端 updatedAt 严格更新才覆盖，同值跳过
 * - 缺 id / 非对象 / 重复 id 的行计入 rejected 并跳过，不中断整份导入
 * - 不修改入参，只返回待写入列表；写库由 repository 负责
 * 金额、日期等业务校验由调用方通过 isValid 注入 —— 本模块只认 id / updatedAt。
 */

/** 远端是否比本地新（缺失 updatedAt 视为 0） */
export function isNewer(remote, local) {
  return (remote?.updatedAt || 0) > (local?.updatedAt || 0)
}

/** 合并所需的最小结构校验：对象且 id 为非空字符串 */
function isMergeable(item) {
  return (
    !!item &&
    typeof item === 'object' &&
    !Array.isArray(item) &&
    typeof item.id === 'string' &&
    item.id.length > 0
  )
}

/**
 * @param {object[]} localList 本地快照
 * @param {object[]} remoteList 外部快照（备份文件 / 对端）
 * @param {(item: object) => boolean} [isValid] 额外业务校验（金额/日期等）
 * @returns {{ added: number, updated: number, skipped: number, rejected: number, puts: object[] }}
 */
export function mergeCollection(localList, remoteList, isValid = () => true) {
  const localById = new Map()
  for (const item of Array.isArray(localList) ? localList : []) {
    if (isMergeable(item)) localById.set(item.id, item)
  }

  const result = { added: 0, updated: 0, skipped: 0, rejected: 0, puts: [] }
  const seen = new Set()

  for (const item of Array.isArray(remoteList) ? remoteList : []) {
    if (!isMergeable(item) || !isValid(item) || seen.has(item.id)) {
      result.rejected++
      continue
    }
    seen.add(item.id)

    const old = localById.get(item.id)
    if (!old) {
      result.added++
      result.puts.push(item)
    } else if (isNewer(item, old)) {
      result.updated++
      result.puts.push(item)
    } else {
      result.skipped++
    }
  }

  return result
}

/** 账目合并：id 对齐 + updatedAt 新者胜 */
export function mergeRecords(localRecords, remoteRecords, options = {}) {
  return mergeCollection(localRecords, remoteRecords, options.isValid)
}

/** 分类合并：规则同账目 */
export function mergeCategories(localCategories, remoteCategories, options = {}) {
  return mergeCollection(localCategories, remoteCategories, options.isValid)
}
