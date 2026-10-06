<script setup>
/**
 * CategoryForm.vue — 分类新增/编辑表单（分类管理页内嵌，不做子路由、不做 modal）
 *
 * 类型只在「新增」时可选：编辑时锁定，避免跨类型改挂导致历史流水口径错乱。
 * 删除走两段式确认（首次点击变红，3 秒内再点才生效），归档还是硬删由 repository 判定。
 */
import { computed, onUnmounted, reactive, ref } from 'vue'
import { useCategoriesStore } from '@/stores/categories'
import { fenToInput, toFen } from '@/utils/format'
import IconColorPicker from '@/components/IconColorPicker.vue'

const props = defineProps({
  /** 要编辑的分类；null = 新增 */
  cat: { type: Object, default: null },
})

const emit = defineEmits(['done', 'cancel', 'notice'])

const categories = useCategoriesStore()

const isEdit = computed(() => !!props.cat)

const form = reactive({
  name: props.cat ? props.cat.name : '',
  emoji: props.cat ? props.cat.emoji || '' : '',
  color: props.cat ? props.cat.color || '' : '',
  type: props.cat ? props.cat.type : 'expense',
  /** 分类月预算的输入缓冲（元，字符串）；0 显示为空 = 不设 */
  budget: props.cat && props.cat.monthlyBudget ? fenToInput(props.cat.monthlyBudget) : '',
})

const busy = ref(false)
const confirming = ref(false)
let confirmTimer = null

onUnmounted(() => clearTimeout(confirmTimer))

async function submit() {
  if (busy.value) return
  const name = form.name.trim()
  // 校验失败只提示、不收表单（notice 与 done 的区别：done 会让父级收起表单）
  if (!name) {
    emit('notice', '先填分类名称')
    return
  }
  if (name.length > 6) {
    emit('notice', '名称不超过 6 个字')
    return
  }
  busy.value = true
  try {
    // 编辑时以原分类为底（props.cat 为 null 时展开为空对象 = 新增），
    // 只覆盖用户能改的字段，id / order / lastUsedAt / archived 原样保留。
    await categories.save({
      ...props.cat,
      name,
      type: form.type,
      emoji: form.emoji.trim() || '📦',
      color: form.color || '#5F5E5A',
      // 空 / 非数字 / 负数一律存 0（= 不设），避免 NaN 落库
      monthlyBudget: Math.max(0, toFen(form.budget) || 0),
    })
    emit('done', isEdit.value ? '已保存' : '已新增')
  } finally {
    busy.value = false
  }
}

/** 删除两段式：首次点击进入确认态（3 秒后自动复原），3 秒内再点才真正删除 */
function onDeleteClick() {
  if (!confirming.value) {
    confirming.value = true
    clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => (confirming.value = false), 3000)
    return
  }
  clearTimeout(confirmTimer)
  confirming.value = false
  remove()
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
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="card form">
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

    <!-- 删除：两段式确认（仅编辑态；新增态无 id 可删） -->
    <button
      v-if="isEdit"
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
  background: var(--bg);
  border-radius: 999px;
  padding: 3px;
}

.seg button {
  padding: 4px 16px;
  border-radius: 999px;
  font-size: 13px;
  color: var(--text-secondary);
}

.seg button.on {
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
}

.input {
  flex: 1;
  min-width: 0;
  border: 0.5px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
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
  background: var(--brand);
  color: #fff;
  font-size: 14px;
  padding: 10px 0;
  border-radius: 10px;
}

.btn:disabled,
.del:disabled {
  opacity: 0.55;
}

.btn.ghost {
  flex: none;
  width: 5em;
  background: var(--bg);
  color: var(--text-secondary);
}

.del {
  padding: 10px 0;
  border-radius: 10px;
  border: 0.5px solid var(--border);
  background: var(--surface);
  color: var(--danger);
  font-size: 14px;
}

.del.warn {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
  font-weight: 600;
}
</style>
