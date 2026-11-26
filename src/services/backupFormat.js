/**
 * services/backupFormat.js — 备份状态、轻提醒、导入错误与结果摘要纯格式化函数
 *
 * 严守本机标记中性文案边界：不暗示加密、锁、密码保护或不存在的同步。
 */

/**
 * 设置页备份健康度三态展示文案
 * @param {{ status: 'never'|'stale'|'ok'|'unknown', ageDays?: number|null, reminderDays?: number }} params
 * @returns {string}
 */
export function formatBackupStatusText({ status, ageDays, reminderDays }) {
  if (status === 'never') return '尚未备份'
  if (status === 'stale') {
    return `已 ${ageDays} 天未备份（周期 ${reminderDays} 天）`
  }
  if (status === 'ok') {
    return ageDays === 0 ? '上次备份：今天' : `上次备份：${ageDays} 天前`
  }
  return '上次备份时间无法识别，建议重新导出'
}

/**
 * 记一笔页轻提醒文案（只在 status !== 'ok' 时展示）
 * @param {{ status: 'never'|'stale'|'ok'|'unknown', ageDays?: number|null }} params
 * @returns {string}
 */
export function formatBackupReminderText({ status, ageDays }) {
  if (status === 'never') return '尚未备份，清缓存或换设备会丢账'
  if (status === 'stale') return `已 ${ageDays} 天未备份`
  return '上次备份时间无法识别，建议重新导出'
}

/**
 * 格式化导入校验错误列表：最多展示前 3 条，超出附总项数
 * @param {Array<{ message: string }>} errors
 * @returns {string}
 */
export function describeImportErrors(errors) {
  const list = Array.isArray(errors) ? errors : []
  const messages = list.slice(0, 3).map((item) => item.message)
  const suffix = list.length > 3 ? `（共 ${list.length} 项）` : ''
  return `${messages.join('；')}${suffix}`
}

/**
 * 格式化导入完成后的主计数摘要
 * @param {{ records: object, categories: object, settings: object }} summary
 * @returns {string}
 */
export function formatImportSummary(summary) {
  const r = summary.records
  const c = summary.categories
  const s = summary.settings
  return [
    `账目 新增 ${r.added} · 更新 ${r.updated} · 跳过 ${r.skipped}`,
    `分类 新增 ${c.added} · 匹配 ${c.matched} · 更新 ${c.updated} · 跳过 ${c.skipped} · 冲突 ${c.conflicts}`,
    `设置 更新 ${s.updated} · 跳过 ${s.skipped}`,
  ].join('；')
}
