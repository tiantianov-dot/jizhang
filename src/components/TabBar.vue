<script setup>
const tabs = [
  { to: '/', label: '记一笔', icon: '➕' },
  { to: '/list', label: '流水', icon: '📒' },
  { to: '/stats', label: '统计', icon: '📊' },
  { to: '/settings', label: '设置', icon: '⚙️' },
]
</script>

<template>
  <nav class="tabbar">
    <RouterLink v-for="t in tabs" :key="t.to" :to="t.to" class="tab" active-class="active">
      <span class="icon">{{ t.icon }}</span>
      <span class="label">{{ t.label }}</span>
    </RouterLink>
  </nav>
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
  background: var(--surface);
  border-top: 0.5px solid var(--border);
  z-index: 10;
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
