<script setup>
/**
 * GlassPanel.vue — 液态玻璃样式壳（border / blur / ring / content 四层）
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
    <div class="gp-ring" />
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

/* 原生 .card 的底色/描边退位，视觉全部由下面几层承担；padding 保留 */
.gp.card {
  background: none;
  border: 0;
  box-shadow: none;
  border-radius: var(--gp-radius, var(--g-reg-radius));
}

.gp-border,
.gp-blur,
.gp-ring {
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

/* 高光 + 厚度内阴影在 --glass-shadow 里；这里不再叠加任何压暗 */
.gp-border {
  z-index: 1;
  border: 1px solid var(--glass-edge-2);
  background-image: var(--glass-highlight);
  box-shadow: var(--glass-shadow);
}

.gp-identity .gp-border {
  box-shadow: var(--g-id-glow), var(--glass-shadow);
}

/* L1 边缘材质：1px 环带 + 红/青色散。没有 mask 支持时整层不渲染，
 * 避免渐变铺满面板（R12）。 */
.gp-ring {
  display: none;
}

@supports (mask-composite: exclude) or (-webkit-mask-composite: xor) {
  .gp-ring {
    display: block;
    z-index: 3;
    padding: 1px;
    background: linear-gradient(135deg,
        var(--glass-edge) 0%, var(--glass-edge-2) 38%,
        var(--glass-edge-3) 72%, var(--glass-edge-2) 100%);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    mask-composite: exclude;
  }

  .gp-ring::before,
  .gp-ring::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    mix-blend-mode: screen;
    opacity: .12;
    pointer-events: none;
  }

  .gp-ring::before {
    background: linear-gradient(135deg, rgba(255,96,96,.9), transparent 46%);
    transform: translate(.5px, .5px);
  }

  .gp-ring::after {
    background: linear-gradient(135deg, transparent 54%, rgba(96,220,255,.9));
    transform: translate(-.5px, -.5px);
  }
}

.gp-content {
  position: relative;
  z-index: 2;
  border-radius: inherit;
  text-shadow: var(--on-glass-shadow);
}
</style>
