import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyAmountKey,
  fenToInput,
  fenToYuan,
  fmtFen,
  formatAmountBuffer,
  formatLocalDateTime,
  formatRecordSubline,
  toFen,
  todayStr,
} from '@/utils/format'

test('toFen：元（字符串或数字）转为整数分，避免浮点误差', () => {
  assert.equal(toFen(8), 800)
  assert.equal(toFen('12.3'), 1230)
  assert.equal(toFen('0.05'), 5)
  assert.equal(toFen('19.99'), 1999)
  assert.equal(toFen('0.29'), 29)
  assert.equal(toFen('35.50'), 3550)
  assert.equal(toFen(1.15), 115)
  assert.equal(toFen('0'), 0)
  assert.equal(toFen(0), 0)
})

test('fenToYuan：整数分转为两位小数字符串', () => {
  assert.equal(fenToYuan(3550), '35.50')
  assert.equal(fenToYuan(5), '0.05')
  assert.equal(fenToYuan(200000), '2000.00')
  assert.equal(fenToYuan(0), '0.00')
  assert.equal(fenToYuan(null), '0.00')
  assert.equal(fenToYuan(undefined), '0.00')
  assert.equal(fenToYuan(-125), '-1.25')
})

test('fmtFen：整数分转为带人民币符号的显示串', () => {
  assert.equal(fmtFen(3550), '¥35.50')
  assert.equal(fmtFen(200000), '¥2000.00')
  assert.equal(fmtFen(5), '¥0.05')
  assert.equal(fmtFen(0), '¥0.00')
})

test('fenToInput：去除尾随无意义 0 与小数点', () => {
  assert.equal(fenToInput(3550), '35.5')
  assert.equal(fenToInput(3500), '35')
  assert.equal(fenToInput(3505), '35.05')
  assert.equal(fenToInput(10), '0.1')
  assert.equal(fenToInput(100), '1')
  assert.equal(fenToInput(0), '0')
})

test('formatLocalDateTime：格式化合法 ISO / Date 为本地 YYYY-MM-DD HH:mm', () => {
  const padded = new Date(2026, 0, 2, 3, 4)
  assert.equal(formatLocalDateTime(padded.toISOString()), '2026-01-02 03:04')

  const doubleDigit = new Date(2026, 11, 25, 23, 59)
  assert.equal(formatLocalDateTime(doubleDigit.toISOString()), '2026-12-25 23:59')

  const dateObj = new Date(2026, 9, 5, 8, 7)
  assert.equal(formatLocalDateTime(dateObj), '2026-10-05 08:07')
})

test('formatLocalDateTime：空值与非法输入返回空串', () => {
  assert.equal(formatLocalDateTime(''), '')
  assert.equal(formatLocalDateTime(null), '')
  assert.equal(formatLocalDateTime(undefined), '')
  assert.equal(formatLocalDateTime('not-a-date'), '')
  assert.equal(formatLocalDateTime(0), '')
  assert.equal(formatLocalDateTime({}), '')
})

test('formatAmountBuffer：空串与孤立小数点展示 0.00，其余按分格式化两位小数', () => {
  assert.equal(formatAmountBuffer(''), '0.00')
  assert.equal(formatAmountBuffer(null), '0.00')
  assert.equal(formatAmountBuffer(undefined), '0.00')
  assert.equal(formatAmountBuffer('.'), '0.00')
  assert.equal(formatAmountBuffer('0.'), '0.00')
  assert.equal(formatAmountBuffer('0'), '0.00')
  assert.equal(formatAmountBuffer('12'), '12.00')
  assert.equal(formatAmountBuffer('12.'), '12.00')
  assert.equal(formatAmountBuffer('12.3'), '12.30')
  assert.equal(formatAmountBuffer('12.34'), '12.34')
  assert.equal(formatAmountBuffer('0.05'), '0.05')
  assert.equal(formatAmountBuffer('1234567.89'), '1234567.89')
})

test('formatRecordSubline：今天 / 非今天 / 备注拼接 / 空与纯空格备注 / 非法空日期', () => {
  const today = '2026-10-06'
  assert.equal(formatRecordSubline(today, '', today), '今天')
  assert.equal(formatRecordSubline(today, '   ', today), '今天')
  assert.equal(formatRecordSubline(today, ' 午饭 ', today), '今天 · 午饭')
  assert.equal(formatRecordSubline(todayStr(), ''), '今天')

  assert.equal(formatRecordSubline('2026-03-05', '', today), '3月5日')
  assert.equal(formatRecordSubline('2026-03-05', '奶茶', today), '3月5日 · 奶茶')
  assert.equal(formatRecordSubline('2026-12-25', '   ', today), '12月25日')

  assert.equal(formatRecordSubline('', '', today), '')
  assert.equal(formatRecordSubline('', '仅备注', today), '仅备注')
  assert.equal(formatRecordSubline(null, '仅备注', today), '仅备注')
  assert.equal(formatRecordSubline('not-a-date', '', today), '')
  assert.equal(formatRecordSubline('2026-ab-cd', '备注', today), '备注')
  assert.equal(formatRecordSubline('', '', ''), '')
})

test('applyAmountKey：首点补 0、重复点忽略、小数 2 位/整数 7 位截断、退格与非法键忽略', () => {
  // 首点与小数点
  assert.equal(applyAmountKey('', '.'), '0.')
  assert.equal(applyAmountKey('12', '.'), '12.')
  assert.equal(applyAmountKey('0.', '.'), '0.')
  assert.equal(applyAmountKey('12.', '.'), '12.')
  assert.equal(applyAmountKey('12.3', '.'), '12.3')

  // 数字与小数 2 位截断
  assert.equal(applyAmountKey('', '5'), '5')
  assert.equal(applyAmountKey('0.', '5'), '0.5')
  assert.equal(applyAmountKey('12.3', '4'), '12.34')
  assert.equal(applyAmountKey('12.34', '5'), '12.34')

  // 整数 7 位截断
  assert.equal(applyAmountKey('123456', '7'), '1234567')
  assert.equal(applyAmountKey('1234567', '8'), '1234567')
  assert.equal(applyAmountKey('1234567.', '5'), '1234567.')

  // 退格到空
  assert.equal(applyAmountKey('12.3', 'back'), '12.')
  assert.equal(applyAmountKey('12.', 'back'), '12')
  assert.equal(applyAmountKey('1', 'back'), '')
  assert.equal(applyAmountKey('', 'back'), '')

  // 非法键与非字符串 buffer
  assert.equal(applyAmountKey('12', 'a'), '12')
  assert.equal(applyAmountKey('12', '12'), '12')
  assert.equal(applyAmountKey('12', ''), '12')
  assert.equal(applyAmountKey('12', '-'), '12')
  assert.equal(applyAmountKey('12', null), '12')
  assert.equal(applyAmountKey('12', undefined), '12')
  assert.equal(applyAmountKey('12', 5), '12')
  assert.equal(applyAmountKey(null, '5'), '5')
})
