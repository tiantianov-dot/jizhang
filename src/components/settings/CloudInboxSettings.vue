<script setup>
/**
 * CloudInboxSettings.vue — 云端自动记账收件箱设置卡片
 *
 * 仅对接 stores/cloudInbox，遵循 V5 液态玻璃与 settings-shared.css 样式。
 */
import { computed, ref, watch } from 'vue'
import { useCloudInboxStore } from '@/stores/cloudInbox'
import { normalizeInboxUrl } from '@/services/cloudInbox'
import { formatLocalDateTime } from '@/utils/format'

const emit = defineEmits(['message'])

const cloudInbox = useCloudInboxStore()
const urlInput = ref('')
const tokenInput = ref('')
const showToken = ref(false)

watch(
  () => [cloudInbox.url, cloudInbox.token],
  ([nextUrl, nextToken]) => {
    urlInput.value = nextUrl || ''
    tokenInput.value = nextToken || ''
  },
  { immediate: true },
)

const badgeText = computed(() => {
  if (cloudInbox.syncing) return '同步中…'
  return cloudInbox.configured ? '已配置' : '未配置'
})

const statusText = computed(() => {
  if (!cloudInbox.lastSyncAt) return '尚未同步'
  const formattedTime = formatLocalDateTime(cloudInbox.lastSyncAt) || '时间未知'
  if (cloudInbox.lastResult === 'error') {
    return `${formattedTime} · 失败：${cloudInbox.lastError || '请稍后重试'}`
  }
  const detail = cloudInbox.lastCount > 0 ? `入账 ${cloudInbox.lastCount} 笔` : '无新增账单'
  return cloudInbox.lastError
    ? `${formattedTime} · ${detail}（${cloudInbox.lastError}）`
    : `${formattedTime} · ${detail}`
})

function readDraftConfig() {
  const rawUrl = urlInput.value.trim()
  const normalizedUrl = normalizeInboxUrl(rawUrl)
  const token = tokenInput.value.trim()
  return { rawUrl, normalizedUrl, token }
}

function validateDraft() {
  const { rawUrl, normalizedUrl, token } = readDraftConfig()
  if (!rawUrl || !normalizedUrl) {
    emit('message', '请输入有效的 http/https 收件箱地址')
    return null
  }
  if (!token) {
    emit('message', '请输入同步密码')
    return null
  }
  return { url: normalizedUrl, token }
}

async function ensureSavedForSync() {
  const draft = validateDraft()
  if (!draft) return false
  if (draft.url !== cloudInbox.url || draft.token !== cloudInbox.token) {
    await cloudInbox.saveConfig(draft)
  }
  return true
}

async function handleSave() {
  const draft = validateDraft()
  if (!draft) return
  await cloudInbox.saveConfig(draft)
  emit('message', '收件箱配置已保存')
}

async function handleTest() {
  const draft = validateDraft()
  if (!draft) return
  const res = await cloudInbox.testConnection(draft)
  if (res.ok) {
    emit('message', `连接成功（云端待拉取 ${res.pendingCount} 笔）`)
  } else {
    emit('message', res.error || '连接测试失败')
  }
}

async function handleSyncCategories() {
  if (!(await ensureSavedForSync())) return
  const res = await cloudInbox.syncCategories()
  if (res.ok) {
    emit('message', `已推送分类（支出 ${res.expenseCount} / 收入 ${res.incomeCount}）`)
  } else {
    emit('message', res.error || '同步分类失败')
  }
}

async function handleSyncNow() {
  if (!(await ensureSavedForSync())) return
  const res = await cloudInbox.syncNow({ silent: false })
  if (!res.ok) {
    emit('message', res.error || '同步失败')
    return
  }
  if (res.synced > 0) {
    emit('message', `已同步 ${res.synced} 笔云端账单`)
  } else if (res.skippedDuplicates > 0) {
    emit('message', '云端已清理重复账单，本地无新增')
  } else {
    emit('message', '云端暂无新账单')
  }
}

async function handleClear() {
  await cloudInbox.clearConfig()
  urlInput.value = ''
  tokenInput.value = ''
  emit('message', '已清除云端收件箱配置')
}
</script>

<template>
  <div class="card">
    <div class="row">
      <span>云端自动记账</span>
      <span class="cur" data-testid="inbox-config-badge">{{ badgeText }}</span>
    </div>

    <label class="field">
      <span class="field-label">收件箱地址</span>
      <input
        v-model="urlInput"
        class="input"
        type="url"
        autocomplete="off"
        placeholder="https://<云端地址>"
        data-testid="inbox-url"
      />
    </label>

    <label class="field">
      <span class="field-label">同步密码</span>
      <div class="token-row">
        <input
          v-model="tokenInput"
          class="input"
          :type="showToken ? 'text' : 'password'"
          autocomplete="off"
          placeholder="输入同步密码"
          data-testid="inbox-token"
        />
        <button type="button" class="btn toggle-btn" @click="showToken = !showToken">
          {{ showToken ? '隐藏' : '显示' }}
        </button>
      </div>
    </label>

    <div class="inbox-actions">
      <button type="button" class="btn" data-testid="inbox-save" @click="handleSave">
        保存配置
      </button>
      <button
        type="button"
        class="btn"
        :disabled="cloudInbox.testing"
        data-testid="inbox-test"
        @click="handleTest"
      >
        {{ cloudInbox.testing ? '测试中…' : '测试连接' }}
      </button>
      <button
        type="button"
        class="btn"
        :disabled="cloudInbox.syncingCategories"
        data-testid="inbox-sync-categories"
        @click="handleSyncCategories"
      >
        {{ cloudInbox.syncingCategories ? '推送中…' : '同步分类' }}
      </button>
      <button
        type="button"
        class="btn"
        :disabled="cloudInbox.syncing"
        data-testid="inbox-sync-now"
        @click="handleSyncNow"
      >
        {{ cloudInbox.syncing ? '同步中…' : '立即同步' }}
      </button>
      <button
        v-if="cloudInbox.configured"
        type="button"
        class="btn clear-btn"
        data-testid="inbox-clear"
        @click="handleClear"
      >
        清除配置
      </button>
    </div>

    <div class="row status-row">
      <span>上次同步</span>
      <span class="cur status-val" data-testid="inbox-status">{{ statusText }}</span>
    </div>

    <p class="placeholder inbox-note">
      地址与密码仅存于本机浏览器，导出备份时不会包含。云端仅暂存待拉取账单，入账后自动清理。
    </p>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.field-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.token-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input {
  flex: 1;
  width: 100%;
  min-width: 0;
  border: 1px solid var(--glass-edge-2);
  border-radius: var(--radius-sm);
  background: var(--glass-well);
  color: var(--text);
  font-size: 14px;
  padding: 8px 10px;
  outline: none;
}

.toggle-btn {
  flex: none;
  padding: 8px 12px;
}

.inbox-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.inbox-actions .btn {
  width: 100%;
  padding: 8px 10px;
  text-align: center;
}

.clear-btn {
  grid-column: 1 / -1;
}

.status-row {
  margin-top: 6px;
}

.status-val {
  min-width: 0;
  text-align: right;
  word-break: break-word;
}

.inbox-note {
  margin: 4px 0 0;
  font-size: 12px;
}
</style>
