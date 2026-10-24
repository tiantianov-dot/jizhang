/**
 * services/backupExport.js — 导出成功节点的纯决策
 *
 * share resolved 只代表“已交给系统分享”，可记录备份时间；
 * AbortError = 用户取消，其他 share 错误 = 分享失败，都不记录。
 * download 的 a.click() 不能证明文件已保存，必须由用户显式确认。
 */

/** @param {unknown} error @returns {'saved'|'cancelled'|'failed'} */
export function classifyShareOutcome(error) {
  if (!error) return 'saved'
  if (error && typeof error === 'object' && error.name === 'AbortError') return 'cancelled'
  return 'failed'
}

/**
 * @param {{method: 'share'|'download', outcome?: 'saved'|'cancelled'|'failed', confirmed?: boolean}} params
 * @returns {boolean} 是否应写 lastBackupAt
 */
export function shouldPersistBackup({ method, outcome, confirmed = false }) {
  if (method === 'share') return outcome === 'saved'
  if (method === 'download') return confirmed === true
  return false
}
