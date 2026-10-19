<script setup>
/**
 * GlassPanel.vue — 液态玻璃样式壳（border / blur / content 三层）
 *
 * 只负责材质与描边，不接管布局：父级传进来的 class 落在根元素上，
 * 原有选择器照常命中；slot 内部 DOM 不变。三层共用同一圆角，
 * 禁止 overflow:hidden（会让子层 backdrop-filter 在 iOS 上失效）。
 */
defineProps({
  /** regular | clear | identity */
  tier: { type: String, default: 'regular' },
})
</script>

<template>
  <div class="gp" :class="'gp-' + tier">
    <div class="gp-border" />
    <div class="gp-blur" />
    <div class="gp-content"><slot /></div>
  </div>
</template>

<style scoped>
.gp-regular {
  --gp-bg: var(--g-reg-bg);
  --gp-filter: var(--g-reg-blur);
  --gp-radius: var(--g-reg-radius);
}

.gp-clear {
  --gp-bg: var(--g-clr-bg);
  --gp-filter: var(--g-clr-blur);
  --gp-radius: var(--g-clr-radius);
}

.gp-identity {
  --gp-bg: var(--g-id-bg);
  --gp-filter: var(--g-id-blur);
  --gp-radius: var(--g-id-radius);
}

.gp {
  position: relative;
  border-radius: var(--gp-radius, var(--g-reg-radius));
}

/* 原生 .card 的底色/描边退位，视觉全部由下面三层承担；padding 保留 */
.gp.card {
  background: none;
  border: 0;
  box-shadow: none;
  border-radius: var(--gp-radius, var(--g-reg-radius));
}

.gp-border,
.gp-blur {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
}

.gp-blur {
  z-index: 0;
  background-color: var(--gp-bg);
  -webkit-backdrop-filter: var(--gp-filter);
  backdrop-filter: var(--gp-filter);
}

/* 压暗层走独立的 --glass-dim，不参与 --glass-intensity 的计算 */
.gp-border {
  z-index: 1;
  border: 1px solid var(--glass-edge);
  background-image:
    linear-gradient(rgba(0,0,0,var(--glass-dim)), rgba(0,0,0,var(--glass-dim))),
    var(--glass-highlight);
  box-shadow: var(--glass-shadow);
}

.gp-identity .gp-border {
  box-shadow: var(--g-id-glow), var(--glass-shadow);
}

.gp-content {
  position: relative;
  z-index: 2;
  border-radius: inherit;
}
</style>
