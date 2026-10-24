/**
 * services/writeOutcome.js — 存储写入失败的二态归类与用户文案（纯函数）
 *
 * failed：能确认事务未提交/已明确 abort（校验失败、配额、约束、打开库失败等）。
 * unknown：无法证明事务结局，用户应先核实流水，禁止自动重试造成重复记账。
 *
 * 只按错误类型/显式标记归类，绝不读取账目金额、备注等业务内容。
 */

export const WRITE_OUTCOME = Object.freeze({
  FAILED: 'failed',
  UNKNOWN: 'unknown',
})

export const WRITE_MESSAGES = Object.freeze({
  failed: '未保存，请检查浏览器存储后重试',
  unknown: '保存结果未确认，请先到流水页核实',
  refreshFailed: '已保存，列表暂未刷新',
})

export const DELETE_MESSAGES = Object.freeze({
  failed: '删除失败，请稍后重试',
  unknown: '删除结果未确认，请刷新后查看',
  refreshFailed: '已删除，列表暂未刷新',
})

export const UNDO_MESSAGES = Object.freeze({
  failed: '撤销失败，请稍后重试',
  unknown: '撤销结果未确认，请刷新后查看',
  refreshFailed: '已撤销，列表暂未刷新',
})

/** 这些 DOMException 表示事务已 abort/未开始，可安全归为 failed */
const FAILED_ERROR_NAMES = new Set([
  'AbortError',
  'QuotaExceededError',
  'ConstraintError',
  'DataError',
  'InvalidStateError',
  'NotFoundError',
  'VersionError',
  'NotAllowedError',
  'SecurityError',
])

/**
 * @param {unknown} error
 * @returns {'failed'|'unknown'}
 */
export function classifyWriteError(error) {
  if (error && typeof error === 'object') {
    if (error.writeOutcome === WRITE_OUTCOME.FAILED) return WRITE_OUTCOME.FAILED
    if (error.writeOutcome === WRITE_OUTCOME.UNKNOWN) return WRITE_OUTCOME.UNKNOWN
    if (FAILED_ERROR_NAMES.has(error.name)) return WRITE_OUTCOME.FAILED
  }
  return WRITE_OUTCOME.UNKNOWN
}

/**
 * 给已知结局的错误打标记（用于仓库层能证明“未写入”的失败）。
 * @template T
 * @param {T} error
 * @param {'failed'|'unknown'} outcome
 * @returns {T}
 */
export function tagWriteError(error, outcome) {
  if (!error || typeof error !== 'object') {
    const wrapped = new Error(String(error))
    wrapped.writeOutcome = outcome
    return wrapped
  }
  try {
    error.writeOutcome = outcome
  } catch {
    // 冻结/只读错误对象：无法打标记时由 classifyWriteError 按类型兜底
  }
  return error
}

/**
 * @param {unknown} error
 * @returns {{outcome: 'failed'|'unknown', message: string}}
 */
export function describeWriteFailure(error) {
  const outcome = classifyWriteError(error)
  return { outcome, message: WRITE_MESSAGES[outcome] }
}

/** @param {unknown} error */
export function describeUndoFailure(error) {
  return UNDO_MESSAGES[classifyWriteError(error)]
}

/** @param {unknown} error */
export function describeDeleteFailure(error) {
  return DELETE_MESSAGES[classifyWriteError(error)]
}
