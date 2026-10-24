/**
 * services/backupSummary.js — 从备份 payload 的 records 数组计算展示计数
 *
 * active：未软删除（有效）记录
 * deleted：回收站记录（deleted === true）
 * private：本机标记记录（private === true，可能同时已删除）
 * total：数组总长度（= active + deleted）
 */

export function summarizeBackup(records) {
  const list = Array.isArray(records) ? records : []
  let deleted = 0
  let privateCount = 0
  for (const rec of list) {
    if (rec && rec.deleted === true) deleted += 1
    if (rec && rec.private === true) privateCount += 1
  }
  return {
    active: list.length - deleted,
    deleted,
    private: privateCount,
    total: list.length,
  }
}
