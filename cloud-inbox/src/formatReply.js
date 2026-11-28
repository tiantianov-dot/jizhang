export const REPLY_EMPTY_TEXT = '⚠️ 未提供有效文字内容，未记账'
export const REPLY_NO_AMOUNT = '⚠️ 未识别到有效金额，未记账'
export const REPLY_AI_UNAVAILABLE = '⚠️ AI 解析暂时不可用，请稍后重试'
export const REPLY_PAYLOAD_TOO_LARGE = '⚠️ 提交内容过长，未记账'

/**
 * 格式化 POST /ingest 成功的简短中文通知文本，适配 iOS「显示通知」。
 * @param {{ type: 'expense'|'income', amount: number, categoryName: string, note?: string }} entry
 * @returns {string}
 */
export function formatIngestSuccess(entry) {
  const sign = entry.type === 'income' ? '+' : '-'
  const amountText = Number(entry.amount).toFixed(2)
  const note = typeof entry.note === 'string' ? entry.note.trim() : ''
  const suffix = note ? `（${note}）` : ''
  return `✅ 已暂存：${entry.categoryName} ${sign}¥${amountText}${suffix}`
}
