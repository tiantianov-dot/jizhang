/**
 * services/importPlanner.js — 备份导入的纯规划层
 *
 * 输入：备份 payload + 本地三集合快照
 * 输出：一次原子写入所需的 puts、分类 ID 映射、summary、errors
 *
 * 顺序固定：校验 → normalize → 分类映射 → 账目引用改写 → settings LWW。
 * 任何错误都在返回前汇总；调用方看到 errors 时必须零写入。
 * 本模块不碰 db / store / 网络，也不调用 Date.now（重复导入必须稳定）。
 */

import { EXPORTABLE_SETTING_KEYS, ImportValidationError, normalizeBackup } from './backupValidation'
import { fingerprintOf, getBuiltinByFingerprint, isBuiltinId } from './builtinCategories'

const EXPORTABLE_SETTING_KEY_SET = new Set(EXPORTABLE_SETTING_KEYS)

/** 更新已有账目时允许覆盖的字段；id 不在此列，categoryId 单独改写 */
const RECORD_IMPORT_FIELDS = [
  'amount',
  'type',
  'categoryId',
  'note',
  'date',
  'createdAt',
  'updatedAt',
  'deleted',
  'deletedAt',
  'private',
  'owner',
]

/** 更新已有分类时的字段；lastUsedAt/createdAt 属本地状态，不因导入改变 */
const CATEGORY_IMPORT_FIELDS = [
  'name',
  'emoji',
  'color',
  'type',
  'monthlyBudget',
  'order',
  'archived',
  'updatedAt',
]

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(object, key) {
  return !!object && Object.prototype.hasOwnProperty.call(object, key)
}

function error(code, path, message) {
  return { code, path, message }
}

function emptyWrites() {
  return { records: [], categories: [], settings: [] }
}

function emptySummary() {
  return {
    records: { added: 0, updated: 0, skipped: 0, softDeleted: { added: 0, updated: 0 } },
    categories: { added: 0, matched: 0, updated: 0, skipped: 0, conflicts: 0 },
    settings: { updated: 0, skipped: 0 },
    conflicts: [],
  }
}

function fail(errors, categoryMap = new Map()) {
  return { writes: emptyWrites(), categoryMap, summary: emptySummary(), errors }
}

function mergeRecordForUpdate(local, incoming, raw) {
  const out = { ...local }
  for (const key of RECORD_IMPORT_FIELDS) {
    if (raw && !hasOwn(raw, key)) continue
    out[key] = incoming[key]
  }
  out.id = local.id
  out.categoryId = incoming.categoryId
  return out
}

function mergeCategoryForUpdate(local, incoming, raw) {
  const out = { ...local }
  for (const key of CATEGORY_IMPORT_FIELDS) {
    if (raw && !hasOwn(raw, key)) continue
    out[key] = incoming[key]
  }
  out.id = local.id
  return out
}

/**
 * @param {unknown} payload 备份文件
 * @param {{localRecords?: object[], localCategories?: object[], localSettings?: object[]}} local
 * @returns {{writes: {records: object[], categories: object[], settings: object[]}, categoryMap: Map<string,string>, summary: object, errors: object[]}}
 */
export function planImport(payload, local = {}) {
  const localRecords = Array.isArray(local.localRecords) ? local.localRecords : []
  const localCategories = Array.isArray(local.localCategories) ? local.localCategories : []
  const localSettings = Array.isArray(local.localSettings) ? local.localSettings : []

  const normalized = normalizeBackup(payload)
  if (normalized.errors.length) return fail(normalized.errors)

  const localCatById = new Map(localCategories.filter((c) => c?.id).map((c) => [c.id, c]))
  const localRecById = new Map(localRecords.filter((r) => r?.id).map((r) => [r.id, r]))
  const localSettingByKey = new Map(localSettings.filter((s) => s?.key).map((s) => [s.key, s]))

  const rawCategories = Array.isArray(payload.categories) ? payload.categories : []
  const rawRecords = Array.isArray(payload.records) ? payload.records : []
  const rawCategoryById = new Map(
    rawCategories.filter((c) => isPlainObject(c) && typeof c.id === 'string').map((c) => [c.id, c]),
  )
  const rawRecordById = new Map(
    rawRecords.filter((r) => isPlainObject(r) && typeof r.id === 'string').map((r) => [r.id, r]),
  )

  const incomingCategories = normalized.categories
  const categoryMap = new Map()
  const categoryErrors = []

  // 1) 默认映射：每个备份分类先对齐自己的 id；同 id 类型冲突是整文件错误
  for (const cat of incomingCategories) {
    categoryMap.set(cat.id, cat.id)
    const local = localCatById.get(cat.id)
    if (local && local.type !== cat.type) {
      categoryErrors.push(
        error('CATEGORY_ID_CONFLICT', `categories.${cat.id}`, '同 ID 分类的收支类型与本地不一致'),
      )
    }
  }
  if (categoryErrors.length) return fail(categoryErrors, categoryMap)

  // 2) 旧 v1 默认分类：只有完整指纹命中且候选唯一时才映射到内置身份
  const summary = emptySummary()
  const legacyMatches = new Map()
  const claimedTargets = new Map()
  for (const cat of incomingCategories) {
    if (isBuiltinId(cat.id)) claimedTargets.set(cat.id, cat.id)
  }

  if (normalized.version === 1) {
    for (const cat of incomingCategories) {
      if (isBuiltinId(cat.id)) continue
      if (localCatById.has(cat.id)) continue // 同 ID 已对齐，交给 LWW

      const canonical = getBuiltinByFingerprint(cat)
      if (!canonical) continue

      const localCanonical = localCatById.get(canonical.id)
      if (localCanonical && localCanonical.type !== canonical.type) {
        summary.conflicts.push({
          kind: 'category',
          id: cat.id,
          reason: '本地内置分类类型异常，保留为自定义',
        })
        continue
      }

      let target
      if (localCanonical) {
        target = canonical.id
      } else {
        const candidates = localCategories.filter(
          (item) =>
            item &&
            !isBuiltinId(item.id) &&
            item.id !== cat.id &&
            fingerprintOf(item) === fingerprintOf(canonical),
        )
        if (candidates.length === 1) target = candidates[0].id
        else if (candidates.length === 0) target = canonical.id
        else {
          summary.conflicts.push({
            kind: 'category',
            id: cat.id,
            reason: `本地有 ${candidates.length} 个同指纹分类，歧义保留为自定义`,
          })
          continue
        }
      }

      const claimedBy = claimedTargets.get(target)
      if (claimedBy && claimedBy !== cat.id) {
        summary.conflicts.push({
          kind: 'category',
          id: cat.id,
          reason: '多个备份分类映射到同一内置分类，后到者保留为自定义',
        })
        continue
      }
      claimedTargets.set(target, cat.id)
      categoryMap.set(cat.id, target)
      legacyMatches.set(cat.id, target)
    }
  }

  // 3) 分类写入：新增 / 匹配 / LWW 更新 / 跳过
  const categoryWrites = []
  const targetTypeById = new Map(localCategories.filter((c) => c?.id).map((c) => [c.id, c.type]))

  for (const cat of incomingCategories) {
    const target = categoryMap.get(cat.id)
    if (!target) continue
    const local = localCatById.get(target)

    if (!local) {
      const value = { ...cat, id: target }
      categoryWrites.push(value)
      targetTypeById.set(target, value.type)
      summary.categories.added += 1
      continue
    }

    if (legacyMatches.has(cat.id) && target !== cat.id) {
      // 旧默认项匹配到已存在的本地身份：不清洗本地分类字段
      targetTypeById.set(target, local.type)
      summary.categories.matched += 1
      continue
    }

    if (cat.updatedAt > (local.updatedAt || 0)) {
      const value = mergeCategoryForUpdate(local, cat, rawCategoryById.get(cat.id))
      categoryWrites.push(value)
      targetTypeById.set(target, value.type)
      summary.categories.updated += 1
    } else {
      summary.categories.skipped += 1
    }
  }

  // 4) 账目：categoryId 改写后再做 id + updatedAt 的 LWW；引用必须可解析且类型一致
  const recordWrites = []
  const referenceErrors = []
  for (const rec of normalized.records) {
    const mapped = categoryMap.get(rec.categoryId)
    const target = mapped ?? (localCatById.has(rec.categoryId) ? rec.categoryId : null)
    if (!target) {
      referenceErrors.push(
        error('DANGLING_CATEGORY', `records.${rec.id}.categoryId`, '账目引用的分类不存在'),
      )
      continue
    }
    const targetType = targetTypeById.get(target)
    if (!targetType) {
      referenceErrors.push(
        error('DANGLING_CATEGORY', `records.${rec.id}.categoryId`, '账目引用的分类不存在'),
      )
      continue
    }
    if (targetType !== rec.type) {
      referenceErrors.push(
        error('CATEGORY_TYPE_MISMATCH', `records.${rec.id}.categoryId`, '账目收支类型与分类不一致'),
      )
      continue
    }

    const value = { ...rec, categoryId: target }
    const local = localRecById.get(rec.id)
    if (!local) {
      recordWrites.push(value)
      summary.records.added += 1
      if (value.deleted) summary.records.softDeleted.added += 1
    } else if (rec.updatedAt > (local.updatedAt || 0)) {
      const merged = mergeRecordForUpdate(local, value, rawRecordById.get(rec.id))
      recordWrites.push(merged)
      summary.records.updated += 1
      if (merged.deleted) summary.records.softDeleted.updated += 1
    } else {
      summary.records.skipped += 1
    }
  }

  if (referenceErrors.length) return fail(referenceErrors, categoryMap)

  // 5) settings：白名单 fail-closed + 逐 key 严格 LWW；本地独有键永不导入
  const settingWrites = []
  for (const row of normalized.settings) {
    if (!EXPORTABLE_SETTING_KEY_SET.has(row.key)) continue
    const local = localSettingByKey.get(row.key)
    if (!local || row.updatedAt > (local.updatedAt || 0)) {
      settingWrites.push(row)
      summary.settings.updated += 1
    } else {
      summary.settings.skipped += 1
    }
  }

  summary.categories.conflicts = summary.conflicts.length
  return {
    writes: { records: recordWrites, categories: categoryWrites, settings: settingWrites },
    categoryMap,
    summary,
    errors: [],
  }
}

export { ImportValidationError }
