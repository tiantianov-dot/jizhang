<script setup>
import GlassPanel from './GlassPanel.vue'

const tabs = [
  { to: '/', label: '记一笔' },
  { to: '/list', label: '流水' },
  { to: '/stats', label: '统计' },
  { to: '/settings', label: '设置' },
]
</script>

<template>
  <GlassPanel tag="nav" shape="pill" class="tabbar" role="navigation" aria-label="主导航">
    <RouterLink
      v-for="t in tabs"
      :key="t.to"
      :to="t.to"
      class="tab"
      active-class="active"
      data-ripple
    >
      <svg
        v-if="t.to === '/'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
      <svg
        v-else-if="t.to === '/list'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M4 7h16M4 12h16M4 17h10" />
      </svg>
      <svg
        v-else-if="t.to === '/stats'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M5 19V9M12 19V5M19 19v-7" />
      </svg>
      <svg
        v-else
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="3.2" />
        <path
          d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M18 6l-1.4 1.4M7.4 16.6 6 18M18 18l-1.4-1.4M7.4 7.4 6 6"
        />
      </svg>
      <span class="label">{{ t.label }}</span>
    </RouterLink>
  </GlassPanel>
</template>

<style scoped>
.tabbar {
  position: fixed;
  z-index: 10;
  left: 12px;
  right: 12px;
  bottom: calc(10px + env(safe-area-inset-bottom));
  height: 58px;
  max-width: 496px;
  margin: 0 auto;
  display: flex;
  gap: 2px;
  padding: 4px;
  border-radius: var(--glass-radius-pill);
}

.tabbar.gp {
  position: fixed;
  border-radius: var(--glass-radius-pill);
}

.tab {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  min-width: 0;
  padding: 3px 2px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--on-glass-2);
  font-size: 10px;
  text-shadow: var(--on-glass-shadow);
  text-decoration: none;
  cursor: pointer;
  touch-action: manipulation;
}

.tab svg {
  width: 18px;
  height: 18px;
  display: block;
}

.tab.active {
  background: var(--glass-active-fill);
  color: var(--on-glass);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
}
</style>
