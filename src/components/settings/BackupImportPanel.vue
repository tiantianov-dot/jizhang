<script setup>
/**
 * BackupImportPanel.vue — 数据导入与只读预览确认模块
 *
 * 负责读取备份 JSON、调用 repositories/backup.previewImport 展示只读预览、
 * 用户确认后执行原子导入并重新加载四个 store。
 */
import { ref } from 'vue'
import { useRecordsStore } from '@/stores/records'
import { useCategoriesStore } from '@/stores/categories'
import { useSettingsStore } from '@/stores/settings'
import { useAppearanceStore } from '@/stores/appearance'
import * as backup from '@/repositories/backup'

const emit = defineEmits(['message', 'imported'])

const records = useRecordsStore()
const categories = useCategoriesStore()
const settings = useSettingsStore()
const appearance = useAppearanceStore()

const fileInput = ref(null)
const pendingImport = ref(null)
const importBusy = ref(false)

function openPicker() {
  fileInput.value?.click()
}

defineExpose({ openPicker })

function describeImportErrors(errors) {
  const messages = errors.slice(0, 3).map((item) => item.message)
  const suffix = errors.length > 3 ? `（共 ${errors.length} 项）` : ''
  return `${messages.join('；')}${suffix}`
}

function importSummaryText(summary) {
  const r = summary.records
  const c = summary.categories
  const s = summary.settings
  return [
    `账目 新增 ${r.added} · 更新 ${r.updated} · 跳过 ${r.skipped}`,
    `分类 新增 ${c.added} · 匹配 ${c.matched} · 更新 ${c.updated} · 跳过 ${c.skipped} · 冲突 ${c.conflicts}`,
    `设置 更新 ${s.updated} · 跳过 ${s.skipped}`,
  ].join('；')
}

async function doImport(e) {
  const file = e.target.files && e.target.files[0]
  if (!file) return
  try {
    const payload = JSON.parse(await file.text())
    const preview = await backup.previewImport(payload)
    if (preview.errors.length) {
      emit('message', `导入失败：${describeImportErrors(preview.errors)}`)
      pendingImport.value = null
      return
    }
    pendingImport.value = { payload, summary: preview.summary }
    emit('message', '')
  } catch (err) {
    emit('message', `导入失败：${err.message}`)
    pendingImport.value = null
  } finally {
    e.target.value = ''
  }
}

function cancelImport() {
  if (importBusy.value) return
  pendingImport.value = null
  emit('message', '已取消导入')
}

async function confirmImport() {
  if (!pendingImport.value || importBusy.value) return
  importBusy.value = true
  try {
    const summary = await backup.importMerge(pendingImport.value.payload)
    await Promise.all([records.load(), categories.load(), settings.load(), appearance.load()])
    pendingImport.value = null
    emit('imported', `导入完成：${importSummaryText(summary)}`)
  } catch (err) {
    emit('message', `导入失败：${err.message}`)
  } finally {
    importBusy.value = false
  }
}
</script>

<template>
  <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="doImport" />
  <div v-if="pendingImport" class="import-preview" data-testid="import-preview">
    <p class="preview-title">导入预览（尚未写入）</p>
    <p class="preview-line">
      账目：新增 {{ pendingImport.summary.records.added }} · 更新
      {{ pendingImport.summary.records.updated }} · 跳过
      {{ pendingImport.summary.records.skipped }}
    </p>
    <p class="preview-line">
      其中软删：新增 {{ pendingImport.summary.records.softDeleted.added }} · 更新
      {{ pendingImport.summary.records.softDeleted.updated }}（导入后仍在回收站）
    </p>
    <p class="preview-line">
      分类：新增 {{ pendingImport.summary.categories.added }} · 匹配
      {{ pendingImport.summary.categories.matched }} · 更新
      {{ pendingImport.summary.categories.updated }} · 跳过
      {{ pendingImport.summary.categories.skipped }} · 冲突
      {{ pendingImport.summary.categories.conflicts }}
    </p>
    <p class="preview-line">
      设置：更新 {{ pendingImport.summary.settings.updated }} · 跳过
      {{ pendingImport.summary.settings.skipped }}
    </p>
    <p v-if="pendingImport.summary.conflicts.length" class="preview-warn">
      有
      {{ pendingImport.summary.conflicts.length }}
      个旧默认分类无法唯一匹配，将保留为自定义（不强并）。
    </p>
    <div class="row">
      <button class="btn" :disabled="importBusy" @click="cancelImport">取消</button>
      <button class="btn" :disabled="importBusy" @click="confirmImport">
        {{ importBusy ? '导入中…' : '确认导入' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0;
  font-size: 14px;
}

.import-preview {
  margin: 6px 0 10px;
  padding: 10px 12px;
  border: 1px solid var(--glass-edge-2);
  border-radius: 10px;
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

.btn {
  background: var(--glass-fill);
  border: 1px solid var(--glass-edge-2);
  color: var(--on-glass);
  font-size: 13px;
  padding: 8px 16px;
  border-radius: 8px;
  white-space: nowrap;
  text-shadow: var(--on-glass-shadow);
}

.btn:disabled {
  opacity: 0.55;
}

.btn:active {
  filter: brightness(1.25);
}
</style>
