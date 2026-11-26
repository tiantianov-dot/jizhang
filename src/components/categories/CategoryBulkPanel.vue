<script setup>
/**
 * CategoryBulkPanel.vue — 分类批量操作面板（归档/删除 & 迁移后删除 + 二次确认）
 */
import { computed } from 'vue'

const props = defineProps({
  selectedCount: { type: Number, default: 0 },
  selectedUsage: {
    type: Object,
    default: () => ({ active: 0, deleted: 0, total: 0 }),
  },
  mode: { type: String, default: 'archive-remove' },
  targetId: { type: String, default: '' },
  migrationTargets: { type: Array, default: () => [] },
  canMigrate: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  confirming: { type: Boolean, default: false },
})

const emit = defineEmits(['update:mode', 'update:targetId', 'request', 'confirm', 'cancel-confirm'])

const targetModel = computed({
  get: () => props.targetId,
  set: (v) => emit('update:targetId', v),
})
</script>

<template>
  <div class="card bulk" data-blur="off">
    <div class="bulk-title">批量操作 · 已选 {{ selectedCount }} 个</div>
    <p class="bulk-sub">有效 {{ selectedUsage.active }} / 回收站 {{ selectedUsage.deleted }}</p>

    <div class="modes">
      <button
        :class="{ on: mode === 'archive-remove' }"
        @click="emit('update:mode', 'archive-remove')"
      >
        归档/删除
      </button>
      <button
        :class="{ on: mode === 'migrate-remove' }"
        :disabled="!canMigrate"
        @click="emit('update:mode', 'migrate-remove')"
      >
        迁移后删除
      </button>
    </div>

    <template v-if="mode === 'migrate-remove'">
      <p class="bulk-hint">目标必须同收支类型、未归档，且不在已选分类中。</p>
      <select v-model="targetModel" class="select" aria-label="迁移目标分类">
        <option value="">选择迁移目标</option>
        <option v-for="t in migrationTargets" :key="t.id" :value="t.id">
          {{ t.emoji }} {{ t.name }}
        </option>
      </select>
    </template>

    <p class="bulk-hint">
      归档/删除：有引用自动归档，无引用硬删；迁移后删除会同时迁移有效与回收站账目。
    </p>
    <button class="btn run" :disabled="busy" @click="emit('request')">
      {{ busy ? '处理中…' : '执行批量操作' }}
    </button>

    <div v-if="confirming" class="confirm">
      <p class="confirm-title">确认对 {{ selectedCount }} 个分类执行？</p>
      <p class="confirm-sub">
        有效 {{ selectedUsage.active }} / 回收站 {{ selectedUsage.deleted }}
      </p>
      <div class="confirm-acts">
        <button class="btn ghost" @click="emit('cancel-confirm')">取消</button>
        <button
          class="btn danger"
          :disabled="busy || (mode === 'migrate-remove' && !targetId)"
          @click="emit('confirm')"
        >
          {{ busy ? '处理中…' : '确认执行' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bulk {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.bulk-title {
  font-size: 14px;
  font-weight: 600;
}

.bulk-sub {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.modes {
  display: flex;
  gap: 8px;
}

.modes button {
  flex: 1;
  padding: 8px 0;
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-edge-2);
  background: var(--glass-well);
  color: var(--text-secondary);
  font-size: 13px;
}

.modes button.on {
  background: var(--glass-active-fill);
  color: var(--on-glass);
  font-weight: 600;
}

.modes button:disabled {
  opacity: 0.4;
}

.bulk-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.select {
  width: 100%;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-edge-2);
  background: var(--glass-well);
  color: var(--on-glass);
  font-size: 13px;
}

.btn.run {
  width: 100%;
  padding: 10px 0;
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-edge-2);
  background: var(--glass-fill);
  color: var(--on-glass);
  font-size: 14px;
}

.btn.run:disabled {
  opacity: 0.5;
}

.confirm {
  padding: 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--danger-confirm-border);
  background: var(--danger-confirm-bg);
}

.confirm-title {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
}

.confirm-sub {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.confirm-acts {
  display: flex;
  gap: 8px;
}

.btn.ghost,
.btn.danger {
  flex: 1;
  padding: 8px 0;
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.btn.ghost {
  border: 1px solid var(--glass-edge-2);
  background: transparent;
  color: var(--text-secondary);
}

.btn.danger {
  border: 1px solid var(--danger-solid);
  background: var(--danger-solid);
  color: #fff;
  font-weight: 600;
}

.btn.danger:disabled {
  opacity: 0.5;
}
</style>
