<template>
  <div class="reminder-page">
    <van-nav-bar title="提醒" />
    <van-tabs v-model:active="tab" color="#0071e3" title-active-color="#0071e3">
      <van-tab title="待处理" name="pending" />
      <van-tab title="已完成" name="done" />
    </van-tabs>

    <div class="list-wrap">
      <van-loading v-if="loading" class="loading-center" />
      <van-empty v-else-if="displayList.length === 0"
        :description="tab === 'pending' ? '暂无待处理提醒' : '暂无已完成提醒'" />

      <div v-else class="list-inner">
        <div v-for="item in displayList" :key="item.id" class="reminder-card">
          <div class="reminder-header">
            <span class="reminder-title">{{ item.title }}</span>
            <span class="reminder-time" :class="{ overdue: isOverdue(item) }">
              {{ formatTime(item.remind_at) }}
            </span>
          </div>
          <span v-if="item.description" class="reminder-desc van-ellipsis">{{ item.description }}</span>
          <div v-if="tab === 'pending'" class="action-row">
            <van-button size="small" plain @click="snooze(item.id)">推迟 10 分钟</van-button>
            <van-button size="small" type="primary" @click="dismiss(item.id)">标记完成</van-button>
          </div>
        </div>
      </div>
    </div>

    <div class="fab" @click="showAddDialog">
      <van-icon name="plus" color="#fff" size="24" />
    </div>

    <BottomSheet :visible="sheetVisible" @close="closePopup">
      <div class="sheet-inner">
        <van-nav-bar title="新建提醒" left-text="取消" right-text="添加" @click-left="closePopup" @click-right="submitAdd" />
        <div class="form-wrap">
          <van-cell-group inset>
            <van-field v-model="form.title" label="标题" placeholder="提醒内容" maxlength="100" />
            <van-field label="提醒时间">
              <template #input>
                <input type="datetime-local" v-model="form.datetime" class="dt-input" />
              </template>
            </van-field>
          </van-cell-group>
        </div>
      </div>
    </BottomSheet>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { showToast } from 'vant'
import { reminderDao, type ReminderItem } from '../../utils/db'
import { notification } from '../../utils/notification'
import { logger } from '../../utils/logger'
import dayjs from 'dayjs'
import BottomSheet from '../../components/BottomSheet.vue'

const tab = ref<'pending' | 'done'>('pending')
const allReminders = ref<ReminderItem[]>([])
const loading = ref(false)
const sheetVisible = ref(false)
const form = ref({ title: '', datetime: dayjs().add(1, 'hour').format('YYYY-MM-DDTHH:mm') })

const displayList = computed(() => allReminders.value.filter(r => {
  if (tab.value === 'pending') return r.status === 'pending' || r.status === 'snoozed'
  return r.status === 'done'
}))

onMounted(() => loadAll())

async function loadAll() {
  loading.value = true
  try { allReminders.value = await reminderDao.list() }
  catch (err) { logger.error('ReminderPage', '加载失败', err) }
  finally { loading.value = false }
}

function formatTime(ts: number) {
  const d = dayjs(ts)
  if (d.isToday()) return `今天 ${d.format('HH:mm')}`
  if (d.isTomorrow()) return `明天 ${d.format('HH:mm')}`
  if (d.isYesterday()) return `昨天 ${d.format('HH:mm')}`
  return d.format('MM/DD HH:mm')
}

function isOverdue(item: ReminderItem) {
  return item.status === 'pending' && item.remind_at < Date.now()
}

async function dismiss(id: number) {
  await reminderDao.dismiss(id)
  const idx = allReminders.value.findIndex(r => r.id === id)
  if (idx !== -1) allReminders.value[idx].status = 'done'
  showToast('已完成')
}

async function snooze(id: number) {
  const newTime = Date.now() + 10 * 60 * 1000
  await reminderDao.snooze(id, newTime)
  const idx = allReminders.value.findIndex(r => r.id === id)
  if (idx !== -1) { allReminders.value[idx].remind_at = newTime; allReminders.value[idx].status = 'snoozed' }
  notification.send({ title: '提醒已推迟', content: '10 分钟后再次提醒', delaySec: 10 * 60 })
  showToast('已推迟 10 分钟')
}

function showAddDialog() {
  form.value = { title: '', datetime: dayjs().add(1, 'hour').format('YYYY-MM-DDTHH:mm') }
  sheetVisible.value = true
}
function closePopup() { sheetVisible.value = false }

async function submitAdd() {
  if (!form.value.title.trim()) { showToast('请输入标题'); return }
  const remindAt = dayjs(form.value.datetime).valueOf()
  if (remindAt <= Date.now()) { showToast('提醒时间须在将来'); return }
  await reminderDao.add({ title: form.value.title.trim(), description: '', remind_at: remindAt, status: 'pending', source_type: 'manual', source_id: null })
  const delaySec = Math.floor((remindAt - Date.now()) / 1000)
  notification.send({ title: form.value.title.trim(), content: '提醒到了！', delaySec })
  await loadAll()
  closePopup()
}
</script>

<style lang="scss" scoped>
.reminder-page { display: flex; flex-direction: column; height: 100%; background: $color-bg; }
.list-wrap { flex: 1; overflow-y: auto; }
.loading-center { display: flex; justify-content: center; padding: 40px; }
.list-inner { padding: 8px 12px 80px; display: flex; flex-direction: column; gap: 10px; }

.reminder-card {
  background: #fff;
  border-radius: $radius-lg;
  padding: 14px;
  box-shadow: $shadow-sm;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.reminder-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.reminder-title { font-size: $font-md; font-weight: $font-medium; color: $color-text-primary; flex: 1; }
.reminder-time { font-size: $font-xs; color: $color-text-secondary; flex-shrink: 0; &.overdue { color: $color-danger; } }
.reminder-desc { font-size: $font-sm; color: $color-text-secondary; }
.action-row { display: flex; gap: 8px; justify-content: flex-end; }

.fab { position: fixed; right: 20px; bottom: 80px; width: 50px; height: 50px; border-radius: 50%; background: $color-primary; display: flex; align-items: center; justify-content: center; box-shadow: $shadow-lg; cursor: pointer; }

.sheet-inner { max-height: 90vh; display: flex; flex-direction: column; }
.form-wrap { overflow-y: auto; padding: 12px 0 calc(env(safe-area-inset-bottom) + 12px); }
.dt-input { border: none; outline: none; font-size: $font-md; color: $color-text-primary; width: 100%; }
</style>
