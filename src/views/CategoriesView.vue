<script setup>
/**
 * CategoriesView.vue — 分类管理（路由 /categories）
 *
 * 列表支持类型/来源/归档筛选与多选；默认分类不可选（repository 也会硬拒绝）。
 * 批量删除沿用既有规则：有引用归档、无引用硬删；也可先迁移全部 active+软删
 * 账目到同类型目标，再硬删源分类。每个源分类独立事务，逐项回报结果。
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useCategoriesStore } from '@/stores/categories'
import { isBuiltinCategory } from '@/services/builtinCategories'
import CategoryForm from '@/components/CategoryForm.vue'

const router = useRouter()
const categories = useCategoriesStore()

const toast = ref('')
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

let toastTimer = null
function showToast(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 4000)
}

onUnmounted(() => clearTimeout(toastTimer))

// 冷启动直接访问本页时，App.vue 的 load 晚于本组件挂载完成，
// 因此跟随 list 变化重算引用数，而不是只在 onMounted 算一次。
watch(
  () => categories.list.map((c) => c.id).join(','),
  () => categories.loadUsage(),
  { immediate: true },
)

const filtered = computed(() =>
  categories.list.filter((c) => {
    if (typeFilter.value !== 'all' && c.type !== typeFilter.value) return false
    if (sourceFilter.value === 'builtin' && !isBuiltinCategory(c)) return false
    if (sourceFilter.value === 'custom' && isBuiltinCategory(c)) return false
    if (archivedFilter.value === 'active' && c.archived) return false
    if (archivedFilter.value === 'archived' && !c.archived) return false
    return true
  }),
)

const selectable = computed(() => filtered.value.filter((c) => !isBuiltinCategory(c)))
const allVisibleSelected = computed(
  () => selectable.value.length > 0 && selectable.value.every((c) => selected.value.has(c.id)),
)
const selectedIds = computed(() => [...selected.value])
const selectedCats = computed(() => categories.list.filter((c) => selected.value.has(c.id)))

const selectedUsage = computed(() => {
  let active = 0
  let deleted = 0
  for (const c of selectedCats.value) {
    const usage = categories.usage[c.id]
    if (!usage) continue
    active += usage.active
    deleted += usage.deleted
  }
  return { active, deleted, total: active + deleted }
})

const selectedTypes = computed(() => new Set(selectedCats.value.map((c) => c.type)))

/** 迁移目标：同类型、未归档、不在已选集合；选中多类型时不可迁移 */
const migrationTargets = computed(() => {
  if (selectedTypes.value.size !== 1) return []
  const type = [...selectedTypes.value][0]
  return categories.list.filter((c) => c.type === type && !c.archived && !selected.value.has(c.id))
})
const canMigrate = computed(
  () =>
    selectedIds.value.length > 0 &&
    selectedTypes.value.size === 1 &&
    migrationTargets.value.length > 0,
)

watch(migrationTargets, (targets) => {
  if (bulkTargetId.value && !targets.some((t) => t.id === bulkTargetId.value)) {
    bulkTargetId.value = ''
  }
  if (bulkMode.value === 'migrate-remove' && !targets.length) {
    bulkMode.value = 'archive-remove'
  }
})

function usageOf(c) {
  return categories.usage[c.id] || { active: 0, deleted: 0, total: 0 }
}

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
    bulkResult.value = out.results.map((item) => ({
      ...item,
      name: names.get(item.id) || item.id,
    }))
    const blocked = out.results.filter(
      (item) => item.status === 'failed' || item.status === 'protected',
    ).length
    showToast(
      blocked
        ? `批量完成：${out.results.length - blocked} 项成功，${blocked} 项未执行`
        : `批量完成：${out.results.length} 项`,
    )
    clearSelection()
  } catch (err) {
    showToast(err.message)
  }
}

function statusText(status) {
  if (status === 'archived') return '已归档（有引用）'
  if (status === 'deleted') return '已删除（无引用）'
  if (status === 'migrated-deleted') return '已迁移并删除'
  if (status === 'protected') return '内置分类，受保护'
  return '失败'
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
    <div class="topbar">
      <button class="back" @click="router.back()">‹ 返回</button>
      <h2 class="page-title">分类管理</h2>
    </div>

    <div class="card filters" data-blur="off">
      <div class="fgroup">
        <span class="flabel">类型</span>
        <button :class="{ on: typeFilter === 'all' }" @click="typeFilter = 'all'">全部</button>
        <button :class="{ on: typeFilter === 'expense' }" @click="typeFilter = 'expense'">
          支出
        </button>
        <button :class="{ on: typeFilter === 'income' }" @click="typeFilter = 'income'">
          收入
        </button>
      </div>
      <div class="fgroup">
        <span class="flabel">来源</span>
        <button :class="{ on: sourceFilter === 'all' }" @click="sourceFilter = 'all'">全部</button>
        <button :class="{ on: sourceFilter === 'builtin' }" @click="sourceFilter = 'builtin'">
          默认
        </button>
        <button :class="{ on: sourceFilter === 'custom' }" @click="sourceFilter = 'custom'">
          自定义
        </button>
      </div>
      <div class="fgroup">
        <span class="flabel">状态</span>
        <button :class="{ on: archivedFilter === 'all' }" @click="archivedFilter = 'all'">
          全部
        </button>
        <button :class="{ on: archivedFilter === 'active' }" @click="archivedFilter = 'active'">
          未归档
        </button>
        <button :class="{ on: archivedFilter === 'archived' }" @click="archivedFilter = 'archived'">
          已归档
        </button>
      </div>
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

    <div class="selbar">
      <button class="selact" :disabled="!selectable.length" @click="toggleSelectAll">
        {{ allVisibleSelected ? '取消全选' : '全选当前' }}
      </button>
      <span class="selcount">已选 {{ selectedIds.length }} 个</span>
      <button v-if="selectedIds.length" class="selact" @click="clearSelection">清空</button>
    </div>

    <div class="card rows" data-blur="off">
      <div
        v-for="c in filtered"
        :key="c.id"
        class="row"
        :class="{ muted: c.archived, picked: selected.has(c.id) }"
      >
        <input
          class="check"
          type="checkbox"
          :checked="selected.has(c.id)"
          :disabled="isBuiltinCategory(c)"
          :aria-label="`选择 ${c.name}`"
          @change="toggle(c.id)"
        />
        <span class="emoji">{{ c.emoji }}</span>
        <span class="main">
          <span class="name">
            {{ c.name }}
            <span v-if="isBuiltinCategory(c)" class="tag">内置，受保护</span>
          </span>
          <span class="sub">
            {{ c.type === 'expense' ? '支出' : '收入' }} · 有效 {{ usageOf(c).active }} / 回收站
            {{ usageOf(c).deleted }}
          </span>
        </span>
        <button v-if="c.archived" class="act" @click="restore(c)">恢复</button>
        <button v-else class="act" @click="openEdit(c)">编辑</button>
      </div>
      <p v-if="!filtered.length" class="placeholder">没有符合条件的分类</p>
    </div>

    <div v-if="selectedIds.length" class="card bulk" data-blur="off">
      <div class="bulk-title">批量操作 · 已选 {{ selectedIds.length }} 个</div>
      <p class="bulk-sub">有效 {{ selectedUsage.active }} / 回收站 {{ selectedUsage.deleted }}</p>

      <div class="modes">
        <button
          :class="{ on: bulkMode === 'archive-remove' }"
          @click="switchMode('archive-remove')"
        >
          归档/删除
        </button>
        <button
          :class="{ on: bulkMode === 'migrate-remove' }"
          :disabled="!canMigrate"
          @click="switchMode('migrate-remove')"
        >
          迁移后删除
        </button>
      </div>

      <template v-if="bulkMode === 'migrate-remove'">
        <p class="bulk-hint">目标必须同收支类型、未归档，且不在已选分类中。</p>
        <select v-model="bulkTargetId" class="select" aria-label="迁移目标分类">
          <option value="">选择迁移目标</option>
          <option v-for="t in migrationTargets" :key="t.id" :value="t.id">
            {{ t.emoji }} {{ t.name }}
          </option>
        </select>
      </template>

      <p class="bulk-hint">
        归档/删除：有引用自动归档，无引用硬删；迁移后删除会同时迁移有效与回收站账目。
      </p>
      <button class="btn run" :disabled="categories.bulkBusy" @click="requestBulk">
        {{ categories.bulkBusy ? '处理中…' : '执行批量操作' }}
      </button>

      <div v-if="bulkConfirm" class="confirm">
        <p class="confirm-title">确认对 {{ selectedIds.length }} 个分类执行？</p>
        <p class="confirm-sub">
          有效 {{ selectedUsage.active }} / 回收站 {{ selectedUsage.deleted }}
        </p>
        <div class="confirm-acts">
          <button class="btn ghost" @click="bulkConfirm = false">取消</button>
          <button
            class="btn danger"
            :disabled="categories.bulkBusy || (bulkMode === 'migrate-remove' && !bulkTargetId)"
            @click="runBulk"
          >
            {{ categories.bulkBusy ? '处理中…' : '确认执行' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="bulkResult" class="card result" data-blur="off">
      <div class="result-title">批量结果</div>
      <p v-for="r in bulkResult" :key="r.id" class="result-row" :class="r.status">
        {{ r.name }}：{{ statusText(r.status) }}
        <span v-if="r.error" class="result-error">（{{ r.error }}）</span>
      </p>
    </div>

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

.filters {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
}

.fgroup {
  display: flex;
  align-items: center;
  gap: 4px;
}

.flabel {
  flex: none;
  width: 2.6em;
  font-size: 12px;
  color: var(--text-secondary);
}

.fgroup button {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 12px;
  color: var(--text-secondary);
}

.fgroup button.on {
  background: var(--glass-active-fill);
  border-color: var(--glass-edge-2);
  color: var(--on-glass);
  font-weight: 600;
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
  border-radius: 8px;
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

.row.picked {
  background: var(--glass-active-fill);
}

.row.muted .name,
.row.muted .emoji {
  color: var(--text-secondary);
  opacity: 0.75;
}

.check {
  flex: none;
  width: 18px;
  height: 18px;
  accent-color: var(--brand);
}

.check:disabled {
  opacity: 0.45;
}

.emoji {
  font-size: 20px;
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.name {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag {
  margin-left: 4px;
  padding: 1px 5px;
  border-radius: 999px;
  border: 1px solid var(--glass-edge-2);
  font-size: 10px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.sub {
  font-size: 11px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.act {
  flex: none;
  font-size: 13px;
  color: var(--on-glass);
  padding: 8px 0 8px 10px;
}

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
  border-radius: 8px;
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
  border-radius: 8px;
  border: 1px solid var(--glass-edge-2);
  background: var(--glass-well);
  color: var(--on-glass);
  font-size: 13px;
}

.btn.run {
  width: 100%;
  padding: 10px 0;
  border-radius: 10px;
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
  border-radius: 10px;
  border: 1px solid rgba(163, 45, 45, 0.45);
  background: rgba(163, 45, 45, 0.14);
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
  border-radius: 8px;
  font-size: 13px;
}

.btn.ghost {
  border: 1px solid var(--glass-edge-2);
  background: transparent;
  color: var(--text-secondary);
}

.btn.danger {
  border: 1px solid #c0392b;
  background: #c0392b;
  color: #fff;
  font-weight: 600;
}

.btn.danger:disabled {
  opacity: 0.5;
}

.result {
  padding: 12px;
}

.result-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 6px;
}

.result-row {
  margin: 2px 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.result-row.failed,
.result-row.protected {
  color: var(--warning);
}

.result-error {
  color: var(--text-secondary);
}
</style>
