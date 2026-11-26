<script setup>
/**
 * AppearanceSettingCard.vue — 外观材质设置卡片（实时预览 + 模糊强度/玻璃填充双滑块）
 *
 * 拖动只 preview，松手 change 才持久化；卡片根节点保持 data-blur="off" 控制合成层数量。
 */
import { computed, ref, watch } from 'vue'
import { useAppearanceStore } from '@/stores/appearance'
import GlassPanel from '@/components/GlassPanel.vue'

const appearance = useAppearanceStore()

const intensity = ref(1)
const intensityPct = computed(() => Math.round(intensity.value * 100))
const fillPct = ref(3)

watch(
  () => appearance.glassIntensity,
  (v) => {
    intensity.value = v
  },
  { immediate: true },
)

watch(
  () => appearance.glassFill,
  (v) => {
    fillPct.value = Math.round(v * 100)
  },
  { immediate: true },
)

function onIntensityInput() {
  appearance.previewIntensity(intensity.value)
}

async function commitIntensity() {
  await appearance.setIntensity(intensity.value)
  intensity.value = appearance.glassIntensity
}

function onFillInput() {
  appearance.previewFill(fillPct.value / 100)
}

async function commitFill() {
  await appearance.setFill(fillPct.value / 100)
  fillPct.value = Math.round(appearance.glassFill * 100)
}
</script>

<template>
  <div class="card" data-blur="off">
    <div class="row"><span>外观</span></div>

    <!-- 实时预览：垫一层高对比渐变，拖动滑块时材质变化立刻可见 -->
    <div class="preview">
      <div class="preview-bg"></div>
      <GlassPanel shape="pill" class="preview-glass" data-testid="glass-preview">
        <div class="preview-inner">
          <span class="preview-dot"></span>
          <span class="preview-label">¥ 34.00</span>
          <span class="preview-tag">实时预览</span>
        </div>
      </GlassPanel>
    </div>

    <div class="slider">
      <div class="slider-head">
        <span>模糊强度</span>
        <span class="cur">{{ intensityPct }}%</span>
      </div>
      <input
        v-model.number="intensity"
        class="range"
        type="range"
        min="0"
        max="1"
        step="0.05"
        data-testid="glass-intensity-slider"
        aria-label="模糊强度"
        @input="onIntensityInput"
        @change="commitIntensity"
      />
    </div>

    <div class="slider">
      <div class="slider-head">
        <span>玻璃填充（越低越透）</span>
        <span class="cur">{{ fillPct }}%</span>
      </div>
      <input
        v-model.number="fillPct"
        class="range"
        type="range"
        min="0"
        max="30"
        step="1"
        data-testid="glass-fill-slider"
        aria-label="玻璃填充（越低越透）"
        @input="onFillInput"
        @change="commitFill"
      />
    </div>
  </div>
</template>

<style scoped>
.preview {
  position: relative;
  height: 84px;
  margin: 6px 0 12px;
  border-radius: 16px;
}

.preview-bg {
  position: absolute;
  inset: 0;
  border-radius: 16px;
  background:
    radial-gradient(120% 130% at 15% 20%, #d85a30 0%, transparent 55%),
    radial-gradient(110% 120% at 85% 25%, #185fa5 0%, transparent 60%),
    radial-gradient(140% 120% at 50% 110%, #0f6e56 0%, transparent 70%), #2a2a30;
}

.preview-glass {
  position: absolute;
  left: 14px;
  right: 14px;
  top: 18px;
  bottom: 18px;
  border-radius: var(--glass-radius-pill);
}

.preview-inner {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  padding: 0 16px;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.preview-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--brand);
  box-shadow: 0 0 8px var(--brand);
}

.preview-label {
  font-weight: 600;
}

.preview-tag {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-secondary);
}

.slider {
  padding: 6px 0;
}

.slider-head {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-secondary);
}

.range {
  width: 100%;
  margin: 6px 0 2px;
  accent-color: var(--brand);
}
</style>
