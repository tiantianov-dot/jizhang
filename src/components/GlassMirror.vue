<script setup>
/**
 * GlassMirror.vue — L2 背景镜像壳 + 视口克隆
 *
 * 壳负责裁剪与以面板中心缩放；克隆是 100vw×100vh 的背景图，平移到视口原点。
 * 零 backdrop-filter；rect 未就绪时 data-ready=0，克隆 display:none 退化为 L1。
 */
defineProps({
  name: { type: String, default: '' },
})
</script>

<template>
  <div class="gp-mirror" :data-testid="'mirror-' + name" data-ready="0">
    <div class="gp-mirror-clone" />
  </div>
</template>

<style scoped>
.gp-mirror {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
  z-index: 0;
  pointer-events: none;
  transform: scale(var(--bg-mag, 1));
}

.gp-mirror-clone {
  display: none;
  position: absolute;
  left: 0;
  top: 0;
  width: 100vw;
  height: 100vh;
  background-image: var(--bg-image);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  transform: translate(calc(-1 * var(--bg-x, 0px)), calc(-1 * var(--bg-y, 0px)));
  filter: blur(calc(2px * var(--glass-intensity))) saturate(1.3);
}

.gp-mirror[data-ready='1'] .gp-mirror-clone {
  display: block;
}
</style>
