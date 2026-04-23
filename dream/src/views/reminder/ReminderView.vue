<template>
  <div class="reminder-view">
    <div class="view-header">
      <h2>提醒中心</h2>
      <el-button type="primary" @click="showAdd = true">+ 新建提醒</el-button>
    </div>

    <el-tabs v-model="activeTab" @tab-change="loadList">
      <el-tab-pane label="待处理" name="pending">
        <template #label>
          待处理
          <el-badge v-if="pendingCount" :value="pendingCount" :max="99" style="margin-left:6px" />
        </template>
      </el-tab-pane>
      <el-tab-pane label="已完成" name="dismissed" />
    </el-tabs>

    <div class="reminder-list">
      <div v-for="r in list" :key="r.id" class="reminder-card" :class="{ overdue: isOverdue(r) }">
        <div class="reminder-icon">{{ sourceIcon(r.source_type) }}</div>
        <div class="reminder-body">
          <div class="reminder-title">{{ r.title }}</div>
          <div class="reminder-body-text" v-if="r.body">{{ r.body }}</div>
          <el-text size="small" :type="isOverdue(r) ? 'danger' : 'info'">
            {{ formatRemindAt(r.remind_at) }}
          </el-text>
        </div>
        <div class="reminder-actions" v-if="r.status === 'pending'">
          <el-tooltip content="推迟10分钟">
            <el-button circle size="small" @click="snooze(r)">⏰</el-button>
          </el-tooltip>
          <el-tooltip content="标记完成">
            <el-button circle size="small" type="success" @click="dismiss(r)">✓</el-button>
          </el-tooltip>
        </div>
        <el-tag v-else size="small" type="info">{{ r.status === 'dismissed' ? '已完成' : '已推迟' }}</el-tag>
        <el-button link type="danger" size="small" @click="remove(r.id)">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>

      <el-empty v-if="list.length === 0"
        :description="activeTab === 'pending' ? '没有待处理的提醒' : '没有历史提醒'"
        :image-size="80"
      />
    </div>

    <!-- 新建弹窗 -->
    <el-dialog v-model="showAdd" title="新建提醒" width="400px">
      <el-form :model="form" label-width="60px">
        <el-form-item label="标题">
          <el-input v-model="form.title" placeholder="提醒标题" />
        </el-form-item>
        <el-form-item label="内容">
          <el-input v-model="form.body" type="textarea" :rows="2" placeholder="提醒内容（可选）" />
        </el-form-item>
        <el-form-item label="时间">
          <el-date-picker
            v-model="form.remindAt"
            type="datetime"
            placeholder="选择时间"
            format="YYYY/MM/DD HH:mm"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width:100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAdd = false">取消</el-button>
        <el-button type="primary" @click="submit" :disabled="!form.title.trim() || !form.remindAt">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { Close } from '@element-plus/icons-vue'
import type { Reminder } from '../../../electron/preload/index'
import dayjs from 'dayjs'

const list = ref<Reminder[]>([])
const activeTab = ref<'pending' | 'dismissed'>('pending')
const showAdd = ref(false)

const pendingCount = computed(() => list.value.filter(r => r.status === 'pending').length)

const form = reactive({ title: '', body: '', remindAt: '' })

onMounted(() => loadList())

async function loadList() {
  list.value = await window.dreamAPI.reminder.list(activeTab.value)
}

function isOverdue(r: Reminder) {
  return r.status === 'pending' && r.remind_at < Math.floor(Date.now() / 1000)
}

function formatRemindAt(ts: number) {
  const d = dayjs.unix(ts)
  if (d.isToday()) return '今天 ' + d.format('HH:mm')
  if (d.isTomorrow()) return '明天 ' + d.format('HH:mm')
  return d.format('MM/DD HH:mm')
}

function sourceIcon(type: string) {
  const icons: Record<string, string> = { todo: '✅', study: '📚', schedule: '📅', custom: '🔔' }
  return icons[type] ?? '🔔'
}

async function snooze(r: Reminder) {
  const newTime = Math.floor(Date.now() / 1000) + 10 * 60
  await window.dreamAPI.reminder.snooze(r.id, newTime)
  r.remind_at = newTime
  r.status = 'snoozed'
  window.dreamAPI.notification.send({ title: r.title, body: '已推迟10分钟提醒' })
}

async function dismiss(r: Reminder) {
  await window.dreamAPI.reminder.dismiss(r.id)
  r.status = 'dismissed'
  if (activeTab.value === 'pending') {
    list.value = list.value.filter(i => i.id !== r.id)
  }
}

async function remove(id: string) {
  await window.dreamAPI.reminder.delete(id)
  list.value = list.value.filter(i => i.id !== id)
}

async function submit() {
  if (!form.title.trim() || !form.remindAt) return
  const remind_at = dayjs(form.remindAt).unix()
  await window.dreamAPI.reminder.add({ source_type: 'custom', title: form.title, body: form.body, remind_at })
  Object.assign(form, { title: '', body: '', remindAt: '' })
  showAdd.value = false
  if (activeTab.value === 'pending') loadList()
}
</script>

<style scoped>
.reminder-view { display: flex; flex-direction: column; height: 100%; overflow: hidden; padding: 20px; gap: 12px; }
.view-header { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
.view-header h2 { font-size: 20px; font-weight: 700; color: var(--color-text); }

.reminder-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.reminder-card {
  display: flex; align-items: flex-start; gap: 12px;
  background: var(--color-bg-card); border: 1px solid var(--color-border);
  border-radius: var(--radius-md); padding: 14px; transition: all 150ms;
}
.reminder-card.overdue { border-color: var(--color-danger); }
.reminder-icon { font-size: 22px; flex-shrink: 0; }
.reminder-body { flex: 1; min-width: 0; }
.reminder-title { font-size: 14px; font-weight: 600; color: var(--color-text); }
.reminder-body-text { font-size: 12px; color: var(--color-text-muted); margin: 2px 0 4px; }
.reminder-actions { display: flex; gap: 6px; flex-shrink: 0; }
</style>
