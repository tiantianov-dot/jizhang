<script setup>
import { computed, ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useRecordsStore } from '@/stores/records'
import { useCategoriesStore } from '@/stores/categories'
import { toFen, stampNow, daysSince } from '@/utils/format'
import * as backup from '@/repositories/backup'

const settings = useSettingsStore()
const records = useRecordsStore()
const categories = useCategoriesStore()

const budgetInput = ref('')
const msg = ref('')

async function saveBudget() {
  const fen = toFen(budgetInput.value || '0')
  await settings.setMonthlyBudget(fen)
  budgetInput.value = ''
  msg.value = fen > 0 ? '预算已保存' : '已取消预算'
}

/* ---------- 备份健康度：提醒只在「有数据」时出现，新用户不制造焦虑 ---------- */

/** 距上次备份的天数（日历日）；null = 从未备份 */
const backupDays = computed(() => (settings.lastBackupAt ? daysSince(settings.lastBackupAt) : null))

/** 提醒状态：never（红，还没备份过）/ stale（黄，超 7 天）/ ok（灰，7 天内） */
const backupStatus = computed(() => {
  if (!records.count) return 'none' // 没有账目，没什么可备份的
  if (backupDays.value === null) return 'never'
  if (backupDays.value > 7) return 'stale'
  return 'ok'
})

const backupStatusText = computed(() => {
  if (backupStatus.value === 'never') return '还没备份过——建议立即导出一份'
  if (backupStatus.value === 'stale') return `已 ${backupDays.value} 天未备份，建议导出一份`
  const d = backupDays.value
  return `上次备份：${d === 0 ? '今天' : `${d} 天前`}`
})

async function doExport() {
  const data = await backup.exportAll()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const file = new File([blob], `jizhang-backup-${stampNow()}.json`, { type: 'application/json' })
  // 优先系统分享（iOS 可存到文件/隔空投送），降级为下载。
  // 只有「真正拿到文件」（分享完成或下载触发）才记录备份时间——用户取消分享不算备份。
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '记账备份' })
      await settings.setLastBackupAt(new Date().toISOString())
      msg.value = '已导出备份'
    } catch {
      msg.value = '已取消分享' // 用户点取消：不记录备份时间
    }
  } else {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000) // 立即 revoke 可能截断下载，延迟释放
    await settings.setLastBackupAt(new Date().toISOString())
    msg.value = '已导出备份'
  }
}

const fileInput = ref(null)

async function doImport(e) {
  const file = e.target.files && e.target.files[0]
  if (!file) return
  try {
    const payload = JSON.parse(await file.text())
    const { added, updated } = await backup.importMerge(payload)
    await Promise.all([records.load(), categories.load(), settings.load()])
    msg.value = `导入完成：新增 ${added} 条，更新 ${updated} 条`
  } catch (err) {
    msg.value = `导入失败：${err.message}`
  } finally {
    e.target.value = ''
  }
}
</script>

<template>
  <div class="page">
    <h2 class="page-title">设置</h2>

    <div class="card block">
      <div class="row">
        <span>月度总预算</span>
        <span class="cur">{{ settings.monthlyBudget ? '¥' + (settings.monthlyBudget / 100).toFixed(2) : '未设置' }}</span>
      </div>
      <div class="row">
        <input v-model="budgetInput" class="input" type="number" inputmode="decimal" placeholder="输入金额（元），0 = 取消" />
        <button class="btn" @click="saveBudget">保存</button>
      </div>
    </div>

    <div class="card block">
      <div class="row"><span>数据备份</span></div>
      <!-- 备份健康度：无账目不显示（nothing to back up），有账目按三态提醒 -->
      <div v-if="backupStatus !== 'none'" class="row bstat">
        <span class="dot" :class="backupStatus"></span>
        <span :class="backupStatus === 'ok' ? 'dim' : 'warn'">{{ backupStatusText }}</span>
      </div>
      <div class="row">
        <button class="btn" @click="doExport">导出 JSON</button>
        <button class="btn" @click="fileInput.click()">导入 JSON</button>
        <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="doImport" />
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

/* 备份健康度三态 */
.bstat {
  justify-content: flex-start;
  font-size: 13px;
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

.dot.stale {
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

.dim {
  color: var(--text-secondary);
}

.input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--glass-edge);
  border-radius: 8px;
  background: rgba(0, 0, 0, .22);
  color: var(--text);
  font-size: 14px;
  padding: 8px 10px;
  outline: none;
}

.btn {
  background: var(--brand);
  color: #fff;
  font-size: 13px;
  padding: 8px 16px;
  border-radius: 8px;
  white-space: nowrap;
}

.btn:active {
  background: var(--brand-strong);
}

.msg {
  font-size: 13px;
  color: var(--text-secondary);
  text-align: center;
}
</style>
