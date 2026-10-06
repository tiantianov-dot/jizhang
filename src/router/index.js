import { createRouter, createWebHashHistory } from 'vue-router'

// hash 模式：GitHub Pages 等静态托管刷新不 404，PWA 场景零配置
const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'add', component: () => import('@/views/AddView.vue'), meta: { title: '记一笔' } },
    // 外部约定的记账入口路径（快捷指令写 /#/add?amount=...）。记账页真实路径是 '/'，
    // 这里做一次带参数的规范化跳转，让外部链接与人手输入的地址都能落到同一个页面。
    { path: '/add', redirect: (to) => ({ path: '/', query: to.query }) },
    { path: '/list', name: 'list', component: () => import('@/views/ListView.vue'), meta: { title: '流水' } },
    {
      path: '/record/:id',
      name: 'edit',
      component: () => import('@/views/EditView.vue'),
      meta: { title: '编辑' },
    },
    { path: '/stats', name: 'stats', component: () => import('@/views/StatsView.vue'), meta: { title: '统计' } },
    { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue'), meta: { title: '设置' } },
    {
      path: '/categories',
      name: 'categories',
      component: () => import('@/views/CategoriesView.vue'),
      meta: { title: '分类管理' },
    },
  ],
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · 极简记账` : '极简记账'
})

export default router
