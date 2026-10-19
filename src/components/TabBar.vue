<script setup>
import GlassPanel from './GlassPanel.vue'

const tabs = [
  { to: '/', label: '记一笔', icon: '➕' },
  { to: '/list', label: '流水', icon: '📒' },
  { to: '/stats', label: '统计', icon: '📊' },
  { to: '/settings', label: '设置', icon: '⚙️' },
]
</script>

<template>
  <GlassPanel tier="regular" class="tabbar" role="navigation" aria-label="主导航">
    <RouterLink v-for="t in tabs" :key="t.to" :to="t.to" class="tab" active-class="active">
      <span class="icon">{{ t.icon }}</span>
      <span class="label">{{ t.label }}</span>
    </RouterLink>
  </GlassPanel>
</template>

<style scoped>
.tabbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  max-width: 520px;
  margin: 0 auto;
  height: calc(var(--tabbar-h) + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  display: flex;
  border-radius: 0;
  z-index: 10;
}

/* 根节点同时被 GlassPanel 的 .gp 命中，双类名压过它的 position:relative */
.tabbar.gp {
  position: fixed;
  border-radius: 0;
}

.tabbar :deep(.gp-content) {
  display: flex;
  flex: 1;
  min-width: 0;
}

/* 贴屏幕底：只留顶缘描边，不做圆角 */
.tabbar :deep(.gp-border) {
  border-width: 1px 0 0;
  border-radius: 0;
}

.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  text-decoration: none;
  color: var(--text-secondary);
  font-size: 11px;
}

.tab .icon {
  font-size: 20px;
  line-height: 1;
}

.tab.active {
  color: var(--brand);
  font-weight: 600;
}
</style>
