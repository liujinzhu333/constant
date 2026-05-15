import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  // Electron 使用 hash 路由
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    // 所有其他路径重定向到根（Settings 已并入 HomeView 侧边栏）
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

export default router
