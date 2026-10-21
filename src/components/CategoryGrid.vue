<script setup>
/**
 * CategoryGrid.vue — 分类 chip 横向滚动（记一笔 / 编辑页复用）
 *
 * v-model 绑定当前选中的 categoryId；cats 为该收支类型下的分类
 * （store 已按 lastUsedAt 最近使用排前）。每个 chip 是独立玻璃。
 * 选中 id 不在 cats 里（分类被归档/删除）时降级显示「未分类」。
 */
import { computed } from 'vue'
import GlassPanel from './GlassPanel.vue'

const props = defineProps({
  /** 该收支类型下的分类列表（最近使用排前） */
  cats: { type: Array, default: () => [] },
  /** 当前选中的 categoryId */
  modelValue: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

/** 选中项已失效（归档等）：需要额外渲染一个降级条目 */
const missing = computed(
  () => !!props.modelValue && !props.cats.some((c) => c.id === props.modelValue),
)
</script>

<template>
  <div class="cats">
    <GlassPanel v-if="missing" tag="span" shape="chip" class="cat on missing">
      <i class="dot" style="--dot: #aaa" />
      <span class="name">未分类</span>
    </GlassPanel>
    <GlassPanel
      v-for="c in cats"
      :key="c.id"
      tag="button"
      type="button"
      shape="chip"
      class="cat"
      :class="{ on: modelValue === c.id }"
      data-ripple
      @click="emit('update:modelValue', c.id)"
    >
      <i class="dot" :style="{ '--dot': c.color || '#aaa' }" />
      <span class="name">{{ c.name }}</span>
    </GlassPanel>
  </div>
</template>

<style scoped>
.cats {
  display: flex;
  gap: 8px;
  padding: 1px 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.cats::-webkit-scrollbar {
  display: none;
}

.cat {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 11px;
  border-radius: 14px;
  color: var(--on-glass-2);
  font-size: 12px;
  text-shadow: var(--on-glass-shadow);
  box-shadow: var(--glass-lift-shadow);
  appearance: none;
  -webkit-appearance: none;
}

.cat .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dot, #aaa);
  box-shadow: 0 0 8px var(--dot, #aaa);
}

.cat.on {
  background-color: var(--glass-active-fill);
  color: var(--on-glass);
}

.cat.on.missing {
  border-style: dashed;
  border-color: var(--glass-edge-3);
}
</style>
