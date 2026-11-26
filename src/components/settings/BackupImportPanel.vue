<script setup>
/**
 * BackupImportPanel.vue — 数据导入与只读预览确认模块
 *
 * 保留设置页唯一常驻隐藏 input[type=file]；预览、原子导入与 4 个业务 store 重载均委托 stores/backup。
 */
import { onUnmounted, ref } from 'vue'
import { useBackupStore } from '@/stores/backup'
import { describeImportErrors, formatImportSummary } from '@/services/backupFormat'

const emit = defineEmits(['message', 'imported'])

const backup = useBackupStore()
const fileInput = ref(null)

function openPicker() {
  fileInput.value?.click()
}

defineExpose({ openPicker })

onUnmounted(() => {
  backup.cancelImport()
})

async function doImport(e) {
  const file = e.target.files && e.target.files[0]
  if (!file) return
  try {
    const payload = JSON.parse(await file.text())
    const result = await backup.previewImport(payload)
    if (!result.ok) {
      emit('message', `导入失败：${describeImportErrors(result.errors)}`)
      return
    }
    emit('message', '')
  } catch (err) {
    backup.cancelImport()
    emit('message', `导入失败：${err.message}`)
  } finally {
    e.target.value = ''
  }
}

function cancelImport() {
  if (!backup.cancelImport()) return
  emit('message', '已取消导入')
}

async function confirmImport() {
  try {
    const summary = await backup.confirmImport()
    if (!summary) return
    emit('imported', `导入完成：${formatImportSummary(summary)}`)
  } catch (err) {
    emit('message', `导入失败：${err.message}`)
  }
}
</script>

<template>
  <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="doImport" />
  <div v-if="backup.pendingImport" class="import-preview" data-testid="import-preview">
    <p class="preview-title">导入预览（尚未写入）</p>
    <p class="preview-line">
      账目：新增 {{ backup.pendingImport.summary.records.added }} · 更新
      {{ backup.pendingImport.summary.records.updated }} · 跳过
      {{ backup.pendingImport.summary.records.skipped }}
    </p>
    <p class="preview-line">
      其中软删：新增 {{ backup.pendingImport.summary.records.softDeleted.added }} · 更新
      {{ backup.pendingImport.summary.records.softDeleted.updated }}（导入后仍在回收站）
    </p>
    <p class="preview-line">
      分类：新增 {{ backup.pendingImport.summary.categories.added }} · 匹配
      {{ backup.pendingImport.summary.categories.matched }} · 更新
      {{ backup.pendingImport.summary.categories.updated }} · 跳过
      {{ backup.pendingImport.summary.categories.skipped }} · 冲突
      {{ backup.pendingImport.summary.categories.conflicts }}
    </p>
    <p class="preview-line">
      设置：更新 {{ backup.pendingImport.summary.settings.updated }} · 跳过
      {{ backup.pendingImport.summary.settings.skipped }}
    </p>
    <p v-if="backup.pendingImport.summary.conflicts.length" class="preview-warn">
      有
      {{ backup.pendingImport.summary.conflicts.length }}
      个旧默认分类无法唯一匹配，将保留为自定义（不强并）。
    </p>
    <div class="row">
      <button class="btn" :disabled="backup.importBusy" @click="cancelImport">取消</button>
      <button class="btn" :disabled="backup.importBusy" @click="confirmImport">
        {{ backup.importBusy ? '导入中…' : '确认导入' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.import-preview {
  margin: 6px 0 10px;
  padding: 10px 12px;
  border: 1px solid var(--glass-edge-2);
  border-radius: var(--radius-md);
  background: var(--glass-well);
}

.preview-title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
}

.preview-line {
  margin: 2px 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.preview-warn {
  margin: 6px 0;
  font-size: 12px;
  color: var(--warning);
  line-height: 1.6;
}
</style>
