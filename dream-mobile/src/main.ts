import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import 'vant/lib/index.css'

// dayjs 插件注册
import dayjs from 'dayjs'
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import isToday from 'dayjs/plugin/isToday'
import isTomorrow from 'dayjs/plugin/isTomorrow'
import isYesterday from 'dayjs/plugin/isYesterday'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'

dayjs.extend(isSameOrBefore)
dayjs.extend(isToday)
dayjs.extend(isTomorrow)
dayjs.extend(isYesterday)
dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

// ==================== 路由配置 ====================
// 使用 Hash 路由——WebView file:// 协议不支持 History 模式

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    // 根路径重定向到待办
    { path: '/', redirect: '/todo' },

    // TabBar 主页面
    {
      path: '/todo',
      component: () => import('./pages/todo/index.vue'),
      meta: { title: '待办', tab: true },
    },
    {
      path: '/study',
      component: () => import('./pages/study/index.vue'),
      meta: { title: '计划', tab: true },
    },
    {
      path: '/note',
      component: () => import('./pages/note/index.vue'),
      meta: { title: '笔记', tab: true },
    },
    {
      path: '/schedule',
      component: () => import('./pages/schedule/index.vue'),
      meta: { title: '日程', tab: true },
    },
    {
      path: '/settings',
      component: () => import('./pages/settings/index.vue'),
      meta: { title: '更多', tab: true },
    },

    // 二级页面
    {
      path: '/study/detail/:id',
      component: () => import('./pages/study/detail.vue'),
      meta: { title: '计划详情' },
    },
    {
      path: '/note/edit/:id?',
      component: () => import('./pages/note/edit.vue'),
      meta: { title: '编辑笔记' },
    },
    {
      path: '/reminder',
      component: () => import('./pages/reminder/index.vue'),
      meta: { title: '提醒' },
    },
    {
      path: '/account',
      component: () => import('./pages/account/index.vue'),
      meta: { title: '账号管理' },
    },
    {
      path: '/account/unlock',
      component: () => import('./pages/account/unlock.vue'),
      meta: { title: '解锁账号' },
    },
    {
      path: '/favorite',
      component: () => import('./pages/favorite/index.vue'),
      meta: { title: '收藏' },
    },
  ],
})

// ==================== 应用创建 ====================

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

app.mount('#app')
