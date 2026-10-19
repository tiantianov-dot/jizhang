<script setup>
/**
 * CategoryGrid.vue — 分类大按钮平铺（记一笔 / 编辑页复用）
 *
 * v-model 绑定当前选中的 categoryId；cats 为该收支类型下的分类
 * （store 已按 lastUsedAt 最近使用排前，这是「3 秒记账」的核心体验）。
 * 选中的 id 不在 cats 里（分类被归档/删除）时降级显示「未分类 📦」，不崩溃。
 */
import { computed } from 'vue'

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
  <div class="cats card">
    <span v-if="missing" class="cat on missing">
      <span class="emoji">📦</span>
      <span class="name">未分类</span>
    </span>
    <button
      v-for="c in cats"
      :key="c.id"
      class="cat"
      :class="{ on: modelValue === c.id }"
      @click="emit('update:modelValue', c.id)"
    >
      <span class="emoji">{{ c.emoji }}</span>
      <span class="name">{{ c.name }}</span>
    </button>
  </div>
</template>

<style scoped>
.cats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  padding: 10px;
}

.cat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 2px;
  border-radius: 10px;
  border: 1.5px solid transparent;
}

.cat .emoji {
  font-size: 22px;
  line-height: 1;
}

.cat .name {
  font-size: 12px;
  color: var(--text-secondary);
}

.cat.on {
  border-color: var(--brand);
  background: color-mix(in srgb, var(--brand) 8%, var(--surface));
}

.cat.on .name {
  color: #fff;
  font-weight: 600;
}

/* 选中项已失效（分类被归档）：虚线边框提示不是正常分类 */
.cat.on.missing {
  border-style: dashed;
}
</style>
