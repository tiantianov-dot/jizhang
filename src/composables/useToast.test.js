import test from 'node:test'
import assert from 'node:assert/strict'
import { createRenderer, defineComponent, h } from 'vue'
import { useToast } from './useToast.js'

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

test('无组件实例调用不产生 Vue 警告，默认 4000ms 后自动清空并触发 onClear', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const warns = []
  t.mock.method(console, 'warn', (...args) => warns.push(args.join(' ')))

  let cleared = 0
  const toast = useToast({ onClear: () => (cleared += 1) })
  assert.equal(toast.message.value, '')
  assert.equal(warns.length, 0)

  toast.show('已保存')
  assert.equal(toast.message.value, '已保存')

  t.mock.timers.tick(3999)
  assert.equal(toast.message.value, '已保存')
  assert.equal(cleared, 0)

  t.mock.timers.tick(1)
  assert.equal(toast.message.value, '')
  assert.equal(cleared, 1)
})

test('连续 show 会重置定时器且不会提前触发 onClear，支持单次覆盖 duration', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let cleared = 0
  const toast = useToast({ duration: 2000, onClear: () => (cleared += 1) })

  toast.show('第一条')
  t.mock.timers.tick(1500)
  toast.show('第二条', 1000)

  t.mock.timers.tick(600)
  assert.equal(toast.message.value, '第二条')
  assert.equal(cleared, 0)

  t.mock.timers.tick(400)
  assert.equal(toast.message.value, '')
  assert.equal(cleared, 1)
})

test('clear 立即清空并取消定时器；空态重复 clear 不重复触发 onClear', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let cleared = 0
  const toast = useToast({ duration: 3000, onClear: () => (cleared += 1) })

  toast.clear()
  assert.equal(cleared, 0)

  toast.show('操作成功')
  toast.clear()
  assert.equal(toast.message.value, '')
  assert.equal(cleared, 1)

  toast.clear()
  t.mock.timers.tick(5000)
  assert.equal(cleared, 1)
})

test('show 传入空串等同清空；dispose 清理定时器但不触发 onClear', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let cleared = 0
  const toast = useToast({ duration: 1000, onClear: () => (cleared += 1) })

  toast.show('临时提示')
  toast.show('')
  assert.equal(toast.message.value, '')
  assert.equal(cleared, 1)

  toast.show('即将卸载')
  toast.dispose()
  assert.equal(toast.message.value, '')
  t.mock.timers.tick(2000)
  assert.equal(cleared, 1)
})

test('组件卸载时通过 onBeforeUnmount 自动清理定时器', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let cleared = 0
  let api = null
  const app = mountHeadless(() => {
    api = useToast({ duration: 1000, onClear: () => (cleared += 1) })
    api.show('挂载中提示')
    return {}
  })

  assert.equal(api.message.value, '挂载中提示')
  app.unmount()
  assert.equal(api.message.value, '')

  t.mock.timers.tick(2000)
  assert.equal(cleared, 0)
})
