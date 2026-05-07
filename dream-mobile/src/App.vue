<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { bridge } from './utils/bridge'
import { db } from './utils/db'
import { logger } from './utils/logger'
import { notification } from './utils/notification'
import { updater } from './utils/update'

const router = useRouter()
const route = useRoute()

// TabBar 激活项
const tabActive = ref('todo')

// 路由 path → tab key 映射
const pathToTab: Record<string, string> = {
  '/todo': 'todo',
  '/study': 'study',
  '/note': 'note',
  '/schedule': 'schedule',
  '/settings': 'settings',
}

// tab key → 路由 path 映射
const tabToPath: Record<string, string> = {
  todo: '/todo',
  study: '/study',
  note: '/note',
  schedule: '/schedule',
  settings: '/settings',
}

// 监听路由变化同步 tab 高亮
watch(
  () => route.path,
  (p) => {
    const key = pathToTab[p]
    if (key) tabActive.value = key
  },
  { immediate: true }
)

function onTabChange(key: string | number) {
  const k = String(key)
  router.push(tabToPath[k] || '/todo')
}

// 是否显示 TabBar（二级页不显示）
const TAB_PATHS = new Set(['/todo', '/study', '/note', '/schedule', '/settings'])
const showTabBar = ref(true)
watch(
  () => route.path,
  (p) => { showTabBar.value = TAB_PATHS.has(p) },
  { immediate: true }
)

onMounted(async () => {
  const platform = await bridge.ready()
  logger.info('App', `Dream Mobile 启动，版本 ${__APP_VERSION__}，平台 ${platform.platform}`)

  try {
    await db.init()
    logger.info('App', '数据库初始化完成')
  } catch (err) {
    logger.error('App', '数据库初始化失败', err)
    alert('数据初始化失败，请重启应用')
  }

  if (bridge.isNative) {
    notification.requestPermission().then((granted) => {
      logger.info('App', `通知权限：${granted ? '已授权' : '未授权'}`)
    })
  }

  setTimeout(() => {
    updater.check(false).catch((err) => {
      logger.warn('App', `自动更新检测异常：${String(err)}`)
    })
  }, 5000)
})
</script>

<template>
  <div class="app-root">
    <!-- 页面主体 -->
    <div class="page-container" :class="{ 'has-tabbar': showTabBar }">
      <router-view v-slot="{ Component }">
        <keep-alive :include="['TodoPage', 'StudyPage', 'NotePage', 'SchedulePage', 'SettingsPage']">
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </div>

    <!-- 底部 TabBar -->
    <van-tabbar
      v-if="showTabBar"
      v-model="tabActive"
      active-color="#0071e3"
      inactive-color="#8e8e93"
      :safe-area-inset-bottom="true"
      @change="onTabChange"
    >
      <van-tabbar-item name="todo" icon="todo-list-o">待办</van-tabbar-item>
      <van-tabbar-item name="study" icon="medal-o">计划</van-tabbar-item>
      <van-tabbar-item name="note" icon="notes-o">笔记</van-tabbar-item>
      <van-tabbar-item name="schedule" icon="calendar-o">日程</van-tabbar-item>
      <van-tabbar-item name="settings" icon="setting-o">更多</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<style lang="scss">
@import '@/styles/global.scss';

* {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

html, body, #app {
  height: 100%;
  margin: 0;
  padding: 0;
}

.app-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: $color-bg;
}

.page-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
}

// 覆盖 Vant TabBar 样式以适配设计 token
.van-tabbar {
  border-top: 1px solid $color-separator !important;
}
</style>
