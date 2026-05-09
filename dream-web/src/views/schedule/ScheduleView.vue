<template>
  <div class="schedule-view">
    <!-- 日历面板 -->
    <div class="calendar-panel">
      <div class="cal-header">
        <el-button circle size="small" @click="store.prevMonth">‹</el-button>
        <span class="month-label">{{ store.monthLabel }}</span>
        <el-button circle size="small" @click="store.nextMonth">›</el-button>
      </div>

      <div class="weekdays">
        <span v-for="d in weekDays" :key="d">{{ d }}</span>
      </div>

      <div class="days-grid">
        <div
          v-for="cell in calendarCells" :key="cell.key"
          class="day-cell"
          :class="{
            'other-month': !cell.current,
            'today': cell.isToday,
            'selected': cell.isSelected,
            'has-event': cell.hasEvent
          }"
          @click="cell.current && store.selectDate(cell.date)"
        >
          <span class="day-num">{{ cell.date.date() }}</span>
          <span v-if="cell.hasEvent" class="event-dot" />
        </div>
      </div>
    </div>

    <!-- 当日日程 -->
    <div class="day-panel">
      <div class="day-header">
        <h3>{{ selectedLabel }}</h3>
        <el-button type="primary" size="small" @click="showAdd = true">+ 新建</el-button>
      </div>

      <div class="event-list">
        <div v-for="s in store.todaySchedules" :key="s.id" class="event-item" :style="{ borderLeftColor: s.color }">
          <div class="event-info">
            <div class="event-title">{{ s.title }}</div>
            <el-text size="small" type="info">
              <template v-if="s.all_day">全天</template>
              <template v-else>{{ formatTime(s.start_at) }} – {{ formatTime(s.end_at) }}</template>
            </el-text>
            <div class="event-note" v-if="s.note">{{ s.note }}</div>
          </div>
          <el-button link type="danger" size="small" @click="store.remove(s.id)">
            <el-icon><Close /></el-icon>
          </el-button>
        </div>

        <el-empty v-if="store.todaySchedules.length === 0" description="当天没有日程" :image-size="60" />
      </div>
    </div>

    <!-- 新建日程弹窗 -->
    <el-dialog v-model="showAdd" title="新建日程" width="420px">
      <el-form :model="form" label-width="60px">
        <el-form-item label="标题">
          <el-input v-model="form.title" placeholder="日程标题" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="2" placeholder="备注（可选）" />
        </el-form-item>
        <el-form-item label="开始">
          <el-date-picker v-model="form.start" type="datetime" placeholder="选择时间" format="YYYY/MM/DD HH:mm" value-format="YYYY-MM-DD HH:mm:ss" style="width:100%" />
        </el-form-item>
        <el-form-item label="结束">
          <el-date-picker v-model="form.end" type="datetime" placeholder="选择时间" format="YYYY/MM/DD HH:mm" value-format="YYYY-MM-DD HH:mm:ss" style="width:100%" />
        </el-form-item>
        <el-form-item label="全天">
          <el-switch v-model="form.allDay" />
        </el-form-item>
        <el-form-item label="颜色">
          <div class="color-picker">
            <div v-for="c in colors" :key="c" class="color-dot"
              :style="{ background: c }" :class="{ selected: form.color === c }"
              @click="form.color = c" />
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAdd = false">取消</el-button>
        <el-button type="primary" @click="submit" :disabled="!form.title.trim()">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { Close } from '@element-plus/icons-vue'
import { useScheduleStore } from '../../stores/schedule'
import dayjs from 'dayjs'

const store = useScheduleStore()
const showAdd = ref(false)
const weekDays = ['日', '一', '二', '三', '四', '五', '六']
const colors = ['#0071e3', '#34c759', '#ff9f0a', '#ff3b30', '#af52de', '#5ac8fa']

const form = reactive({
  title: '', note: '', start: '', end: '', allDay: false, color: '#0071e3'
})

onMounted(() => store.loadMonth())

const selectedLabel = computed(() => {
  const d = store.selectedDate
  if (d.isToday()) return '今天 ' + d.format('MM月DD日')
  return d.format('MM月DD日 dddd')
})

const calendarCells = computed(() => {
  const month = store.currentMonth
  const firstDay = month.startOf('month').day()
  const daysInMonth = month.daysInMonth()
  const cells = []

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = month.startOf('month').subtract(i + 1, 'day')
    cells.push({ key: d.format('YYYY-MM-DD'), date: d, current: false, isToday: false, isSelected: false, hasEvent: false })
  }
  for (let i = 1; i <= daysInMonth; i++) {
    const d = month.date(i)
    const key = d.format('YYYY-MM-DD')
    cells.push({ key, date: d, current: true, isToday: d.isToday(), isSelected: d.format('YYYY-MM-DD') === store.selectedDate.format('YYYY-MM-DD'), hasEvent: store.markedDays.has(key) })
  }
  const remaining = 42 - cells.length
  for (let i = 1; i <= remaining; i++) {
    const d = month.endOf('month').add(i, 'day')
    cells.push({ key: d.format('YYYY-MM-DD'), date: d, current: false, isToday: false, isSelected: false, hasEvent: false })
  }
  return cells
})

function formatTime(ts: number) {
  return dayjs.unix(ts).format('HH:mm')
}

async function submit() {
  if (!form.title.trim()) return
  const start_at = form.start ? dayjs(form.start).unix() : store.selectedDate.unix()
  const end_at = form.end ? dayjs(form.end).unix() : store.selectedDate.endOf('day').unix()
  await store.add({ title: form.title, note: form.note, start_at, end_at, all_day: form.allDay ? 1 : 0, color: form.color })
  Object.assign(form, { title: '', note: '', start: '', end: '', allDay: false, color: '#0071e3' })
  showAdd.value = false
}
</script>

<style scoped>
.schedule-view { display: flex; height: 100%; overflow: hidden; }

.calendar-panel {
  width: 280px; flex-shrink: 0; border-right: 1px solid var(--color-border);
  background: var(--color-bg-sidebar); padding: 16px 14px; display: flex; flex-direction: column; gap: 12px;
}
.cal-header { display: flex; align-items: center; justify-content: space-between; }
.month-label { font-size: 15px; font-weight: 600; color: var(--color-text); }

.weekdays { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; }
.weekdays span { font-size: 11px; color: var(--color-text-muted); padding: 4px 0; font-weight: 600; }

.days-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.day-cell {
  aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  border-radius: var(--radius-sm); cursor: pointer; position: relative; transition: all 150ms;
}
.day-cell:hover:not(.other-month) { background: var(--color-border); }
.day-cell.other-month { opacity: 0.3; cursor: default; }
.day-cell.today .day-num { color: var(--color-accent); font-weight: 700; }
.day-cell.selected { background: var(--color-accent) !important; }
.day-cell.selected .day-num { color: #fff !important; font-weight: 700; }
.day-num { font-size: 13px; color: var(--color-text); line-height: 1; }
.event-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--color-accent); margin-top: 2px; }
.day-cell.selected .event-dot { background: rgba(255,255,255,0.8); }

.day-panel { flex: 1; display: flex; flex-direction: column; padding: 20px 24px; gap: 16px; overflow: hidden; }
.day-header { display: flex; align-items: center; justify-content: space-between; }
.day-header h3 { font-size: 18px; font-weight: 700; color: var(--color-text); }

.event-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.event-item {
  display: flex; align-items: flex-start; gap: 12px;
  background: var(--color-bg-card); border: 1px solid var(--color-border);
  border-left-width: 4px; border-radius: var(--radius-md); padding: 12px 14px;
}
.event-info { flex: 1; min-width: 0; }
.event-title { font-size: 14px; font-weight: 600; color: var(--color-text); }
.event-note { font-size: 12px; color: var(--color-text-secondary); margin-top: 4px; }

.color-picker { display: flex; gap: 6px; }
.color-dot { width: 20px; height: 20px; border-radius: 50%; cursor: pointer; transition: transform 150ms; }
.color-dot:hover { transform: scale(1.2); }
.color-dot.selected { outline: 3px solid var(--color-text); outline-offset: 2px; }
</style>
