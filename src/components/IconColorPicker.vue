<script setup>
/**
 * IconColorPicker.vue — 分类的图标与配色选择
 *
 * 预设取自种子分类的色板；两项都可留空，由调用方兜底
 * （emoji → 📦，颜色 → 默认灰）。
 */
import { computed } from 'vue'

const props = defineProps({
  emoji: { type: String, default: '' },
  color: { type: String, default: '' },
})

const emit = defineEmits(['update:emoji', 'update:color'])

const EMOJIS = ['🍚', '🚌', '🛍️', '🧻', '🏠', '🎮', '💊', '🎁', '📚', '📱']
const COLORS = [
  '#D85A30',
  '#185FA5',
  '#993556',
  '#854F0B',
  '#534AB7',
  '#0F6E56',
  '#A32D2D',
  '#D4537E',
]

const emojiText = computed({
  get: () => props.emoji,
  set: (v) => emit('update:emoji', v),
})
</script>

<template>
  <div class="field">
    <span class="label">图标</span>
    <input v-model="emojiText" class="input sm" maxlength="4" placeholder="📦" />
  </div>
  <div class="picks">
    <button
      v-for="e in EMOJIS"
      :key="e"
      class="pick"
      :class="{ on: emoji === e }"
      @click="emit('update:emoji', e)"
    >
      {{ e }}
    </button>
  </div>

  <div class="field"><span class="label">颜色</span></div>
  <div class="picks">
    <button
      v-for="c in COLORS"
      :key="c"
      class="pick round"
      :class="{ on: color === c }"
      :style="{ background: c }"
      @click="emit('update:color', c)"
    />
    <button class="pick def" :class="{ on: !color }" @click="emit('update:color', '')">默认</button>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.label {
  flex: none;
  width: 2.6em;
  font-size: 13px;
  color: var(--text-secondary);
}

.input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--glass-edge-2);
  border-radius: 8px;
  background: var(--glass-well);
  color: var(--text);
  font-size: 14px;
  padding: 8px 10px;
  outline: none;
}

.sm {
  flex: none;
  width: 4.5em;
  text-align: center;
}

.picks {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pick {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  border: 1.5px solid var(--glass-edge-2);
  background: var(--glass-well);
  font-size: 17px;
  line-height: 1;
}

.pick.on {
  border-color: var(--glass-edge-3);
}

.round {
  border-radius: 50%;
}

.def {
  width: auto;
  padding: 0 10px;
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 12px;
}
</style>
