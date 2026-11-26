<script setup>
/**
 * PageTopbar.vue — 二级页共用顶栏（返回按钮 + 页面标题）
 *
 * 与 EditView / CategoriesView 原 .topbar / .back / .page-title 结构与样式完全一致。
 */
defineProps({
  /** 页面标题 */
  title: { type: String, required: true },
})

const emit = defineEmits(['back'])
</script>

<template>
  <div class="topbar">
    <button type="button" class="back" @click="emit('back')">‹ 返回</button>
    <h2 class="page-title">{{ title }}</h2>
  </div>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.back {
  font-size: 15px;
  color: var(--text-secondary);
  padding: 8px 0;
}

.topbar .page-title {
  margin: 0;
}
</style>
