<script setup>
/**
 * GlassPanel.vue — 单一玻璃材质壳（单根渲染，布局全部交给父级 class）
 *
 * tag / type / disabled / aria-* / data-* / 事件依赖 Vue 单根 attr fallthrough；
 * 材质由 glass.css 的 :is(.gp, .card) 提供，这里只负责 shape 圆角与 blur 开关。
 */
defineProps({
  shape: { type: String, default: 'panel' },
  tag: { type: String, default: 'div' },
  blur: { type: Boolean, default: true },
})
</script>

<template>
  <component :is="tag" class="gp" :class="'gp-' + shape" :data-blur="blur ? undefined : 'off'">
    <slot />
  </component>
</template>

<style scoped>
.gp-panel {
  border-radius: var(--glass-radius-panel);
}

.gp-key {
  border-radius: var(--glass-radius-key);
}

.gp-chip {
  border-radius: 14px;
}

.gp-pill {
  border-radius: var(--glass-radius-pill);
}
</style>
