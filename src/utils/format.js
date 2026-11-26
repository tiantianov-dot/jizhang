/**
 * utils/format.js — 全局统一的金额 / 日期格式化（纯函数，无副作用）
 *
 * 约定：金额一律以「分」为整数最小单位流转与存储，禁止浮点参与金额计算；
 * 显示一律经由本模块，保证全局格式统一（¥ 前缀、两位小数、YYYY-MM-DD）。
 */

/** 元（字符串或数字）→ 分（整数）。入参如 "12.3" / "0.05" / 8 */
export function toFen(yuan) {
  return Math.round(Number(yuan) * 100)
}

/** 分 → 两位小数字符串，如 3550 → "35.50" */
export function fenToYuan(fen) {
  return (Number(fen || 0) / 100).toFixed(2)
}

/** 分 → 带人民币符号的显示串，如 3550 → "¥35.50" */
export function fmtFen(fen) {
  return `¥${fenToYuan(fen)}`
}

/** 分 → 金额输入框预填串：去掉无意义的尾随 0 与小数点（3550 → "35.5"，3500 → "35"） */
export function fenToInput(fen) {
  const s = fenToYuan(fen)
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

/** 今天 YYYY-MM-DD（本地时区） */
export function todayStr() {
  const d = new Date()
  return toDateStr(d)
}

/** Date → YYYY-MM-DD（本地时区） */
export function toDateStr(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** 当前月份 YYYY-MM（本地时区） */
export function thisMonthStr() {
  return todayStr().slice(0, 7)
}

/** 当前时刻 → 文件名友好的时间戳：YYYYMMDD-HHmm（本地时区，如 20261006-1905） */
export function stampNow() {
  const d = new Date()
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

/**
 * 日历日差（本地时区）：今天减去 iso 时刻的整天数。
 * 按「日历日」而不是毫秒差除 86400000——后者在跨夏令时/时区场景会差 1 天。
 * 用于备份提醒的天粒度显示。
 */
export function daysSince(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const toDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  return Math.round((toDay(new Date()) - toDay(d)) / 86400000)
}

/** ISO 时间串 → 本地 YYYY-MM-DD HH:mm；空值或无法解析返回空串 */
export function formatLocalDateTime(iso) {
  if (!iso) return ''
  const t = iso instanceof Date ? iso.getTime() : typeof iso === 'string' ? Date.parse(iso) : NaN
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  const p = (x) => String(x).padStart(2, '0')
  return `${toDateStr(d)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 金额输入缓冲串 → 头卡展示的两位小数串（空串 / "." → "0.00"，如 "12.3" → "12.30"） */
export function formatAmountBuffer(buffer) {
  if (!buffer || buffer === '.') return '0.00'
  return fenToYuan(toFen(buffer))
}

/** 头卡副行：今天 / M月D日，有非空备注时用「 · 」连接 */
export function formatRecordSubline(date, note = '', today = todayStr()) {
  const rawDate = typeof date === 'string' ? date : ''
  const day = rawDate && rawDate === today ? '今天' : ''
  const parts = rawDate.split('-')
  const m = parts.length === 3 && parts[1] ? Number(parts[1]) : NaN
  const d = parts.length === 3 && parts[2] ? Number(parts[2]) : NaN
  const label =
    day || (Number.isInteger(m) && m > 0 && Number.isInteger(d) && d > 0 ? `${m}月${d}日` : '')
  const n = typeof note === 'string' ? note.trim() : ''
  return n ? [label, n].filter(Boolean).join(' · ') : label
}

/**
 * 金额键盘单次按键转移（纯函数，供 AmountPad 复用）：
 * - 'back'：退格删除末尾字符
 * - '.'：空串变 "0."，已有小数点则忽略
 * - '0'–'9'：限制整数位最多 7 位、小数位最多 2 位
 * - 其余非法键一律忽略，原样返回
 */
export function applyAmountKey(buffer, key) {
  const cur = typeof buffer === 'string' ? buffer : ''
  if (key === 'back') return cur.slice(0, -1)
  if (key === '.') {
    if (!cur) return '0.'
    return cur.includes('.') ? cur : `${cur}.`
  }
  if (typeof key !== 'string' || !/^[0-9]$/.test(key)) return cur
  const [int, dec] = cur.split('.')
  if (dec !== undefined && dec.length >= 2) return cur
  if (int && int.length >= 7) return cur
  return cur + key
}
