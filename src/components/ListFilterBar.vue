<script setup>
/**
 * ListFilterBar.vue — 流水页搜索框与分类筛选入口
 *
 * 表单提交时立即通知父级同步关键词并 blur 收起 iOS 键盘；
 * 输入框保持 ≥16px 字号以防止 iOS 聚焦自动放大页面。
 */
import { computed, ref } from 'vue'

const props = defineProps({
  /** 搜索输入框即时值 */
  modelValue: { type: String, default: '' },
  /** 当前生效的分类筛选对象，null = 全部 */
  activeCategory: { type: Object, default: null },
})

const emit = defineEmits(['update:modelValue', 'submit', 'open-filter'])

const searchEl = ref(null)

const query = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

/** 回车：通知父级立即生效，并 blur 收起 iOS 键盘 */
function onSubmit() {
  emit('submit')
  searchEl.value?.blur()
}
</script>

<template>
  <div class="filters">
    <form class="search" @submit.prevent="onSubmit">
      <input
        ref="searchEl"
        v-model="query"
        class="input"
        type="search"
        inputmode="search"
        enterkeyhint="search"
        placeholder="搜备注"
      />
    </form>
    <button class="fbtn" :class="{ on: !!activeCategory }" @click="emit('open-filter')">
      {{ activeCategory ? `${activeCategory.emoji} ${activeCategory.name}` : '全部' }}
    </button>
  </div>
</template>

<style scoped>
/* 筛选行：搜索框 + 分类筛选入口 */
.filters {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.search {
  flex: 1;
  min-width: 0;
}

.input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-edge-2);
  background: var(--glass-well);
  color: var(--on-glass);
  font-size: 16px; /* ≥16px：防 iOS 聚焦输入框时页面自动放大 */
  appearance: none;
}

.input::placeholder {
  color: var(--on-glass-2);
}

.fbtn {
  flex: none;
  max-width: 45%;
  height: 36px;
  padding: 0 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-edge-2);
  background: var(--glass-well);
  color: var(--on-glass-2);
  font-size: 13px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.fbtn.on {
  color: var(--on-glass);
  border-color: var(--glass-edge-3);
  background: var(--glass-active-fill);
  font-weight: 600;
}
</style>
