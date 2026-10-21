<script setup>
/**
 * CategoriesView.vue — 分类管理（路由 /categories）
 *
 * 列出未归档的支出/收入分类（可编辑、可删除）与已归档分类（可恢复）。
 * 删除策略由 repository 决定：有流水引用 → 归档（历史账目保留原分类名与 emoji），
 * 无引用 → 硬删。表单内嵌（见 CategoryForm），不做子路由、不做 modal。
 */
import { onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useCategoriesStore } from '@/stores/categories'
import { countByCategory } from '@/repositories/records'
import CategoryForm from '@/components/CategoryForm.vue'

const router = useRouter()
const categories = useCategoriesStore()

/** 各分类的流水引用数：与 repository 的归档判定同源（含已软删除的账目） */
const counts = ref({})
const toast = ref('')
const formOpen = ref(false)
const editingCat = ref(null)

let toastTimer = null
function showToast(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 4000)
}

onUnmounted(() => clearTimeout(toastTimer))

async function refreshCounts() {
  const ids = categories.list.map((c) => c.id)
  counts.value = Object.fromEntries(
    await Promise.all(ids.map(async (id) => [id, await countByCategory(id)])),
  )
}

// 冷启动直接访问本页时，App.vue 的 load 晚于本组件挂载完成，
// 因此跟随 list 变化重算，而不是只在 onMounted 算一次。
watch(() => categories.list.map((c) => c.id).join(','), refreshCounts, { immediate: true })

function openCreate() {
  editingCat.value = null
  formOpen.value = true
}

function openEdit(c) {
  editingCat.value = c
  formOpen.value = true
}

function closeForm() {
  formOpen.value = false
  editingCat.value = null
}

function onDone(msg) {
  closeForm()
  showToast(msg)
}

async function restore(c) {
  await categories.save({ ...c, archived: false })
  showToast('已恢复到记账页')
}
</script>

<template>
  <div class="page cats">
    <div class="topbar">
      <button class="back" @click="router.back()">‹ 返回</button>
      <h2 class="page-title">分类管理</h2>
    </div>

    <!-- 新增 / 编辑表单：同一张卡，靠 key 强制重建，避免残留上一次的输入 -->
    <CategoryForm
      v-if="formOpen"
      :key="editingCat ? editingCat.id : 'new'"
      :cat="editingCat"
      @done="onDone"
      @notice="showToast"
      @cancel="closeForm"
    />
    <button v-else class="btn add" @click="openCreate">＋ 新增分类</button>

    <div class="sec">支出分类</div>
    <div class="card rows" data-blur="off">
      <div v-for="c in categories.expense" :key="c.id" class="row">
        <span class="emoji">{{ c.emoji }}</span>
        <span class="name">{{ c.name }}</span>
        <span class="count">{{ counts[c.id] || 0 }} 笔</span>
        <button class="act" @click="openEdit(c)">编辑</button>
      </div>
      <p v-if="!categories.expense.length" class="placeholder">暂无支出分类</p>
    </div>

    <div class="sec">收入分类</div>
    <div class="card rows" data-blur="off">
      <div v-for="c in categories.income" :key="c.id" class="row">
        <span class="emoji">{{ c.emoji }}</span>
        <span class="name">{{ c.name }}</span>
        <span class="count">{{ counts[c.id] || 0 }} 笔</span>
        <button class="act" @click="openEdit(c)">编辑</button>
      </div>
      <p v-if="!categories.income.length" class="placeholder">暂无收入分类</p>
    </div>

    <template v-if="categories.archived.length">
      <div class="sec">已归档</div>
      <div class="card rows" data-blur="off">
        <div v-for="c in categories.archived" :key="c.id" class="row muted">
          <span class="emoji">{{ c.emoji }}</span>
          <span class="name">{{ c.name }}</span>
          <span class="count">{{ counts[c.id] || 0 }} 笔</span>
          <button class="act" @click="restore(c)">恢复</button>
        </div>
      </div>
    </template>

    <button v-if="toast" class="toast" @click="toast = ''">{{ toast }}</button>
  </div>
</template>

<style scoped>
.cats {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.back {
  font-size: 15px;
  color: var(--text-secondary);
  padding: 8px 0;
}

.topbar .page-title {
  margin: 0;
}

.sec {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 2px 4px 0;
}

.rows {
  padding: 2px 12px;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 8px 0;
  border-bottom: 1px solid var(--glass-edge-2);
}

.row:last-child {
  border-bottom: none;
}

.emoji {
  font-size: 20px;
}

.name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row.muted .name {
  color: var(--text-secondary);
}

.count {
  font-size: 12px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.act {
  font-size: 13px;
  color: var(--on-glass);
  padding: 8px 0 8px 10px;
}

.btn.add {
  background: var(--glass-fill);
  border: 1px dashed var(--glass-edge-2);
  color: var(--on-glass);
  font-size: 14px;
  padding: 10px 0;
  border-radius: 10px;
  text-shadow: var(--on-glass-shadow);
}
</style>
