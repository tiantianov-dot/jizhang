/**
 * services/builtinCategories.js — 内置分类的稳定身份（纯函数，不碰 db / UI）
 *
 * 内置分类使用保留命名空间 `builtin:<type>:<key>`，跨设备/清缓存后不变；
 * 自定义分类继续使用 uuid。默认身份由 canonical ID 派生，不额外存 isDefault 字段。
 *
 * 旧 v1 数据只有随机 UUID，只能靠完整指纹
 * `type + name + emoji + color + order` 全等且唯一来保守识别；
 * 改名/歧义/目标已存在时一律保留为自定义，不强并。
 */

export const BUILTIN_ID_PREFIX = 'builtin:'

/** 与旧 seed 的顺序（order）逐项一致；支出 11 项 + 收入 5 项 */
export const BUILTIN_CATEGORIES = Object.freeze(
  [
    ['expense', 'food', '餐饮', '🍚', '#D85A30'],
    ['expense', 'transport', '交通', '🚌', '#185FA5'],
    ['expense', 'shopping', '购物', '🛍️', '#993556'],
    ['expense', 'daily', '日用', '🧻', '#854F0B'],
    ['expense', 'housing', '居住', '🏠', '#534AB7'],
    ['expense', 'entertainment', '娱乐', '🎮', '#0F6E56'],
    ['expense', 'medical', '医疗', '💊', '#A32D2D'],
    ['expense', 'social', '社交', '🎁', '#D4537E'],
    ['expense', 'education', '学习', '📚', '#3B6D11'],
    ['expense', 'telecom', '通讯', '📱', '#378ADD'],
    ['expense', 'other', '其他', '📦', '#5F5E5A'],
    ['income', 'salary', '工资', '💰', '#0F6E56'],
    ['income', 'parttime', '兼职', '🧧', '#BA7517'],
    ['income', 'investment', '理财', '📈', '#993C1D'],
    ['income', 'redpacket', '红包', '🧧', '#E24B4A'],
    ['income', 'other', '其他', '📦', '#5F5E5A'],
  ].map(([type, key, name, emoji, color], order) =>
    Object.freeze({
      id: `${BUILTIN_ID_PREFIX}${type}:${key}`,
      key,
      type,
      name,
      emoji,
      color,
      order,
    }),
  ),
)

const BY_ID = new Map(BUILTIN_CATEGORIES.map((category) => [category.id, category]))

/** 指纹用不可见分隔符，避免字段内容拼接产生碰撞 */
export function fingerprintOf(category) {
  if (!category) return ''
  return [category.type, category.name, category.emoji, category.color, category.order].join(
    '\u0000',
  )
}

const BY_FINGERPRINT = new Map(
  BUILTIN_CATEGORIES.map((category) => [fingerprintOf(category), category]),
)

export function isBuiltinId(id) {
  return typeof id === 'string' && id.startsWith(BUILTIN_ID_PREFIX)
}

/** 只认已知 canonical ID；未知的 `builtin:` ID 返回 null（导入时必须拒绝） */
export function getBuiltinById(id) {
  return BY_ID.get(id) ?? null
}

/** 完整指纹命中才返回 canonical；不做名称/emoji 单字段匹配 */
export function getBuiltinByFingerprint(category) {
  const fingerprint = fingerprintOf(category)
  return fingerprint ? (BY_FINGERPRINT.get(fingerprint) ?? null) : null
}

/** 默认分类判定：ID 必须是已知 canonical，且 type 与 canonical 一致 */
export function isBuiltinCategory(category) {
  if (!category) return false
  const canonical = getBuiltinById(category.id)
  return !!canonical && canonical.type === category.type
}

/** 内置分类允许改名/改图标/改预算，但类型锁定 */
export function builtinTypeOf(id) {
  return getBuiltinById(id)?.type ?? null
}
