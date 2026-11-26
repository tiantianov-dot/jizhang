import test from 'node:test'
import assert from 'node:assert/strict'
import { createRenderer, defineComponent, h } from 'vue'
import { useTwoStepConfirm } from './useTwoStepConfirm.js'

/** 极简无 DOM 渲染器，用于在 Node 环境验证组件卸载时的 onBeforeUnmount 自动清理 */
function mountHeadless(setup) {
  const noop = () => {}
  const { createApp } = createRenderer({
    patchProp: noop,
    insert: noop,
    remove: noop,
    createElement: () => ({}),
    createText: () => ({}),
    createComment: () => ({}),
    setText: noop,
    setElementText: noop,
    parentNode: () => null,
    nextSibling: () => null,
  })
  const app = createApp(defineComponent({ setup, render: () => h('div') }))
  app.mount({})
  return app
}

test('无组件实例调用不产生 Vue 警告，首次 trigger 进入确认态并在 3000ms 后自动复原', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const warns = []
  t.mock.method(console, 'warn', (...args) => warns.push(args.join(' ')))

  let confirmed = 0
  const step = useTwoStepConfirm()
  assert.equal(step.confirming.value, false)
  assert.equal(warns.length, 0)

  assert.equal(
    step.trigger(() => (confirmed += 1)),
    false,
  )
  assert.equal(step.confirming.value, true)
  assert.equal(confirmed, 0)

  t.mock.timers.tick(2999)
  assert.equal(step.confirming.value, true)

  t.mock.timers.tick(1)
  assert.equal(step.confirming.value, false)

  // 超时复原后再次点击重新进入确认态，不直接执行
  assert.equal(
    step.trigger(() => (confirmed += 1)),
    false,
  )
  assert.equal(step.confirming.value, true)
  assert.equal(confirmed, 0)
  step.dispose()
})

test('超时内再次 trigger 立即复原状态、执行回调并返回 true', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let confirmed = 0
  let stateDuringCallback = null
  const step = useTwoStepConfirm({ timeout: 2000 })

  assert.equal(step.trigger(), false)
  assert.equal(step.confirming.value, true)

  t.mock.timers.tick(1000)
  assert.equal(
    step.trigger(() => {
      stateDuringCallback = step.confirming.value
      confirmed += 1
    }),
    true,
  )
  assert.equal(stateDuringCallback, false)
  assert.equal(step.confirming.value, false)
  assert.equal(confirmed, 1)

  // 确认后原定时器已被取消，再推进时间不产生副作用
  t.mock.timers.tick(3000)
  assert.equal(step.confirming.value, false)
  assert.equal(confirmed, 1)
})

test('reset 与 dispose 立即取消确认态与定时器', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let confirmed = 0
  const step = useTwoStepConfirm({ timeout: 1500 })

  step.trigger(() => (confirmed += 1))
  assert.equal(step.confirming.value, true)

  step.reset()
  assert.equal(step.confirming.value, false)
  assert.equal(
    step.trigger(() => (confirmed += 1)),
    false,
  )
  assert.equal(confirmed, 0)

  step.dispose()
  assert.equal(step.confirming.value, false)
  t.mock.timers.tick(2000)
  assert.equal(step.confirming.value, false)
})

test('组件卸载时通过 onBeforeUnmount 自动复位并清理定时器', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let api = null
  const app = mountHeadless(() => {
    api = useTwoStepConfirm({ timeout: 2000 })
    api.trigger()
    return {}
  })

  assert.equal(api.confirming.value, true)
  app.unmount()
  assert.equal(api.confirming.value, false)

  t.mock.timers.tick(3000)
  assert.equal(api.confirming.value, false)
})
