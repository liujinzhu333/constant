<template>
  <div class="schedule-page">
    <van-nav-bar title="日程" />

    <!-- 月历 -->
    <div class="calendar-card">
      <div class="month-nav">
        <van-icon name="arrow-left" @click="prevMonth" />
        <span class="month-title">{{ currentMonthLabel }}</span>
        <van-icon name="arrow" @click="nextMonth" />
      </div>

      <div class="week-labels">
        <span v-for="d in weekDays" :key="d" class="week-label">{{ d }}</span>
      </div>

      <div class="calendar-grid">
        <div
          v-for="(day, idx) in calendarDays"
          :key="idx"
          class="day-cell"
          :class="{
            'other-month': !day.currentMonth,
            'is-today': day.isToday,
            'is-selected': day.date === store.selectedDate,
          }"
          @click="day.currentMonth && store.selectDate(day.date)"
        >
          <span class="day-num">{{ day.day }}</span>
          <div v-if="day.hasSchedule" class="dot"></div>
        </div>
      </div>
    </div>

    <!-- 选中日期日程 -->
    <div class="day-header">
      <span class="day-title">{{ selectedDayLabel }}</span>
      <van-button type="primary" size="mini" @click="showAddDialog">+ 添加</van-button>
    </div>

    <div class="event-list">
      <van-empty v-if="store.daySchedules.length === 0" description="当天暂无日程" image-size="80" />

      <div v-else class="event-inner">
        <div
          v-for="ev in store.daySchedules"
          :key="ev.id"
          class="event-item"
          :style="{ borderLeftColor: ev.color }"
        >
          <div class="event-time">
            <span v-if="ev.is_all_day">全天</span>
            <span v-else>{{ ev.start_time || '--' }}{{ ev.end_time ? ' - ' + ev.end_time : '' }}</span>
          </div>
          <div class="event-info">
            <span class="event-title">{{ ev.title }}</span>
            <span v-if="ev.description" class="event-desc van-ellipsis">{{ ev.description }}</span>
          </div>
          <van-icon name="delete-o" color="#ff3b30" size="18" @click.stop="confirmDelete(ev.id, ev.title)" />
        </div>
      </div>
    </div>

    <!-- 新建日程弹窗 -->
    <BottomSheet :visible="sheetVisible" @close="closePopup">
      <div class="sheet-inner">
        <van-nav-bar title="新建日程" left-text="取消" right-text="添加" @click-left="closePopup" @click-right="submitAdd" />
        <div class="form-wrap">
          <van-cell-group inset>
            <van-field v-model="form.title" label="标题" placeholder="日程标题" maxlength="100" />
            <van-field v-model="form.description" label="描述" placeholder="可选" maxlength="500" />
            <van-cell title="全天">
              <template #right-icon>
                <van-switch v-model="form.isAllDay" size="22" />
              </template>
            </van-cell>
            <template v-if="!form.isAllDay">
              <van-field label="开始">
                <template #input>
                  <input type="time" v-model="form.startTime" class="time-input" />
                </template>
              </van-field>
              <van-field label="结束">
                <template #input>
                  <input type="time" v-model="form.endTime" class="time-input" />
                </template>
              </van-field>
            </template>
          </van-cell-group>
          <div class="color-section">
            <span class="color-label">颜色</span>
            <div class="color-picker">
              <div
                v-for="c in colors"
                :key="c"
                class="color-opt"
                :style="{ background: c, outline: form.color === c ? `2px solid ${c}` : '2px solid transparent', outlineOffset: '2px' }"
                @click="form.color = c"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </BottomSheet>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { showToast, showConfirmDialog } from 'vant'
import { useScheduleStore } from '../../stores/schedule'
import BottomSheet from '../../components/BottomSheet.vue'
import dayjs from 'dayjs'

const store = useScheduleStore()
const sheetVisible = ref(false)
const weekDays = ['日', '一', '二', '三', '四', '五', '六']
const colors = ['#0071e3', '#34c759', '#ff9f0a', '#ff3b30', '#af52de', '#5856d6', '#ff2d55', '#5ac8fa']

const form = ref({ title: '', description: '', isAllDay: false, startTime: '', endTime: '', color: '#0071e3' })

onMounted(() => store.loadMonth())

const currentMonthLabel = computed(() => dayjs(store.currentMonth).format('YYYY年MM月'))
const selectedDayLabel = computed(() => {
  const d = dayjs(store.selectedDate)
  return `${d.format('MM月DD日')} 周${weekDays[d.day()]}`
})

function prevMonth() { store.selectMonth(dayjs(store.currentMonth).subtract(1, 'month').format('YYYY-MM')) }
function nextMonth() { store.selectMonth(dayjs(store.currentMonth).add(1, 'month').format('YYYY-MM')) }

const calendarDays = computed(() => {
  const start = dayjs(store.currentMonth).startOf('month')
  const end = dayjs(store.currentMonth).endOf('month')
  const days: Array<{ date: string; day: number; currentMonth: boolean; isToday: boolean; hasSchedule: boolean }> = []
  for (let i = 0; i < start.day(); i++) {
    const d = start.subtract(start.day() - i, 'day')
    days.push({ date: d.format('YYYY-MM-DD'), day: d.date(), currentMonth: false, isToday: false, hasSchedule: false })
  }
  for (let i = 0; i < end.date(); i++) {
    const d = start.add(i, 'day')
    const dateStr = d.format('YYYY-MM-DD')
    days.push({ date: dateStr, day: d.date(), currentMonth: true, isToday: d.isToday(), hasSchedule: store.markedDates.has(dateStr) })
  }
  const remain = 42 - days.length
  for (let i = 1; i <= remain; i++) {
    const d = end.add(i, 'day')
    days.push({ date: d.format('YYYY-MM-DD'), day: d.date(), currentMonth: false, isToday: false, hasSchedule: false })
  }
  return days
})

function showAddDialog() {
  form.value = { title: '', description: '', isAllDay: false, startTime: '', endTime: '', color: '#0071e3' }
  sheetVisible.value = true
}
function closePopup() { sheetVisible.value = false }

async function submitAdd() {
  if (!form.value.title.trim()) { showToast('请输入标题'); return }
  await store.addSchedule({
    title: form.value.title.trim(), description: form.value.description.trim(),
    date: store.selectedDate, start_time: form.value.startTime, end_time: form.value.endTime,
    is_all_day: form.value.isAllDay ? 1 : 0, color: form.value.color,
  })
  closePopup()
}

async function confirmDelete(id: number, title: string) {
  await showConfirmDialog({ title: '删除日程', message: `确定删除「${title}」？` })
  store.removeSchedule(id)
}
</script>

<style lang="scss" scoped>
.schedule-page { display: flex; flex-direction: column; height: 100%; background: $color-bg; }

.calendar-card {
  background: #fff;
  margin: 8px 12px 0;
  border-radius: $radius-lg;
  padding: 12px;
  box-shadow: $shadow-sm;
  flex-shrink: 0;
}

.month-nav { display: flex; align-items: center; justify-content: space-between; padding: 4px 0 10px; }
.month-title { font-size: $font-lg; font-weight: $font-bold; color: $color-text-primary; }

.week-labels { display: grid; grid-template-columns: repeat(7, 1fr); margin-bottom: 4px; }
.week-label { text-align: center; font-size: $font-xs; color: $color-text-secondary; padding: 3px 0; }

.calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }

.day-cell {
  display: flex; flex-direction: column; align-items: center;
  padding: 4px 0; min-height: 34px; border-radius: $radius-sm; cursor: pointer;
  &.other-month .day-num { color: $color-text-tertiary; }
  &.is-today .day-num { background: $color-primary; color: #fff; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }
  &.is-selected:not(.is-today) .day-num { background: #e8f3fc; color: $color-primary; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }
}
.day-num { font-size: $font-sm; color: $color-text-primary; }
.dot { width: 4px; height: 4px; border-radius: 50%; background: $color-primary; margin-top: 2px; }

.day-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px 6px; flex-shrink: 0; }
.day-title { font-size: $font-md; font-weight: $font-medium; color: $color-text-primary; }

.event-list { flex: 1; overflow-y: auto; }
.event-inner { padding: 0 12px calc(50px + env(safe-area-inset-bottom) + 16px); display: flex; flex-direction: column; gap: 8px; }

.event-item {
  display: flex; align-items: center; gap: 10px;
  background: #fff; border-radius: $radius-md; padding: 10px 12px;
  border-left: 3px solid $color-primary; cursor: pointer;
}
.event-time { font-size: $font-xs; color: $color-text-secondary; min-width: 60px; flex-shrink: 0; }
.event-info { flex: 1; min-width: 0; }
.event-title { font-size: $font-md; font-weight: $font-medium; color: $color-text-primary; display: block; }
.event-desc { font-size: $font-xs; color: $color-text-secondary; margin-top: 2px; display: block; }
.color-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

.sheet-inner { max-height: 90vh; display: flex; flex-direction: column; }
.form-wrap { overflow-y: auto; padding: 12px 0 calc(env(safe-area-inset-bottom) + 12px); }
.time-input { border: none; outline: none; font-size: $font-md; color: $color-text-primary; width: 100%; }

.color-section { padding: 12px 16px; }
.color-label { font-size: $font-sm; color: $color-text-secondary; display: block; margin-bottom: 10px; }
.color-picker { display: flex; gap: 10px; flex-wrap: wrap; }
.color-opt { width: 26px; height: 26px; border-radius: 50%; cursor: pointer; transition: transform $transition-fast; &:active { transform: scale(1.2); } }
</style>
