<script setup>
/**
 * SettingsView.vue — 设置页外壳（负责区块组装与底部唯一反馈消息栏）
 */
import { ref } from 'vue'
import '@/styles/settings-shared.css'
import BudgetSettingCard from '@/components/settings/BudgetSettingCard.vue'
import AppearanceSettingCard from '@/components/settings/AppearanceSettingCard.vue'
import BackgroundSettingCard from '@/components/settings/BackgroundSettingCard.vue'
import BackupSettingCard from '@/components/settings/BackupSettingCard.vue'

const msg = ref('')

function setMsg(text) {
  msg.value = text
}
</script>

<template>
  <div class="page settings-page">
    <h2 class="page-title">设置</h2>

    <BudgetSettingCard class="block" @message="setMsg" />
    <AppearanceSettingCard class="block" />
    <BackgroundSettingCard class="block" @message="setMsg" />
    <BackupSettingCard class="block" @message="setMsg" />

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

.msg {
  font-size: 13px;
  color: var(--text-secondary);
  text-align: center;
}
</style>
