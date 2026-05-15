<template>
  <div class="home">
    <!-- 侧边导航 -->
    <nav class="sidebar" :class="{ collapsed }">
      <div class="sidebar-logo">
        <img src="/logo.png" class="logo-icon" alt="Dream" />
        <span class="logo-text">Dream</span>
      </div>

      <div class="sidebar-nav">
        <div
          v-for="item in navItems" :key="item.key"
          class="nav-item" :class="{ active: activeNav === item.key }"
          :title="collapsed ? item.label : ''"
          @click="activeNav = item.key; autoCollapse()"
        >
          <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
          <span class="nav-label">{{ item.label }}</span>
          <el-badge v-if="item.badge > 0" :value="item.badge" :max="99" class="nav-badge" />
        </div>
      </div>

      <div class="sidebar-footer">
        <!-- 刷新按钮 -->
        <div
          class="nav-item refresh-btn"
          :class="{ refreshing, 'refresh-done': refreshDone }"
          :title="collapsed ? (refreshDone ? '已刷新' : '刷新') : ''"
          @click="handleRefresh"
        >
          <el-icon class="nav-icon" :class="{ spinning: refreshing }"><Refresh /></el-icon>
          <span class="nav-label">{{ refreshDone ? '已刷新' : '刷新' }}</span>
        </div>
        <RouterLink to="/settings" class="nav-item" :title="collapsed ? '设置' : ''" @click="autoCollapse()">
          <el-icon class="nav-icon"><Setting /></el-icon>
          <span class="nav-label">设置</span>
        </RouterLink>
        <!-- 折叠按钮 -->
        <div class="nav-item collapse-btn" :title="collapsed ? '展开' : '收起'" @click="collapsed = !collapsed">
          <el-icon class="nav-icon">
            <ArrowLeft v-if="!collapsed" />
            <ArrowRight v-else />
          </el-icon>
          <span class="nav-label">收起</span>
        </div>
      </div>
    </nav>

    <!-- 主内容区 -->
    <main class="main-content">
      <!-- 离线提示条 -->
      <div v-if="connStore?.isOffline" class="offline-bar">
        离线模式 — 仅展示缓存数据，写操作不可用
        <RouterLink to="/settings" class="offline-bar-link">去重连</RouterLink>
      </div>
      <KeepAlive>
        <component :is="currentView" />
      </KeepAlive>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import { Checked, Notebook, Calendar, Bell, List, Setting, Key, Star, ArrowLeft, ArrowRight, Refresh } from '@element-plus/icons-vue'
import { useTodoStore } from '../stores/todo'
import { useStudyStore } from '../stores/study'
import { useScheduleStore } from '../stores/schedule'
import { useNoteStore } from '../stores/note'
import { useFavoriteStore } from '../stores/favorite'
import { useAccountStore } from '../stores/account'
import { useConnectionStore } from '../stores/connection'
import { isElectron } from '../utils/env'

const connStore = isElectron ? null : useConnectionStore()
import TodoView from './todo/TodoView.vue'
import StudyView from './study/StudyView.vue'
import NoteView from './note/NoteView.vue'
import ScheduleView from './schedule/ScheduleView.vue'
import ReminderView from './reminder/ReminderView.vue'
import AccountView from './account/AccountView.vue'
import FavoriteView from './favorite/FavoriteView.vue'

const todoStore = useTodoStore()
const studyStore = useStudyStore()
const scheduleStore = useScheduleStore()
const noteStore = useNoteStore()
const favoriteStore = useFavoriteStore()
const accountStore = useAccountStore()
const activeNav = ref('todo')

// 窄屏默认折叠
const collapsed = ref(window.innerWidth < 768)

// 窄屏点击导航后自动折叠
function autoCollapse() {
  if (window.innerWidth < 768) collapsed.value = true
}

// 窗口尺寸变化时自动处理
function onResize() {
  if (window.innerWidth >= 768) collapsed.value = false
}
onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))

// ── 刷新 ──
const refreshing = ref(false)
const refreshDone = ref(false)
let refreshDoneTimer: ReturnType<typeof setTimeout> | null = null

async function handleRefresh() {
  if (refreshing.value) return
  refreshing.value = true
  refreshDone.value = false
  try {
    if (connStore) {
      // 非 Electron：走 connection store 的 sync()（回放离线队列 + 调所有注册的刷新回调）
      await connStore.sync()
    } else {
      // Electron：直接并行调各 store 的 load（不存在离线队列）
      await Promise.all([
        todoStore.load(),
        studyStore.loadPlans(),
        scheduleStore.loadMonth(),
        scheduleStore.loadCheckinPlanTasks(),
        noteStore.load(),
        favoriteStore.load(),
        accountStore.load(),
      ])
    }
    refreshDone.value = true
    if (refreshDoneTimer) clearTimeout(refreshDoneTimer)
    refreshDoneTimer = setTimeout(() => { refreshDone.value = false }, 2000)
  } finally {
    refreshing.value = false
  }
}

const viewMap: Record<string, unknown> = {
  todo: TodoView,
  study: StudyView,
  note: NoteView,
  schedule: ScheduleView,
  reminder: ReminderView,
  account: AccountView,
  favorite: FavoriteView
}

const currentView = computed(() => viewMap[activeNav.value])

const navItems = computed(() => [
  { key: 'todo', icon: Checked, label: '待办', badge: todoStore.todoCount || 0 },
  { key: 'study', icon: List, label: '计划', badge: 0 },
  { key: 'note', icon: Notebook, label: '笔记', badge: 0 },
  { key: 'schedule', icon: Calendar, label: '日程', badge: 0 },
  { key: 'reminder', icon: Bell, label: '提醒', badge: 0 },
  { key: 'favorite', icon: Star, label: '收藏', badge: 0 },
  { key: 'account', icon: Key, label: '账号', badge: 0 }
])

onMounted(async () => {
  await todoStore.load()
})
</script>

<style scoped>
.home { display: flex; height: 100%; height: 100dvh; overflow: hidden; }

/* ── 侧边栏 ── */
.sidebar {
  width: 196px; flex-shrink: 0;
  background: var(--color-bg-sidebar);
  border-right: 1px solid var(--color-border);
  display: flex; flex-direction: column; padding: 12px 8px;
  transition: width 200ms var(--ease-out, ease);
  overflow: hidden;
}

/* 折叠态：只留图标宽度 */
.sidebar.collapsed { width: 52px; }

.sidebar-logo {
  display: flex; align-items: center; gap: 10px; padding: 8px 12px 16px;
  white-space: nowrap; overflow: hidden;
}
.logo-icon { width: 32px; height: 32px; border-radius: var(--radius-sm); object-fit: cover; flex-shrink: 0; }
.logo-text { font-size: 16px; font-weight: 600; color: var(--color-text); }

.sidebar-nav { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.sidebar-footer { border-top: 1px solid var(--color-border); padding-top: 8px; margin-top: 8px; }

.nav-item {
  display: flex; align-items: center; gap: 10px; padding: 8px 12px;
  border-radius: var(--radius-sm); cursor: pointer; color: var(--color-text-secondary);
  text-decoration: none; transition: all var(--duration-fast) var(--ease-out); font-size: 14px;
  white-space: nowrap; overflow: hidden;
}
.nav-item:hover { background: var(--color-border); color: var(--color-text); text-decoration: none; }
.nav-item.active { background: var(--color-accent-light); color: var(--color-accent); font-weight: 500; }

.nav-icon { font-size: 17px; flex-shrink: 0; }
.nav-label { flex: 1; transition: opacity 150ms; }
.nav-badge { margin-left: auto; flex-shrink: 0; }

/* 折叠时隐藏文字和 badge */
.sidebar.collapsed .nav-label { opacity: 0; width: 0; }
.sidebar.collapsed .nav-badge { display: none; }
.sidebar.collapsed .sidebar-logo .logo-text { opacity: 0; width: 0; }
/* 折叠时隐藏"收起"文字，只留箭头图标 */
.collapse-btn { color: var(--color-text-muted, var(--color-text-secondary)); }

/* 刷新按钮 */
.refresh-btn { color: var(--color-text-muted, var(--color-text-secondary)); cursor: pointer; }
.refresh-btn.refresh-done { color: var(--el-color-success); }
.refresh-btn.refreshing { pointer-events: none; opacity: 0.6; }
@keyframes spin { to { transform: rotate(360deg); } }
.spinning { animation: spin 0.8s linear infinite; display: inline-flex; }

.main-content { flex: 1; overflow: hidden; display: flex; flex-direction: column; min-width: 0; }

.offline-bar {
  background: var(--el-color-warning-light-9);
  border-bottom: 1px solid var(--el-color-warning-light-5);
  color: var(--el-color-warning-dark-2);
  font-size: 12px;
  padding: 6px 16px;
  display: flex; align-items: center; gap: 12px;
  flex-shrink: 0;
}
.offline-bar-link {
  color: var(--el-color-warning-dark-2);
  font-weight: 600;
  text-decoration: underline;
}

/* 窄屏默认折叠（交给 JS 控制，CSS 仅做兜底） */
@media (max-width: 767px) {
  .sidebar { width: 52px; }
  .sidebar .nav-label { opacity: 0; width: 0; }
  .sidebar .nav-badge { display: none; }
  .sidebar .logo-text { opacity: 0; width: 0; }
  /* 展开态覆盖 */
  .sidebar:not(.collapsed) {
    width: 196px;
    position: fixed; left: 0; top: 0; bottom: 0;
    z-index: 200;
    box-shadow: 2px 0 12px rgba(0,0,0,0.15);
  }
  .sidebar:not(.collapsed) .nav-label { opacity: 1; width: auto; }
  .sidebar:not(.collapsed) .nav-badge { display: inline-flex; }
  .sidebar:not(.collapsed) .logo-text { opacity: 1; width: auto; }
  /* 底部按钮避开浏览器工具栏：用安全区 + 固定偏移 */
  .sidebar-footer {
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
}
</style>
