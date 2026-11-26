<script setup>
/**
 * BackgroundSettingCard.vue — 背景素材设置卡片（星空/图片/GIF/视频预览、上传与恢复星空）
 *
 * 文件选择输入框采用懒挂载（选完即卸载），保证页面默认只有一个常驻导入文件框。
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { currentView, useBackgroundStore } from '@/stores/background'
import { coverRequirement } from '@/services/background'
import { drawStarfield } from '@/services/starfield'

const emit = defineEmits(['message'])

const background = useBackgroundStore()

const pickerOpen = ref(false)
const pickerEl = ref(null)
const bgCanvas = ref(null)

function drawPreview() {
  const el = bgCanvas.value
  if (!el) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  el.width = Math.round(390 * dpr)
  el.height = Math.round(800 * dpr)
  const ctx = el.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  drawStarfield(ctx, 390, 800)
}

onMounted(() => {
  nextTick(drawPreview)
})

watch(
  () => background.kind,
  () => nextTick(drawPreview),
)

const bgLabel = computed(() => {
  if (background.blocked) return '分辨率不足，已停用'
  if (background.kind === 'image') return '图片'
  if (background.kind === 'gif') return 'GIF 动图'
  if (background.kind === 'video') return '视频'
  return '默认星空'
})

const bgDims = computed(() => {
  const d = background.descriptor
  if (!d || !Number.isInteger(d.width) || !Number.isInteger(d.height)) return ''
  if (d.width <= 0 || d.height <= 0) return ''
  return `当前素材 ${d.width}×${d.height} 物理像素`
})

const bgRequirement = coverRequirement(currentView())

async function startPick() {
  pickerOpen.value = true
  await nextTick()
  pickerEl.value?.click()
}

async function onBgPick(e) {
  const file = e.target.files && e.target.files[0]
  pickerOpen.value = false
  if (!file) return
  try {
    await background.chooseFile(file)
    emit('message', '背景已更新')
  } catch (err) {
    emit('message', err.message)
  }
}

async function removeBg() {
  await background.remove()
  emit('message', '已恢复默认星空')
}
</script>

<template>
  <div class="card">
    <div class="row">
      <span>背景素材</span>
      <span class="cur">{{ bgLabel }}</span>
    </div>
    <p v-if="bgDims" class="placeholder">{{ bgDims }}</p>
    <div class="bg-preview" data-testid="bg-preview">
      <canvas
        v-if="background.kind === 'starfield'"
        ref="bgCanvas"
        class="bg-preview-media"
        data-testid="bg-preview-media"
      />
      <video
        v-else-if="background.kind === 'video'"
        class="bg-preview-media"
        data-testid="bg-preview-media"
        :src="background.url"
        muted
        loop
        playsinline
        preload="metadata"
      />
      <img
        v-else
        class="bg-preview-media"
        data-testid="bg-preview-media"
        :src="background.url"
        alt=""
      />
    </div>
    <p v-if="background.blocked" class="bg-warn">
      分辨率不足（{{ background.blocked.width }}×{{
        background.blocked.height
      }}），已暂用星空；请恢复星空后重新上传。
    </p>
    <div class="row">
      <button class="btn" data-testid="bg-upload" @click="startPick">上传图片/视频</button>
      <button v-if="background.descriptor" class="btn" data-testid="bg-remove" @click="removeBg">
        恢复星空
      </button>
      <input
        v-if="pickerOpen"
        ref="pickerEl"
        type="file"
        accept="image/*,video/*"
        hidden
        @change="onBgPick"
        @cancel="pickerOpen = false"
      />
    </div>
    <p class="placeholder">
      图片/GIF 至少 {{ bgRequirement.width }}×{{ bgRequirement.height }}
      物理像素（铺满不放大）；视频不限分辨率；图片/GIF 最大 8 MB、视频最大 30
      MB；素材只存本机，不进备份。
    </p>
  </div>
</template>

<style scoped>
/* 背景预览卡：零 backdrop-filter、非 fixed */
.bg-preview {
  height: 84px;
  margin: 6px 0 10px;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--bg-canvas);
}

.bg-preview-media {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bg-warn {
  margin: 0;
  color: var(--warning);
  font-size: 13px;
  line-height: 1.7;
}
</style>
