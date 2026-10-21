<script setup>
/**
 * AmountPad.vue — 金额数字键盘（记一笔 / 编辑页复用）
 *
 * 缓冲状态由父级持有：v-model:buffer 传入金额输入缓冲串（形如 "12.3"），
 * 父级监听 save 事件做校验与写库（键盘只负责输入，不碰数据层）。
 * 13 个键各自是一块独立玻璃：12 个数字键后接 ✓（第 4 列第 2–4 行）。
 */
import GlassPanel from './GlassPanel.vue'

const props = defineProps({
  /** 金额输入缓冲（v-model:buffer） */
  buffer: { type: String, default: '' },
  /** 父级正在写库：期间禁用 ✓，避免连点重复入账 */
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['update:buffer', 'save'])

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back']

function press(key) {
  const cur = props.buffer
  if (key === 'back') {
    emit('update:buffer', cur.slice(0, -1))
    return
  }
  if (key === '.') {
    if (!cur) emit('update:buffer', '0.')
    else if (!cur.includes('.')) emit('update:buffer', `${cur}.`)
    return
  }
  // 数字键：限制整数位 7 位、小数 2 位
  const [int, dec] = cur.split('.')
  if (dec !== undefined && dec.length >= 2) return
  if (int && int.length >= 7) return
  emit('update:buffer', cur + key)
}
</script>

<template>
  <div class="pad">
    <GlassPanel
      v-for="k in keys"
      :key="k"
      tag="button"
      type="button"
      shape="key"
      class="key"
      data-ripple
      @click="press(k)"
    >
      <span class="label">{{ k === 'back' ? '⌫' : k }}</span>
    </GlassPanel>
    <GlassPanel
      tag="button"
      type="button"
      shape="key"
      class="key ok"
      data-ripple
      :disabled="saving"
      @click="emit('save')"
    >
      <span class="label">✓</span>
    </GlassPanel>
  </div>
</template>

<style scoped>
.pad {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-auto-rows: 52px;
  gap: 10px;
  margin-top: auto;
  padding-top: 2px;
}

.pad .key {
  appearance: none;
  -webkit-appearance: none;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: var(--glass-radius-key);
  font-size: 20px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  color: var(--on-glass);
  cursor: pointer;
  touch-action: manipulation;
  box-shadow: var(--glass-lift-shadow);
  transition:
    background-color 0.16s ease,
    box-shadow 0.16s ease;
}

.pad .key .label {
  display: block;
  pointer-events: none;
  transition: transform 0.14s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.pad .key:active {
  background-color: rgba(200, 235, 255, calc(var(--glass-alpha) + 0.06));
  box-shadow: var(--glass-press-shadow);
}

.pad .key:active .label {
  transform: scale(0.9);
}

.pad .key.ok {
  grid-column: 4;
  grid-row: 2 / span 3;
  border-radius: 24px;
  font-size: 24px;
  font-weight: 600;
}

.pad .key:nth-child(12) {
  grid-column: 4;
  grid-row: 1;
}

.pad .key:disabled {
  cursor: default;
}

.pad .key:disabled .label {
  opacity: 0.45;
}
</style>
