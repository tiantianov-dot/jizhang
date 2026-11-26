/**
 * composables/useEntryIntake.js — 统一入口协议消费层（URL query + 剪贴板 JSON）
 *
 * 收口 AddView 的外部记账意图回填逻辑：
 * - URL query 一次性读取并立即清除（watch immediate，兼容 iOS 同路由不重挂载场景）
 * - 冷启动分类名延迟映射（仅匹配未归档且同收支类型的分类）
 * - autosavePending 挂起待分类列表就绪后再触发自动入账
 * - 剪贴板 JSON 手势读取与统一失败提示
 */
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCategoriesStore } from '@/stores/categories'
import { parseEntryJson, parseEntryQuery } from '@/services/entry'
import { fenToInput } from '@/utils/format'

const CLIP_EMPTY = '剪贴板里没有可识别的记账内容'

/**
 * @param {{
 *   type: import('vue').Ref<'expense'|'income'>,
 *   buffer: import('vue').Ref<string>,
 *   categoryId: import('vue').Ref<string>,
 *   note: import('vue').Ref<string>,
 *   date: import('vue').Ref<string>,
 *   categories?: ReturnType<typeof useCategoriesStore>,
 *   route?: ReturnType<typeof useRoute>,
 *   router?: ReturnType<typeof useRouter>,
 *   onAutosave: () => void,
 *   onToast: (msg: string) => void,
 * }} options
 */
export function useEntryIntake({
  type,
  buffer,
  categoryId,
  note,
  date,
  categories = useCategoriesStore(),
  route = useRoute(),
  router = useRouter(),
  onAutosave,
  onToast,
}) {
  /** 入口给的分类名。store 载入后才能映射成 id，见 resolveEntryCat */
  const entryCatName = ref('')
  let autosavePending = false

  /**
   * 分类名 → categoryId。只在「未归档」分类里找：已归档分类不再出现在记账页，
   * 匹配进去会把账记到不该记的分类上；并且必须是当前收支类型，避免跨类型挂载。
   */
  function findCategoryId(name, catType) {
    const hit = categories.list.find((c) => !c.archived && c.type === catType && c.name === name)
    return hit ? hit.id : ''
  }

  /**
   * 解析待填入的分类名。冷启动时本页早于 App.vue 的 store 初始化，
   * categories.list 还是空的 → 先记住名字，等列表到位（下面的 watch）再落成 id。
   */
  function resolveEntryCat() {
    if (!entryCatName.value || categoryId.value) return
    const id = findCategoryId(entryCatName.value, type.value)
    if (id) {
      categoryId.value = id
      entryCatName.value = ''
    }
  }

  /** 草稿 → 表单。任何字段无效都静默跳过（不覆盖用户已有的输入、不阻塞手动记账） */
  function applyDraft(draft) {
    if (draft.valid.type) type.value = draft.type
    if (draft.valid.amount) buffer.value = fenToInput(draft.amount)
    if (draft.valid.note) note.value = draft.note
    if (draft.valid.date) date.value = draft.date
    entryCatName.value = draft.valid.category ? draft.categoryName : ''
    resolveEntryCat()
    // 自动入账：金额有效才触发（金额没解析出来时保持预填态，回落手动确认）。
    // 冷启动时分类 store 可能未就绪 → 挂起，等 watch categories.list 到位后再存，
    // 尽量让通知里匹配的分类先落到 categoryId，匹配不上则由 activeCat 回落最近使用。
    if (draft.autosave && draft.valid.amount) {
      if (categories.list.length) onAutosave()
      else autosavePending = true
    }
  }

  // store 载入后补一次分类映射（冷启动经快捷指令打开时走这条）；挂起的自动入账也在这里放行
  watch(
    () => categories.list,
    () => {
      resolveEntryCat()
      if (autosavePending && categories.list.length) {
        autosavePending = false
        onAutosave()
      }
    },
  )

  /**
   * URL 参数入口。用 watch(immediate) 而不是 onMounted：iOS 上 PWA 已停在记一笔页时，
   * 快捷指令只是把地址从 `#/` 换成 `#/?amount=…`，路由记录不变 → 组件不会重新挂载，
   * onMounted 不会触发，参数会被丢掉。
   * 参数是一次性的：读完立刻从地址栏清掉，避免刷新重复预填、也避免链接带着残留参数被分享。
   */
  watch(
    () => route.query,
    (q) => {
      if (!q || !Object.keys(q).length) return
      const draft = parseEntryQuery(q)
      router.replace({ query: {} })
      if (!Object.values(draft.valid).some(Boolean)) return
      applyDraft(draft)
    },
    { immediate: true },
  )

  /**
   * 剪贴板入口。iOS 读取剪贴板必须有用户手势，所以按钮常驻、点击时才读；
   * 读取失败或内容不是记账 JSON 都走同一个失败提示，且不影响页面状态。
   */
  async function pasteEntry() {
    let text
    try {
      text = await navigator.clipboard.readText()
    } catch {
      onToast(CLIP_EMPTY)
      return
    }
    const draft = parseEntryJson(text)
    if (!draft) {
      onToast(CLIP_EMPTY)
      return
    }
    const hadInput = !!buffer.value || !!note.value
    applyDraft(draft)
    onToast(hadInput ? '已覆盖原输入' : '已从剪贴板填入')
  }

  return { pasteEntry }
}
