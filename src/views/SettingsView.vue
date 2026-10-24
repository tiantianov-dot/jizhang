<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useRecordsStore } from '@/stores/records'
import { useCategoriesStore } from '@/stores/categories'
import { useAppearanceStore } from '@/stores/appearance'
import { useBackgroundStore } from '@/stores/background'
import { toFen, stampNow } from '@/utils/format'
import * as backup from '@/repositories/backup'
import GlassPanel from '@/components/GlassPanel.vue'
import { coverRequirement } from '@/services/background'
import { drawStarfield } from '@/services/starfield'
import { backupAgeDays, getBackupStatus } from '@/services/backupStatus'
import { classifyShareOutcome, shouldPersistBackup } from '@/services/backupExport'

const settings = useSettingsStore()
const records = useRecordsStore()
const categories = useCategoriesStore()
const appearance = useAppearanceStore()
const background = useBackgroundStore()

const budgetInput = ref('')
const msg = ref('')

/* ---------- 外观：滑块值跟随 store；拖动只 preview，松手才持久化 ---------- */

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

async function saveBudget() {
  const fen = toFen(budgetInput.value || '0')
  await settings.setMonthlyBudget(fen)
  budgetInput.value = ''
  msg.value = fen > 0 ? '预算已保存' : '已取消预算'
}

/* ---------- 背景素材：懒挂载文件输入，选完即卸载 ---------- */

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

onMounted(() => nextTick(drawPreview))
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

const bgRequirement = coverRequirement({
  innerWidth: window.innerWidth,
  innerHeight: window.innerHeight,
  dpr: window.devicePixelRatio,
  screenW: window.screen && window.screen.width,
  screenH: window.screen && window.screen.height,
  coarse: typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
})

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
    msg.value = '背景已更新'
  } catch (err) {
    msg.value = err.message
  }
}

async function removeBg() {
  await background.remove()
  msg.value = '已恢复默认星空'
}

/* ---------- 备份健康度：事实状态与提醒开关分离，空账本也显示 ---------- */

const backupStatus = computed(() =>
  getBackupStatus({
    lastBackupAt: settings.lastBackupAt,
    days: settings.backupReminderDays,
    now: Date.now(),
  }),
)

const backupAge = computed(() => backupAgeDays(settings.lastBackupAt))

const backupStatusText = computed(() => {
  if (backupStatus.value === 'never') return '尚未备份'
  if (backupStatus.value === 'stale') {
    return `已 ${backupAge.value} 天未备份（周期 ${settings.backupReminderDays} 天）`
  }
  if (backupStatus.value === 'ok') {
    return backupAge.value === 0 ? '上次备份：今天' : `上次备份：${backupAge.value} 天前`
  }
  return '上次备份时间无法识别，建议重新导出'
})

/** ISO → 本地 YYYY-MM-DD HH:mm；无法解析返回空串 */
function formatBackupTime(iso) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const lastBackupText = computed(() => {
  if (!settings.lastBackupAt) return '尚未备份'
  return formatBackupTime(settings.lastBackupAt) || '时间无法识别'
})

async function setReminderDays(e) {
  const days = Number(e.target.value)
  try {
    await settings.setBackupReminderDays(days)
    msg.value = `备份提醒周期已设为 ${settings.backupReminderDays} 天`
  } catch {
    msg.value = '提醒周期未保存，请检查浏览器存储后重试'
  }
}

async function toggleReminder() {
  try {
    await settings.setBackupReminderEnabled(!settings.backupReminderEnabled)
    msg.value = settings.backupReminderEnabled ? '已开启备份提醒' : '已关闭备份提醒'
  } catch {
    msg.value = '提醒开关未保存，请检查浏览器存储后重试'
  }
}

const exportBusy = ref(false)
const downloadPending = ref(false)

/** 只在文件确实已生成后调用；持久化失败不能显示成备份成功 */
async function persistBackupTime() {
  try {
    await settings.setLastBackupAt(new Date().toISOString())
    downloadPending.value = false
    return true
  } catch {
    msg.value = '备份已生成，但状态未更新'
    return false
  }
}

async function doExport() {
  if (exportBusy.value) return
  exportBusy.value = true
  try {
    const data = await backup.exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const file = new File([blob], `jizhang-backup-${stampNow()}.json`, {
      type: 'application/json',
    })
    // 优先系统分享（iOS 可存到文件/隔空投送），降级为下载。
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      let outcome = 'saved'
      try {
        await navigator.share({ files: [file], title: '记账备份' })
      } catch (err) {
        outcome = classifyShareOutcome(err)
        msg.value =
          outcome === 'cancelled' ? '已取消分享，未更新备份时间' : '分享失败，未更新备份时间'
        return
      }
      if (shouldPersistBackup({ method: 'share', outcome })) {
        if (await persistBackupTime()) msg.value = '已导出备份，请确认文件已保存'
      }
      return
    }

    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000) // 立即 revoke 可能截断下载，延迟释放
    // 下载无法得知用户是否真的保存成功：不自动记时间，等一次显式确认
    downloadPending.value = true
    msg.value = '已生成下载，请确认文件已保存'
  } catch (err) {
    msg.value = `导出失败：${err.message}`
  } finally {
    exportBusy.value = false
  }
}

async function confirmDownloaded() {
  if (!shouldPersistBackup({ method: 'download', confirmed: true })) return
  if (await persistBackupTime()) msg.value = '备份时间已更新'
}

const fileInput = ref(null)
const pendingImport = ref(null)
const importBusy = ref(false)

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
      msg.value = `导入失败：${describeImportErrors(preview.errors)}`
      pendingImport.value = null
      return
    }
    pendingImport.value = { payload, summary: preview.summary }
    msg.value = ''
  } catch (err) {
    msg.value = `导入失败：${err.message}`
    pendingImport.value = null
  } finally {
    e.target.value = ''
  }
}

function cancelImport() {
  if (importBusy.value) return
  pendingImport.value = null
  msg.value = '已取消导入'
}

async function confirmImport() {
  if (!pendingImport.value || importBusy.value) return
  importBusy.value = true
  try {
    const summary = await backup.importMerge(pendingImport.value.payload)
    await Promise.all([records.load(), categories.load(), settings.load(), appearance.load()])
    pendingImport.value = null
    msg.value = `导入完成：${importSummaryText(summary)}`
  } catch (err) {
    msg.value = `导入失败：${err.message}`
  } finally {
    importBusy.value = false
  }
}
</script>

<template>
  <div class="page">
    <h2 class="page-title">设置</h2>

    <div class="card block">
      <div class="row">
        <span>月度总预算</span>
        <span class="cur">{{
          settings.monthlyBudget ? '¥' + (settings.monthlyBudget / 100).toFixed(2) : '未设置'
        }}</span>
      </div>
      <div class="row">
        <input
          v-model="budgetInput"
          class="input"
          type="number"
          inputmode="decimal"
          placeholder="输入金额（元），0 = 取消"
        />
        <button class="btn" @click="saveBudget">保存</button>
      </div>
    </div>

    <div class="card block" data-blur="off">
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

    <div class="card block">
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

    <div class="card block">
      <div class="row">
        <span>数据备份</span>
        <span class="cur" data-testid="backup-last-at">上次导出：{{ lastBackupText }}</span>
      </div>
      <!-- 事实状态：空账本也显示「尚未备份」；关闭提醒时只隐藏警示，仍保留上次导出时间 -->
      <div
        v-if="settings.backupReminderEnabled"
        class="row bstat"
        data-testid="backup-status"
        :data-status="backupStatus"
      >
        <span class="dot" :class="backupStatus"></span>
        <span :class="backupStatus === 'ok' ? 'dim' : 'warn'">{{ backupStatusText }}</span>
      </div>
      <div class="row">
        <span>提醒周期</span>
        <select
          class="select"
          :value="settings.backupReminderDays"
          aria-label="备份提醒周期"
          data-testid="backup-days"
          @change="setReminderDays"
        >
          <option v-for="d in [3, 7, 14, 30]" :key="d" :value="d">{{ d }} 天</option>
        </select>
      </div>
      <div class="row">
        <span>备份提醒</span>
        <button
          class="btn"
          :aria-pressed="settings.backupReminderEnabled"
          data-testid="backup-reminder-toggle"
          @click="toggleReminder"
        >
          {{ settings.backupReminderEnabled ? '已开启' : '已关闭' }}
        </button>
      </div>
      <div class="row">
        <button class="btn" :disabled="exportBusy" data-testid="backup-export" @click="doExport">
          {{ exportBusy ? '导出中…' : '导出 JSON' }}
        </button>
        <button class="btn" @click="fileInput.click()">导入 JSON</button>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          hidden
          @change="doImport"
        />
      </div>
      <button
        v-if="downloadPending"
        class="btn confirm"
        data-testid="backup-confirm-saved"
        @click="confirmDownloaded"
      >
        我已保存，更新备份时间
      </button>
      <div v-if="pendingImport" class="import-preview" data-testid="import-preview">
        <p class="preview-title">导入预览（尚未写入）</p>
        <p class="preview-line">
          账目：新增 {{ pendingImport.summary.records.added }} · 更新
          {{ pendingImport.summary.records.updated }} · 跳过
          {{ pendingImport.summary.records.skipped }}
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
      <p class="placeholder">
        数据只存在这台设备的浏览器里（IndexedDB）。清缓存、换设备前请先导出——这是底线功能。<br />
        当前账目 {{ records.count }} 条 · 分类 {{ categories.list.length }} 个（含已归档）。
      </p>
    </div>

    <div class="card block">
      <RouterLink class="link-row" to="/categories">
        <span>分类管理</span>
        <span class="arrow">›</span>
      </RouterLink>
    </div>

    <p v-if="msg" class="msg">{{ msg }}</p>
  </div>
</template>

<style scoped>
.block {
  margin-bottom: 10px;
}

.link-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
  font-size: 14px;
  color: var(--text);
  text-decoration: none;
}

.arrow {
  color: var(--text-secondary);
  font-size: 18px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0;
  font-size: 14px;
}

.cur {
  color: var(--text-secondary);
  font-size: 13px;
}

/* ---------- 外观：实时预览 + 两条独立滑块 ---------- */

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

/* 背景预览卡：零 backdrop-filter、非 fixed */
.bg-preview {
  height: 84px;
  margin: 6px 0 10px;
  border-radius: 12px;
  overflow: hidden;
  background: #05070d;
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

.preview-glass {
  position: absolute;
  left: 14px;
  right: 14px;
  top: 18px;
  bottom: 18px;
  border-radius: 999px;
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

/* 备份健康度三态 */
.bstat {
  justify-content: flex-start;
  font-size: 13px;
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

.dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 8px;
}

.dot.never {
  background: var(--danger);
}

.dot.stale,
.dot.unknown {
  background: var(--warning);
}

.dot.ok {
  background: var(--brand);
  opacity: 0.6;
}

.dot.never + span {
  color: var(--danger);
}

.dot.stale + span {
  color: var(--warning);
}

.warn {
  color: var(--warning);
}

.dim {
  color: var(--text-secondary);
}

.select {
  border: 1px solid var(--glass-edge-2);
  border-radius: 8px;
  background: var(--glass-well);
  color: var(--text);
  font-size: 13px;
  padding: 6px 10px;
  outline: none;
}

.btn.confirm {
  width: 100%;
  margin: 6px 0 2px;
}

.btn:disabled {
  opacity: 0.55;
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

.btn:active {
  filter: brightness(1.25);
}

.msg {
  font-size: 13px;
  color: var(--text-secondary);
  text-align: center;
}
</style>
