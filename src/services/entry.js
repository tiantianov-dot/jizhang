/**
 * services/entry.js — 统一入口协议：把外部传入的「记账意图」规整成表单草稿
 *
 * 为什么需要这一层：iOS 快捷指令无法直接写 PWA 的 IndexedDB，它能做的只有两件事 ——
 * ① 打开一个带参数的 URL；② 把 JSON 写进剪贴板、再打开 PWA。本模块是这两条入口的
 * 「接收端」：把外部文本规整成与手动输入完全同构的草稿对象，AddView 只负责填进表单。
 *
 * 纯函数层：不 import Vue / Pinia / router，不碰 store、不碰 db。
 * 分类名 → categoryId 的映射必须留在组件层（只有那里有 store），本模块只解析出
 * 规范化的 categoryName。
 *
 * 后期接入 AI 解析（截图 OCR / 语音 / 短信）时，只要产出同样形状的草稿对象，
 * 消费者（AddView）无需任何改动 —— 这是把解析抽成纯函数层的原因。
 */
import { toFen, todayStr } from '@/utils/format'

/** 备注上限（与记一笔页备注输入框的 maxlength 一致） */
const NOTE_MAX = 30
/** 剪贴板 JSON 的应用标识：不是这个值一律拒收，避免误读普通剪贴板内容 */
const APP_ID = 'jizhang'
/** 日期必须是这个形状，再交给 Date 校验是否真实存在 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * 大小写不敏感地取键（外部工具拼参数时大小写不受控）。
 * 未识别到的键一律返回 undefined，由调用方忽略。
 */
function pick(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined
  const target = key.toLowerCase()
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === target) return obj[k]
  }
  return undefined
}

/**
 * 金额清洗：把外部工具（OCR 截图、听写、短信原文）带出来的杂字符剥掉。
 * 现实输入长这样 —— 「¥1,234.50」「35.50元」「￥ 12」「1 234.5」「34.5元整」，
 * 直接 Number() 全是 NaN，会让整条入口链路白给，所以先洗再转。
 * 只保留数字、小数点和负号；千分位逗号与空格一并去掉。
 * 注意：负号不去掉（用来识别退款/更正），清洗后仍由 normAmount 的 >0 判断兜底。
 */
function cleanAmount(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v ?? '').trim()
  if (!s) return null
  // 去掉货币符号、千分位逗号、空格、以及「元/块/圆」等中文单位后缀。
  // 注意两种「元」符号都要覆盖：半角 U+00A5（¥，多来自英文输入/接口）
  // 与全角 U+FFE5（￥，中文键盘打出来就是这个）—— 少一个就会漏洗。
  const stripped = s
    .replace(/[¥￥$€£]/g, '')
    .replace(/,/g, '')
    .replace(/\s/g, '')
    .replace(/[元块圆整钱]/g, '')
  // 只认「-(数字).(数字)」这种纯数字形态，避免把「10.5.3」这类脏串当金额
  const m = stripped.match(/^-?\d+(\.\d+)?$/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

/** 金额：「元」→「分」。非数字 / ≤0 / 空 → null（调用方据此忽略该字段） */
function normAmount(v) {
  if (v === undefined || v === null || v === '') return null
  const cleaned = cleanAmount(v)
  if (cleaned === null || cleaned <= 0) return null
  const fen = toFen(cleaned)
  return fen > 0 ? fen : null
}

/** 收支类型：只认 expense / income，其他一律 null（默认支出由调用方兜底） */
function normType(v) {
  const s = String(v ?? '')
    .trim()
    .toLowerCase()
  return s === 'expense' || s === 'income' ? s : null
}

/** 备注：trim 后截断到 30 字；空串视为未提供 */
function normNote(v) {
  if (v === undefined || v === null) return null
  return String(v).trim().slice(0, NOTE_MAX) || null
}

/** 日期：必须是真实存在的 YYYY-MM-DD（2026-13-99 这类必须被拒），否则 null */
function normDate(v) {
  const s = String(v ?? '').trim()
  if (!DATE_RE.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const real = dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
  return real ? s : null
}

/** 分类名：trim 后非空，否则视为未提供（名称 → id 由组件层完成） */
function normCategory(v) {
  const s = String(v ?? '').trim()
  return s || null
}

/** 自动入账：只认 1 / true（大小写不敏感），其余一律 false。误记风险由撤销 toast 兜底 */
function normAutosave(v) {
  const s = String(v ?? '').trim().toLowerCase()
  return s === '1' || s === 'true'
}

/**
 * 把任意来源的原始键值规整成草稿。两个入口（URL / 剪贴板）共用，不复制校验逻辑。
 * 字段级容错：不合法就把该字段标记为无效并回落到默认值，绝不抛错。
 * @typedef {object} EntryDraft
 * @property {number} amount 金额（分）；无效时为 0
 * @property {'expense'|'income'} type 无效时为 'expense'
 * @property {string} note 无效 / 未提供时为空串
 * @property {string} date 无效 / 未提供时为今天
 * @property {string} categoryName 无效 / 未提供时为空串
 * @property {boolean} autosave 是否自动入账（URL/JSON 带 autosave=1|true 时）
 *   金额无效时组件层不会自动入账，仍回落为手动
 * @property {{ amount: boolean, type: boolean, note: boolean, date: boolean, category: boolean }} valid
 *   各字段是否真的由入口提供（消费者据此决定要不要覆盖表单，全 false 表示这次入口白给）
 */
function normalize(raw) {
  const amount = normAmount(pick(raw, 'amount'))
  const type = normType(pick(raw, 'type'))
  const note = normNote(pick(raw, 'note'))
  const date = normDate(pick(raw, 'date'))
  const categoryName = normCategory(pick(raw, 'category'))

  return {
    amount: amount ?? 0,
    type: type ?? 'expense',
    note: note ?? '',
    date: date ?? todayStr(),
    categoryName: categoryName ?? '',
    autosave: normAutosave(pick(raw, 'autosave')),
    valid: {
      amount: amount !== null,
      type: type !== null,
      note: note !== null,
      date: date !== null,
      category: categoryName !== null,
    },
  }
}

/**
 * 解析 URL query（route.query 原样传入，未知键全部忽略）。
 * @param {Record<string, unknown>} query
 * @returns {EntryDraft} 恒返回草稿；全部字段无效时 valid 全为 false，调用方应完全不预填
 */
export function parseEntryQuery(query) {
  return normalize(query)
}

/**
 * 解析剪贴板 JSON。约定格式（字段全部可选，amount 单位为「元」）：
 *   { "app": "jizhang", "amount": 12.5, "type": "expense",
 *     "note": "午饭", "date": "2026-10-06", "category": "餐饮" }
 * @param {string} text 剪贴板原文
 * @returns {EntryDraft|null} 非法 JSON / 顶层不是对象 / app 不是 jizhang → null
 */
export function parseEntryJson(text) {
  if (typeof text !== 'string' || !text.trim()) return null
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  if (String(pick(data, 'app')).trim().toLowerCase() !== APP_ID) return null
  return normalize(data)
}
