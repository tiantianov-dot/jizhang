<script setup>
/**
 * CategoriesView.vue — 分类管理（路由 /categories）
 *
 * 列表支持类型/来源/归档筛选与多选；默认分类不可选（repository 也会硬拒绝）。
 * 批量删除沿用既有规则：有引用归档、无引用硬删；也可先迁移全部 active+软删
 * 账目到同类型目标，再硬删源分类。每个源分类独立事务，逐项回报结果。
 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useCategoriesStore } from '@/stores/categories'
import { isBuiltinCategory } from '@/services/builtinCategories'
import {
  filterCategories,
  formatBulkCompletionToast,
  getMigrationTargets,
  summarizeSelectedUsage,
} from '@/services/categoryManagement'
import { useToast } from '@/composables/useToast'
import PageTopbar from '@/components/PageTopbar.vue'
import CategoryForm from '@/components/CategoryForm.vue'
import CategoryFilterCard from '@/components/categories/CategoryFilterCard.vue'
import CategoryListCard from '@/components/categories/CategoryListCard.vue'
import CategoryBulkPanel from '@/components/categories/CategoryBulkPanel.vue'
import CategoryBulkResultCard from '@/components/categories/CategoryBulkResultCard.vue'

const router = useRouter()
const categories = useCategoriesStore()
const { message: toast, show: showToast, clear: clearToast } = useToast({ duration: 4000 })

const formOpen = ref(false)
const editingCat = ref(null)
const typeFilter = ref('all') // all | expense | income
const sourceFilter = ref('all') // all | builtin | custom
const archivedFilter = ref('all') // all | active | archived

const selected = ref(new Set())
const bulkMode = ref('archive-remove') // archive-remove | migrate-remove
const bulkTargetId = ref('')
const bulkConfirm = ref(false)
const bulkResult = ref(null)

// 冷启动直接访问本页时，App.vue 的 load 晚于本组件挂载完成，
// 因此跟随 list 变化重算引用数，而不是只在 onMounted 算一次。
watch(
  () => categories.list.map((c) => c.id).join(','),
  () => categories.loadUsage(),
  { immediate: true },
)

const filtered = computed(() =>
  filterCategories(categories.list, {
    type: typeFilter.value,
    source: sourceFilter.value,
    archived: archivedFilter.value,
  }),
)
const selectable = computed(() => filtered.value.filter((c) => !isBuiltinCategory(c)))
const allVisibleSelected = computed(
  () => selectable.value.length > 0 && selectable.value.every((c) => selected.value.has(c.id)),
)
const selectedIds = computed(() => [...selected.value])
const selectedCats = computed(() => categories.list.filter((c) => selected.value.has(c.id)))
const selectedUsage = computed(() => summarizeSelectedUsage(selectedCats.value, categories.usage))
const migrationTargets = computed(() => getMigrationTargets(categories.list, selected.value))
const canMigrate = computed(() => migrationTargets.value.length > 0)

watch(migrationTargets, (targets) => {
  if (bulkTargetId.value && !targets.some((t) => t.id === bulkTargetId.value)) {
    bulkTargetId.value = ''
  }
  if (bulkMode.value === 'migrate-remove' && !targets.length) {
    bulkMode.value = 'archive-remove'
  }
})

function toggle(id) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
  bulkConfirm.value = false
}

function toggleSelectAll() {
  const next = new Set(selected.value)
  if (allVisibleSelected.value) {
    for (const c of selectable.value) next.delete(c.id)
  } else {
    for (const c of selectable.value) next.add(c.id)
  }
  selected.value = next
  bulkConfirm.value = false
}

function clearSelection() {
  selected.value = new Set()
  bulkConfirm.value = false
  bulkMode.value = 'archive-remove'
  bulkTargetId.value = ''
}

function switchMode(mode) {
  if (mode === 'migrate-remove' && !canMigrate.value) return
  bulkMode.value = mode
  bulkConfirm.value = false
}

function requestBulk() {
  if (!selectedIds.value.length) {
    showToast('先选择分类')
    return
  }
  if (bulkMode.value === 'migrate-remove' && !bulkTargetId.value) {
    showToast('先选择迁移目标')
    return
  }
  bulkConfirm.value = true
}

async function runBulk() {
  if (categories.bulkBusy) return
  const ids = selectedIds.value
  const mode = bulkMode.value
  const targetId = mode === 'migrate-remove' ? bulkTargetId.value : undefined
  const names = new Map(selectedCats.value.map((c) => [c.id, c.name]))
  bulkConfirm.value = false
  bulkResult.value = null
  try {
    const out = await categories.bulkApply({ ids, mode, targetId })
    if (!out) return
    bulkResult.value = out.results.map((item) => ({ ...item, name: names.get(item.id) || item.id }))
    showToast(formatBulkCompletionToast(out.results))
    clearSelection()
  } catch (err) {
    showToast(err.message)
  }
}

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
    <PageTopbar title="分类管理" @back="router.back()" />

    <CategoryFilterCard
      v-model:type-filter="typeFilter"
      v-model:source-filter="sourceFilter"
      v-model:archived-filter="archivedFilter"
    />

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

    <div class="selbar">
      <button class="selact" :disabled="!selectable.length" @click="toggleSelectAll">
        {{ allVisibleSelected ? '取消全选' : '全选当前' }}
      </button>
      <span class="selcount">已选 {{ selectedIds.length }} 个</span>
      <button v-if="selectedIds.length" class="selact" @click="clearSelection">清空</button>
    </div>

    <CategoryListCard
      :items="filtered"
      :selected-ids="selected"
      :usage-map="categories.usage"
      @toggle="toggle"
      @edit="openEdit"
      @restore="restore"
    />

    <CategoryBulkPanel
      v-if="selectedIds.length"
      :selected-count="selectedIds.length"
      :selected-usage="selectedUsage"
      :mode="bulkMode"
      :target-id="bulkTargetId"
      :migration-targets="migrationTargets"
      :can-migrate="canMigrate"
      :busy="categories.bulkBusy"
      :confirming="bulkConfirm"
      @update:mode="switchMode"
      @update:target-id="bulkTargetId = $event"
      @request="requestBulk"
      @confirm="runBulk"
      @cancel-confirm="bulkConfirm = false"
    />

    <CategoryBulkResultCard v-if="bulkResult" :results="bulkResult" />

    <button v-if="toast" class="toast" @click="clearToast">{{ toast }}</button>
  </div>
</template>

<style scoped>
.cats {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.btn.add {
  background: var(--glass-fill);
  border: 1px dashed var(--glass-edge-2);
  color: var(--on-glass);
  font-size: 14px;
  padding: 10px 0;
  border-radius: var(--radius-md);
  text-shadow: var(--on-glass-shadow);
}

.selbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 2px;
}

.selact {
  font-size: 12px;
  color: var(--on-glass);
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-edge-2);
  background: var(--glass-well);
}

.selact:disabled {
  opacity: 0.45;
}

.selcount {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
