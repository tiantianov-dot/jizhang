/**
 * services/backupValidation.js — 备份版本 / 结构 / 字段校验与确定性 normalize
 *
 * 只接受普通对象、app === 'jizhang'、version 1 或 2。
 * 整份文件先校验再规划；任何结构性错误都由调用方零写入拒绝。
 * normalize 禁止 Date.now：同一文件反复导入必须得到同一结果。
 */

import { getBuiltinById, isBuiltinId } from './builtinCategories'

export const BACKUP_APP = 'jizhang'
export const SUPPORTED_BACKUP_VERSIONS = Object.freeze([1, 2])

/** 可导出/可导入的 settings 键（fail-closed） */
export const EXPORTABLE_SETTING_KEYS = Object.freeze([
  'monthlyBudget',
  'ownerName',
  'uiGlassIntensity',
  'uiGlassFill',
  'backupReminderDays',
  'backupReminderEnabled',
])

const REMINDER_DAY_VALUES = [3, 7, 14, 30]

const EXPORTABLE_SETTING_KEY_SET = new Set(EXPORTABLE_SETTING_KEYS)

/** 仅本机状态，即使恶意出现在文件里也必须忽略 */
export const LOCAL_ONLY_SETTING_KEYS = Object.freeze([
  'lastBackupAt',
  'syncConfig',
  'builtinIdentityVersion',
  'seedVersion',
])

export class ImportValidationError extends Error {
  constructor(errors) {
    const first = errors?.[0]?.message || '未知错误'
    super(`备份校验失败：${errors?.length || 0} 项（${first}）`)
    this.name = 'ImportValidationError'
    this.errors = errors || []
  }
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0
}

function isFiniteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isSafeNonNegativeInt(value) {
  return Number.isSafeInteger(value) && value >= 0
}

export function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

function error(code, path, message) {
  return { code, path, message }
}

function timePair(raw, path, errors) {
  const createdAt = raw.createdAt === undefined ? (raw.updatedAt ?? 0) : raw.createdAt
  const updatedAt = raw.updatedAt === undefined ? (raw.createdAt ?? 0) : raw.updatedAt
  let ok = true
  if (!isFiniteNonNegative(createdAt)) {
    errors.push(error('INVALID_TIMESTAMP', `${path}.createdAt`, 'createdAt 必须是非负有限数'))
    ok = false
  }
  if (!isFiniteNonNegative(updatedAt)) {
    errors.push(error('INVALID_TIMESTAMP', `${path}.updatedAt`, 'updatedAt 必须是非负有限数'))
    ok = false
  }
  return { createdAt, updatedAt, ok }
}

function normalizeRecord(raw, index, errors) {
  const path = `records[${index}]`
  if (!isPlainObject(raw)) {
    errors.push(error('INVALID_RECORD', path, '账目必须是对象'))
    return null
  }
  let ok = true
  if (!isNonEmptyString(raw.id)) {
    errors.push(error('INVALID_RECORD', `${path}.id`, '账目 id 必须是非空字符串'))
    ok = false
  }
  if (!Number.isSafeInteger(raw.amount) || raw.amount <= 0) {
    errors.push(error('INVALID_RECORD', `${path}.amount`, '金额必须是正整数分'))
    ok = false
  }
  if (raw.type !== 'expense' && raw.type !== 'income') {
    errors.push(error('INVALID_RECORD', `${path}.type`, 'type 必须是 expense 或 income'))
    ok = false
  }
  if (!isNonEmptyString(raw.categoryId)) {
    errors.push(error('INVALID_RECORD', `${path}.categoryId`, 'categoryId 必须是非空字符串'))
    ok = false
  }
  if (!isValidDateString(raw.date)) {
    errors.push(error('INVALID_RECORD', `${path}.date`, 'date 必须是真实的 YYYY-MM-DD'))
    ok = false
  }
  if (raw.note !== undefined && typeof raw.note !== 'string') {
    errors.push(error('INVALID_RECORD', `${path}.note`, 'note 必须是字符串'))
    ok = false
  }
  const deleted = raw.deleted === undefined ? false : raw.deleted
  if (typeof deleted !== 'boolean') {
    errors.push(error('INVALID_RECORD', `${path}.deleted`, 'deleted 必须是布尔值'))
    ok = false
  }
  const deletedAt = raw.deletedAt === undefined || raw.deletedAt === null ? null : raw.deletedAt
  if (deletedAt !== null && !isFiniteNonNegative(deletedAt)) {
    errors.push(error('INVALID_RECORD', `${path}.deletedAt`, 'deletedAt 必须是非负有限数或 null'))
    ok = false
  }
  const isPrivate = raw.private === undefined ? false : raw.private
  if (typeof isPrivate !== 'boolean') {
    errors.push(error('INVALID_RECORD', `${path}.private`, 'private 必须是布尔值'))
    ok = false
  }
  const owner = raw.owner === undefined ? 'me' : raw.owner
  if (!isNonEmptyString(owner)) {
    errors.push(error('INVALID_RECORD', `${path}.owner`, 'owner 必须是非空字符串'))
    ok = false
  }
  const times = timePair(raw, path, errors)
  if (!times.ok) ok = false
  if (!ok) return null

  return {
    id: raw.id,
    amount: raw.amount,
    type: raw.type,
    categoryId: raw.categoryId,
    note: raw.note ?? '',
    date: raw.date,
    createdAt: times.createdAt,
    updatedAt: times.updatedAt,
    deleted,
    deletedAt,
    private: isPrivate,
    owner,
  }
}

function normalizeCategory(raw, index, errors) {
  const path = `categories[${index}]`
  if (!isPlainObject(raw)) {
    errors.push(error('INVALID_CATEGORY', path, '分类必须是对象'))
    return null
  }
  let ok = true
  if (!isNonEmptyString(raw.id)) {
    errors.push(error('INVALID_CATEGORY', `${path}.id`, '分类 id 必须是非空字符串'))
    ok = false
  }
  if (!isNonEmptyString(raw.name)) {
    errors.push(error('INVALID_CATEGORY', `${path}.name`, '分类名称必须是非空字符串'))
    ok = false
  }
  if (raw.type !== 'expense' && raw.type !== 'income') {
    errors.push(error('INVALID_CATEGORY', `${path}.type`, 'type 必须是 expense 或 income'))
    ok = false
  }
  if (isBuiltinId(raw.id)) {
    const canonical = getBuiltinById(raw.id)
    if (!canonical) {
      errors.push(error('UNKNOWN_BUILTIN_ID', `${path}.id`, `未知的内置分类 ID：${raw.id}`))
      ok = false
    } else if (canonical.type !== raw.type) {
      errors.push(
        error(
          'BUILTIN_TYPE_MISMATCH',
          `${path}.type`,
          `内置分类 ${raw.id} 的收支类型必须为 ${canonical.type}`,
        ),
      )
      ok = false
    }
  }
  if (raw.emoji !== undefined && typeof raw.emoji !== 'string') {
    errors.push(error('INVALID_CATEGORY', `${path}.emoji`, 'emoji 必须是字符串'))
    ok = false
  }
  if (raw.color !== undefined && typeof raw.color !== 'string') {
    errors.push(error('INVALID_CATEGORY', `${path}.color`, 'color 必须是字符串'))
    ok = false
  }
  const monthlyBudget = raw.monthlyBudget === undefined ? 0 : raw.monthlyBudget
  if (!isSafeNonNegativeInt(monthlyBudget)) {
    errors.push(error('INVALID_CATEGORY', `${path}.monthlyBudget`, '月预算必须是非负整数分'))
    ok = false
  }
  const order = raw.order === undefined ? 999 : raw.order
  if (!isSafeNonNegativeInt(order)) {
    errors.push(error('INVALID_CATEGORY', `${path}.order`, 'order 必须是非负整数'))
    ok = false
  }
  const archived = raw.archived === undefined ? false : raw.archived
  if (typeof archived !== 'boolean') {
    errors.push(error('INVALID_CATEGORY', `${path}.archived`, 'archived 必须是布尔值'))
    ok = false
  }
  const lastUsedAt = raw.lastUsedAt === undefined ? 0 : raw.lastUsedAt
  if (!isFiniteNonNegative(lastUsedAt)) {
    errors.push(error('INVALID_CATEGORY', `${path}.lastUsedAt`, 'lastUsedAt 必须是非负有限数'))
    ok = false
  }
  const times = timePair(raw, path, errors)
  if (!times.ok) ok = false
  if (!ok) return null

  return {
    id: raw.id,
    name: raw.name,
    emoji: raw.emoji ?? '📦',
    color: raw.color ?? '#5F5E5A',
    type: raw.type,
    monthlyBudget,
    order,
    archived,
    lastUsedAt,
    createdAt: times.createdAt,
    updatedAt: times.updatedAt,
  }
}

function normalizeSetting(raw, index, errors) {
  const path = `settings[${index}]`
  if (!isPlainObject(raw)) {
    errors.push(error('INVALID_SETTING', path, '设置行必须是对象'))
    return null
  }
  let ok = true
  if (!isNonEmptyString(raw.key)) {
    errors.push(error('INVALID_SETTING', `${path}.key`, '设置 key 必须是非空字符串'))
    ok = false
  }
  if (!Object.prototype.hasOwnProperty.call(raw, 'value')) {
    errors.push(error('INVALID_SETTING', `${path}.value`, '设置行缺少 value'))
    ok = false
  }
  const updatedAt = raw.updatedAt === undefined ? 0 : raw.updatedAt
  if (!isFiniteNonNegative(updatedAt)) {
    errors.push(error('INVALID_SETTING', `${path}.updatedAt`, 'updatedAt 必须是非负有限数'))
    ok = false
  }
  if (EXPORTABLE_SETTING_KEY_SET.has(raw.key)) {
    if (raw.key === 'monthlyBudget' && !isSafeNonNegativeInt(raw.value)) {
      errors.push(error('INVALID_SETTING', `${path}.value`, 'monthlyBudget 必须是非负整数分'))
      ok = false
    }
    if (raw.key === 'ownerName' && typeof raw.value !== 'string') {
      errors.push(error('INVALID_SETTING', `${path}.value`, 'ownerName 必须是字符串'))
      ok = false
    }
    if (raw.key === 'uiGlassIntensity' || raw.key === 'uiGlassFill') {
      if (!isFiniteNonNegative(raw.value)) {
        errors.push(error('INVALID_SETTING', `${path}.value`, `${raw.key} 必须是非负有限数`))
        ok = false
      }
    }
    if (raw.key === 'backupReminderDays' && !REMINDER_DAY_VALUES.includes(raw.value)) {
      errors.push(
        error('INVALID_SETTING', `${path}.value`, 'backupReminderDays 只能是 3 / 7 / 14 / 30'),
      )
      ok = false
    }
    if (raw.key === 'backupReminderEnabled' && typeof raw.value !== 'boolean') {
      errors.push(error('INVALID_SETTING', `${path}.value`, 'backupReminderEnabled 必须是布尔值'))
      ok = false
    }
  }
  if (!ok) return null
  return { key: raw.key, value: raw.value, updatedAt }
}

function checkDuplicateIds(list, path, errors) {
  const seen = new Set()
  list.forEach((raw, index) => {
    if (!isPlainObject(raw) || !isNonEmptyString(raw.id)) return
    if (seen.has(raw.id)) {
      errors.push(error('DUPLICATE_ID', `${path}[${index}].id`, `重复的 id：${raw.id}`))
    }
    seen.add(raw.id)
  })
}

function checkDuplicateSettingKeys(list, errors) {
  const seen = new Set()
  list.forEach((raw, index) => {
    if (!isPlainObject(raw) || !isNonEmptyString(raw.key)) return
    if (seen.has(raw.key)) {
      errors.push(
        error('DUPLICATE_SETTING_KEY', `settings[${index}].key`, `重复的设置 key：${raw.key}`),
      )
    }
    seen.add(raw.key)
  })
}

/**
 * @param {unknown} payload 备份文件 JSON
 * @returns {{version:number, records:object[], categories:object[], settings:object[], errors:object[]}}
 */
export function normalizeBackup(payload) {
  const errors = []
  const empty = (version = 0) => ({ version, records: [], categories: [], settings: [], errors })

  if (!isPlainObject(payload)) {
    errors.push(error('INVALID_ROOT', '', '备份必须是 JSON 对象'))
    return empty()
  }
  if (payload.app !== BACKUP_APP) {
    errors.push(error('WRONG_APP', 'app', '不是本应用的备份文件'))
  }
  if (!SUPPORTED_BACKUP_VERSIONS.includes(payload.version)) {
    errors.push(
      error('UNSUPPORTED_VERSION', 'version', `不支持的备份版本：${String(payload.version)}`),
    )
  }
  for (const key of ['records', 'categories', 'settings']) {
    if (!Array.isArray(payload[key])) {
      errors.push(error('MISSING_COLLECTION', key, `${key} 必须是数组`))
    }
  }
  if (errors.length) return empty(Number.isInteger(payload.version) ? payload.version : 0)

  checkDuplicateIds(payload.records, 'records', errors)
  checkDuplicateIds(payload.categories, 'categories', errors)
  checkDuplicateSettingKeys(payload.settings, errors)

  const records = []
  payload.records.forEach((raw, index) => {
    const item = normalizeRecord(raw, index, errors)
    if (item) records.push(item)
  })
  const categories = []
  payload.categories.forEach((raw, index) => {
    const item = normalizeCategory(raw, index, errors)
    if (item) categories.push(item)
  })
  const settings = []
  payload.settings.forEach((raw, index) => {
    const item = normalizeSetting(raw, index, errors)
    if (item) settings.push(item)
  })

  return { version: payload.version, records, categories, settings, errors }
}
