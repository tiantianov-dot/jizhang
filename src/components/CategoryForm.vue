<script setup>
/**
 * CategoryForm.vue — 分类新增/编辑表单（分类管理页内嵌，不做子路由、不做 modal）
 *
 * 类型只在「新增」时可选：编辑时锁定，避免跨类型改挂导致历史流水口径错乱。
 * 删除走两段式确认（首次点击变红，3 秒内再点才生效），归档还是硬删由 repository 判定。
 */
import { computed, reactive, ref } from 'vue'
import { useCategoriesStore } from '@/stores/categories'
import { fenToInput } from '@/utils/format'
import { isBuiltinCategory } from '@/services/builtinCategories'
import { buildCategoryPayload, validateCategoryDraft } from '@/services/categoryManagement'
import { DELETE_MESSAGES, describeStoreError, WRITE_MESSAGES } from '@/services/writeOutcome'
import { useTwoStepConfirm } from '@/composables/useTwoStepConfirm'
import IconColorPicker from '@/components/IconColorPicker.vue'

const props = defineProps({
  /** 要编辑的分类；null = 新增 */
  cat: { type: Object, default: null },
})

const emit = defineEmits(['done', 'cancel', 'notice'])

const categories = useCategoriesStore()
const isEdit = computed(() => !!props.cat)
const builtin = computed(() => isBuiltinCategory(props.cat))

const form = reactive({
  name: props.cat ? props.cat.name : '',
  emoji: props.cat ? props.cat.emoji || '' : '',
  color: props.cat ? props.cat.color || '' : '',
  type: props.cat ? props.cat.type : 'expense',
  /** 分类月预算的输入缓冲（元，字符串）；0 显示为空 = 不设 */
  budget: props.cat && props.cat.monthlyBudget ? fenToInput(props.cat.monthlyBudget) : '',
})

const busy = ref(false)
const {
  confirming,
  trigger: triggerDelete,
  reset: resetDeleteConfirm,
} = useTwoStepConfirm({ timeout: 3000 })

async function submit() {
  if (busy.value) return
  resetDeleteConfirm()
  const checked = validateCategoryDraft(form)
  // 校验失败只提示、不收表单（notice 与 done 的区别：done 会让父级收起表单）
  if (!checked.ok) {
    emit('notice', checked.message)
    return
  }
  busy.value = true
  try {
    await categories.save(buildCategoryPayload(props.cat, { ...form, name: checked.name }))
    emit('done', isEdit.value ? '已保存' : '已新增')
  } catch (err) {
    // 只提示、不收表单，用户可修正后重试
    emit('notice', describeStoreError(err, WRITE_MESSAGES))
  } finally {
    busy.value = false
  }
}

/** 删除两段式：首次点击进入确认态（3 秒后自动复原），3 秒内再点才真正删除 */
function onDeleteClick() {
  triggerDelete(remove)
}

async function remove() {
  if (busy.value) return
  busy.value = true
  try {
    const result = await categories.remove(props.cat.id)
    emit(
      'done',
      result === 'archived'
        ? '该分类有流水引用，已归档：历史账目保留原样，记账时不再出现'
        : '已删除',
    )
  } catch (err) {
    emit('notice', describeStoreError(err, DELETE_MESSAGES))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="card form" data-blur="off">
    <div class="form-title">{{ isEdit ? '编辑分类' : '新增分类' }}</div>

    <div class="field">
      <span class="label">类型</span>
      <div v-if="!isEdit" class="seg">
        <button :class="{ on: form.type === 'expense' }" @click="form.type = 'expense'">
          支出
        </button>
        <button :class="{ on: form.type === 'income' }" @click="form.type = 'income'">收入</button>
      </div>
      <span v-else class="locked">{{ form.type === 'expense' ? '支出' : '收入' }} · 不可修改</span>
    </div>

    <div class="field">
      <span class="label">名称</span>
      <input v-model="form.name" class="input" maxlength="6" placeholder="最多 6 个字" />
    </div>

    <div class="field">
      <span class="label">月预算</span>
      <input v-model="form.budget" class="input" inputmode="decimal" placeholder="不设" />
      <span class="unit">元</span>
    </div>

    <IconColorPicker v-model:emoji="form.emoji" v-model:color="form.color" />

    <div class="acts">
      <button class="btn ghost" :disabled="busy" @click="emit('cancel')">取消</button>
      <button class="btn" :disabled="busy" @click="submit">{{ busy ? '处理中…' : '保存' }}</button>
    </div>

    <!-- 删除：两段式确认（仅编辑态；新增态无 id 可删；内置分类受保护） -->
    <p v-if="builtin" class="hint">内置分类，受保护，不可删除</p>
    <button
      v-if="isEdit && !builtin"
      class="del"
      :class="{ warn: confirming }"
      :disabled="busy"
      @click="onDeleteClick"
    >
      {{ confirming ? '再点一次确认删除' : '删除分类' }}
    </button>
  </div>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-title {
  font-size: 15px;
  font-weight: 600;
}

.field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.label {
  flex: none;
  width: 3.4em; /* 够放「月预算」三个字，各行的标签左边缘保持对齐 */
  font-size: 13px;
  color: var(--text-secondary);
}

.unit {
  flex: none;
  font-size: 12px;
  color: var(--text-secondary);
}

.locked {
  font-size: 13px;
  color: var(--text-secondary);
}

.seg {
  display: flex;
  background: var(--glass-well);
  border-radius: var(--glass-radius-pill);
  padding: 3px;
}

.seg button {
  padding: 4px 16px;
  border-radius: var(--glass-radius-pill);
  font-size: 13px;
  color: var(--text-secondary);
}

.seg button.on {
  background: var(--glass-active-fill);
  color: var(--on-glass);
  font-weight: 600;
}

.input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--glass-edge-2);
  border-radius: var(--radius-sm);
  background: var(--glass-well);
  color: var(--text);
  font-size: 14px;
  padding: 8px 10px;
  outline: none;
}

.acts {
  display: flex;
  gap: 8px;
}

.btn {
  flex: 1;
  background: var(--glass-fill);
  border: 1px solid var(--glass-edge-2);
  color: var(--on-glass);
  font-size: 14px;
  padding: 10px 0;
  border-radius: var(--radius-md);
  text-shadow: var(--on-glass-shadow);
}

.btn:disabled,
.del:disabled {
  opacity: 0.55;
}

.btn.ghost {
  flex: none;
  width: 5em;
  background: transparent;
  border: 1px solid var(--glass-edge-2);
  color: var(--text-secondary);
  text-shadow: none;
}

.del {
  padding: 10px 0;
  border-radius: var(--radius-md);
  border: 1px solid var(--danger-soft-border);
  background: var(--danger-soft-bg);
  color: #fff;
  font-size: 14px;
}

.hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
}

.del.warn {
  /* 填充态不能跟 --danger 走亮红：白字在 #ff6b6b 上不足 4.5:1 */
  background: var(--danger-solid);
  border-color: var(--danger-solid);
  color: #fff;
  font-weight: 600;
}
</style>
