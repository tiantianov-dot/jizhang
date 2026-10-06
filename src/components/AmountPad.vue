<script setup>
/**
 * AmountPad.vue — 金额数字键盘（记一笔 / 编辑页复用）
 *
 * 缓冲状态由父级持有：v-model:buffer 传入金额输入缓冲串（形如 "12.3"），
 * 父级监听 save 事件做校验与写库（键盘只负责输入，不碰数据层）。
 * 输入限制与键位布局沿用记一笔页原有实现：整数 7 位、小数 2 位；
 * ✓ 占最后一列下三格，⌫ 提到最后一列第一格。
 */
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
    <button v-for="k in keys" :key="k" class="key" @click="press(k)">
      {{ k === 'back' ? '⌫' : k }}
    </button>
    <button class="key ok" :disabled="saving" @click="emit('save')">✓</button>
  </div>
</template>

<style scoped>
.pad {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-auto-rows: 54px;
  gap: 6px;
  margin-top: auto;
}

.key {
  background: var(--surface);
  border: 0.5px solid var(--border);
  border-radius: 10px;
  font-size: 20px;
  font-variant-numeric: tabular-nums;
}

.key:active {
  background: var(--bg);
}

.key:disabled {
  opacity: 0.55;
}

/* ✓ 占最后一列下三格 */
.key.ok {
  grid-column: 4;
  grid-row: 2 / span 3;
  background: var(--brand);
  color: #fff;
  font-size: 24px;
  font-weight: 600;
}

.key.ok:active {
  background: var(--brand-strong);
}

/* ⌫ 提到最后一列第一格：调整键位顺序由 CSS grid auto-placement 处理 */
.pad .key:nth-child(12) {
  grid-column: 4;
  grid-row: 1;
}
</style>
