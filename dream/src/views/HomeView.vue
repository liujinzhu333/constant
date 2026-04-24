<template>
  <div class="home">
    <!-- 侧边导航 -->
    <nav class="sidebar">
      <div class="sidebar-logo">
        <img src="/logo.png" class="logo-icon" alt="Dream" />
        <span class="logo-text">Dream</span>
      </div>

      <div class="sidebar-nav">
        <div
          v-for="item in navItems" :key="item.key"
          class="nav-item" :class="{ active: activeNav === item.key }"
          @click="activeNav = item.key"
        >
          <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
          <span class="nav-label">{{ item.label }}</span>
          <el-badge v-if="item.badge > 0" :value="item.badge" :max="99" class="nav-badge" />
        </div>
      </div>

      <div class="sidebar-footer">
        <RouterLink to="/settings" class="nav-item">
          <el-icon class="nav-icon"><Setting /></el-icon>
          <span class="nav-label">设置</span>
        </RouterLink>
      </div>
    </nav>

    <!-- 主内容区 -->
    <main class="main-content">
      <KeepAlive>
        <component :is="currentView" />
      </KeepAlive>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { Checked, Notebook, Calendar, Bell, List, Setting } from '@element-plus/icons-vue'
import { useTodoStore } from '../stores/todo'
import TodoView from './todo/TodoView.vue'
import StudyView from './study/StudyView.vue'
import NoteView from './note/NoteView.vue'
import ScheduleView from './schedule/ScheduleView.vue'
import ReminderView from './reminder/ReminderView.vue'

const todoStore = useTodoStore()
const activeNav = ref('todo')

const viewMap: Record<string, unknown> = {
  todo: TodoView,
  study: StudyView,
  note: NoteView,
  schedule: ScheduleView,
  reminder: ReminderView
}

const currentView = computed(() => viewMap[activeNav.value])

const navItems = computed(() => [
  { key: 'todo', icon: Checked, label: '待办', badge: todoStore.todoCount || 0 },
  { key: 'study', icon: List, label: '计划', badge: 0 },
  { key: 'note', icon: Notebook, label: '笔记', badge: 0 },
  { key: 'schedule', icon: Calendar, label: '日程', badge: 0 },
  { key: 'reminder', icon: Bell, label: '提醒', badge: 0 }
])

onMounted(async () => {
  await todoStore.load()
})
</script>

<style scoped>
.home { display: flex; height: 100%; overflow: hidden; }

.sidebar {
  width: 196px; flex-shrink: 0; background: var(--color-bg-sidebar);
  border-right: 1px solid var(--color-border);
  display: flex; flex-direction: column; padding: 12px 8px;
}

.sidebar-logo {
  display: flex; align-items: center; gap: 10px; padding: 8px 12px 16px;
}
.logo-icon {
  width: 32px; height: 32px; border-radius: var(--radius-sm);
  object-fit: cover;
}
.logo-text { font-size: 16px; font-weight: 600; color: var(--color-text); }

.sidebar-nav { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.sidebar-footer { border-top: 1px solid var(--color-border); padding-top: 8px; margin-top: 8px; }

.nav-item {
  display: flex; align-items: center; gap: 10px; padding: 8px 12px;
  border-radius: var(--radius-sm); cursor: pointer; color: var(--color-text-secondary);
  text-decoration: none; transition: all var(--duration-fast) var(--ease-out); font-size: 14px;
}
.nav-item:hover { background: var(--color-border); color: var(--color-text); text-decoration: none; }
.nav-item.active { background: var(--color-accent-light); color: var(--color-accent); font-weight: 500; }

.nav-icon { font-size: 17px; flex-shrink: 0; }
.nav-label { flex: 1; }
.nav-badge { margin-left: auto; }

.main-content { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
</style>
