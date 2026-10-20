<script setup>
/**
 * CategoryFilterSheet.vue — 流水页「分类筛选」底部弹层（position:fixed，非 modal 库）
 *
 * 三段：全部 / 支出分类 / 收入分类，点击即选并收起；点遮罩收起。
 * 只接收 props（分类数据由父级从 categories store 取出），自身不取数、不过滤。
 */
import { onMounted, onUnmounted } from 'vue'
import GlassPanel from './GlassPanel.vue'

defineProps({
  /** 当前选中的 categoryId，'' = 全部 */
  modelValue: { type: String, default: '' },
  /** 未归档支出分类（最近使用排前） */
  expense: { type: Array, default: () => [] },
  /** 未归档收入分类（最近使用排前） */
  income: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue', 'close'])

/** 选中即收起（'' = 全部，恢复不筛选） */
function pick(id) {
  emit('update:modelValue', id)
  emit('close')
}

/* 弹层打开期间锁定背景滚动（组件经 v-if 挂载/卸载，钩子即开/关）。
 * 简单方案够用：body overflow hidden + sheet 自身 overscroll-behavior: contain（见样式），
 * 不上 position:fixed + scrollTop 记忆那套重方案——那是过度设计。 */
let prevOverflow = ''
onMounted(() => {
  prevOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
})
onUnmounted(() => {
  document.body.style.overflow = prevOverflow
})
</script>

<template>
  <div class="mask" @click="emit('close')">
    <!-- @click.stop：点卡片内部不收起 -->
    <GlassPanel tier="regular" class="sheet" @click.stop>
      <div class="sheet-scroll">
        <div class="s-head">按分类筛选</div>

        <div class="s-sec">全部</div>
        <div class="grid">
          <button class="item" :class="{ on: !modelValue }" @click="pick('')">
            <span class="emoji">🧾</span>
            <span class="name">全部</span>
          </button>
        </div>

        <template v-if="expense.length">
          <div class="s-sec">支出分类</div>
          <div class="grid">
            <button
              v-for="c in expense"
              :key="c.id"
              class="item"
              :class="{ on: modelValue === c.id }"
              @click="pick(c.id)"
            >
              <span class="emoji">{{ c.emoji }}</span>
              <span class="name">{{ c.name }}</span>
            </button>
          </div>
        </template>

        <template v-if="income.length">
          <div class="s-sec">收入分类</div>
          <div class="grid">
            <button
              v-for="c in income"
              :key="c.id"
              class="item"
              :class="{ on: modelValue === c.id }"
              @click="pick(c.id)"
            >
              <span class="emoji">{{ c.emoji }}</span>
              <span class="name">{{ c.name }}</span>
            </button>
          </div>
        </template>
      </div>
    </GlassPanel>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 30; /* 高于 TabBar(10) 与撤销 toast(20) */
  display: flex;
  align-items: flex-end;
  background: rgba(0, 0, 0, .45);
}

.sheet {
  width: 100%;
  max-width: 520px; /* 与 #app 同宽，桌面访问版式一致 */
  margin: 0 auto;
  border-radius: 18px 18px 0 0;
}

.sheet.gp {
  border-radius: 18px 18px 0 0;
}

/* 滚动放在内容层内：blur 层固定，不随弹层内容滚走 */
.sheet-scroll {
  max-height: 72vh;
  overflow-y: auto;
  overscroll-behavior: contain; /* sheet 内滚到头不穿透带动背景滚动 */
  padding: 14px 16px calc(env(safe-area-inset-bottom) + 16px);
  border-radius: 18px 18px 0 0;
}

.s-head {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}

.s-sec {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 12px 0 6px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}

.item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-height: 44px; /* 触控目标 */
  padding: 8px 2px;
  border-radius: 10px;
  border: 1.5px solid transparent;
}

.item .emoji {
  font-size: 22px;
  line-height: 1;
}

.item .name {
  font-size: 12px;
  color: var(--text-secondary);
}

.item.on {
  border-color: var(--glass-edge-3);
  background: rgba(var(--panel-fill-rgb), calc(.04 + .06 * var(--glass-intensity)));
}

.item.on .name {
  color: var(--on-glass);
  font-weight: 600;
}
</style>
