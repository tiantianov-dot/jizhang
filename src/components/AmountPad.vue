<script setup>
/**
 * AmountPad.vue — 金额数字键盘（记一笔 / 编辑页复用）
 *
 * 缓冲状态由父级持有：v-model:buffer 传入金额输入缓冲串（形如 "12.3"），
 * 父级监听 save 事件做校验与写库（键盘只负责输入，不碰数据层）。
 * 输入限制与键位布局沿用记一笔页原有实现：整数 7 位、小数 2 位；
 * ✓ 占最后一列下三格，⌫ 提到最后一列第一格。
 */
import GlassPanel from './GlassPanel.vue'

const props = defineProps({
  /** 金额输入缓冲（v-model:buffer） */
  buffer: { type: String, default: '' },
  /** 父级正在写库：期间禁用 ✓，避免连点重复入账 */
  saving: { type: Boolean, default: false },
  /** ✓ 是否上 identity 真玻璃；编辑页按层预算关闭（arch ④：Edit 常驻仅 2 层） */
  identity: { type: Boolean, default: true },
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
    <button class="key ok" :class="{ plain: !identity }" :disabled="saving" @click="emit('save')">
      <GlassPanel v-if="identity" tier="identity" class="ok-panel">
        <span class="ok-label">✓</span>
      </GlassPanel>
      <span v-else class="ok-label">✓</span>
    </button>
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
  /* 高亮背景下按键需保持白字 ≥4.5:1：alpha 吃独立压暗变量并内置下限 */
  background-color: rgba(0, 0, 0, calc(.48 + var(--glass-dim)));
  background-image: var(--glass-highlight);
  border: 1px solid var(--glass-edge);
  border-radius: 10px;
  color: var(--text);
  font-size: 20px;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 1px 2px rgba(0, 0, 0, .75), 0 0 4px rgba(0, 0, 0, .45);
}

.key:active {
  background-color: rgba(0, 0, 0, calc(.60 + var(--glass-dim)));
}

.key:disabled {
  opacity: 0.55;
}

/* ✓ 占最后一列下三格，材质走 identity 档 */
.key.ok {
  position: relative;
  grid-column: 4;
  grid-row: 2 / span 3;
  padding: 0;
  border: none;
  background: none;
  color: #fff;
  font-size: 24px;
  font-weight: 600;
}

.key.ok > .ok-panel {
  position: absolute;
  inset: 0;
  border-radius: 999px;
}

.key.ok :deep(.gp-content) {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

/* 编辑页的 ✓：保留绿色识别，但不加 backdrop-filter，守住 Edit 常驻 2 层预算；
   底色用深绿板而非浅绿透明，白字在亮背景上仍可读 */
.key.ok.plain {
  border: 1px solid rgba(52, 199, 123, .6);
  border-radius: 10px;
  background-color: rgba(9, 56, 34, .8);
  box-shadow: 0 0 12px rgba(52, 199, 123, .18);
  text-shadow: 0 1px 2px rgba(0, 0, 0, .75), 0 0 4px rgba(0, 0, 0, .45);
}

/* ⌫ 提到最后一列第一格：调整键位顺序由 CSS grid auto-placement 处理 */
.pad .key:nth-child(12) {
  grid-column: 4;
  grid-row: 1;
}
</style>
