<script setup>
/**
 * RecordMetaBar.vue — 记一笔 / 编辑页共用元信息条（备注 / 日期 / 本机标记）
 *
 * 单根 GlassPanel(chip.meta)，预留 #before-lock / #after-lock 插槽供 AddView
 * 注入剪贴板粘贴与沉浸取景按钮，并通过 :slotted(.pill) / :slotted(.pill.on)
 * 保障插槽按钮在暗/亮极性下与内建按钮共享完全一致的胶囊样式。
 */
import { computed } from 'vue'
import GlassPanel from './GlassPanel.vue'

const props = defineProps({
  /** 备注（v-model:note） */
  note: { type: String, default: '' },
  /** 发生日期 YYYY-MM-DD（v-model:date） */
  date: { type: String, default: '' },
  /** 本机标记：完整备份仍包含；不代表加密或密码保护（v-model:is-private） */
  isPrivate: { type: Boolean, default: false },
})

const emit = defineEmits(['update:note', 'update:date', 'update:isPrivate'])

const noteModel = computed({
  get: () => props.note,
  set: (v) => emit('update:note', v),
})

const dateModel = computed({
  get: () => props.date,
  set: (v) => emit('update:date', v),
})
</script>

<template>
  <GlassPanel shape="chip" class="meta">
    <input v-model="noteModel" class="note" placeholder="备注（可选）" maxlength="30" />
    <div class="right">
      <input v-model="dateModel" class="date" type="date" />
      <slot name="before-lock" />
      <button
        class="lock pill"
        :class="{ on: isPrivate }"
        title="本机标记：完整备份仍包含；不代表加密或密码保护"
        aria-label="本机标记：完整备份仍包含；不代表加密或密码保护"
        @click="emit('update:isPrivate', !isPrivate)"
      >
        {{ isPrivate ? '🔒' : '🔓' }}
      </button>
      <slot name="after-lock" />
    </div>
  </GlassPanel>
</template>

<style scoped>
.meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--glass-radius-chip);
  color: var(--on-glass-2);
  font-size: 12px;
  text-shadow: var(--on-glass-shadow);
  box-shadow: var(--glass-lift-shadow);
}

.meta .right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

.meta .pill,
:slotted(.pill) {
  padding: 3px 8px;
  border-radius: var(--glass-radius-pill);
  background: var(--glass-well);
  color: var(--on-glass-2);
  font-size: 12px;
  line-height: 1.2;
}

.meta .note {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--on-glass);
  font-size: 14px;
  padding: 2px 0;
}

.meta .date {
  border: none;
  outline: none;
  background: transparent;
  color: var(--on-glass-2);
  font-size: 12px;
  width: 7.8em;
  flex: none;
}

.meta .pill.on,
:slotted(.pill.on) {
  background: var(--glass-active-fill);
  color: var(--on-glass);
}

.meta .lock {
  font-size: 17px;
  opacity: 0.55;
}

.meta .lock.on {
  opacity: 1;
}
</style>
