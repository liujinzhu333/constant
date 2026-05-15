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
          @click="cell.current && handleSelectDate(cell.date)"
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
        <template v-for="item in store.todayItems" :key="item.id">

          <!-- 普通日程 -->
          <div v-if="item.source === 'schedule'" class="event-item" :style="{ borderLeftColor: item.color }">
            <div class="event-info">
              <div class="event-title">{{ item.title }}</div>
              <el-text size="small" type="info">
                <template v-if="item.all_day">全天</template>
                <template v-else>{{ formatTime(item.start_at!) }} – {{ formatTime(item.end_at!) }}</template>
              </el-text>
              <div class="event-note" v-if="item.note">{{ item.note }}</div>
            </div>
            <el-button link type="danger" size="small" @click="store.remove(item.id)">
              <el-icon><Close /></el-icon>
            </el-button>
          </div>

          <!-- 待办（未完成 / 已完成） -->
          <div
            v-else-if="item.source === 'todo'"
            class="event-item event-item--todo"
            :class="{ 'event-item--done': item.todoDone, 'event-item--overdue': item.todoOverdue }"
            :style="{ borderLeftColor: item.color }"
          >
            <el-checkbox
              :model-value="item.todoDone"
              :disabled="item.todoDone"
              @change="!item.todoDone && toggleTodo(item.todoId!)"
              style="flex-shrink:0;margin-top:2px"
            />
            <div class="event-info">
              <div class="event-title" :class="{ 'line-through': item.todoDone }">{{ item.title }}</div>
              <div class="todo-tags" style="margin-top:4px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                <el-tag size="small" :type="item.todoDone ? 'info' : 'warning'">
                  {{ item.todoDone ? '已完成' : '待办' }}
                </el-tag>
                <el-tag v-if="item.todoOverdue" size="small" type="danger">
                  已逾期
                </el-tag>
              </div>
              <div class="event-note" v-if="item.note">{{ item.note }}</div>
            </div>
          </div>

          <!-- 计划任务 -->
          <div
            v-else-if="item.source === 'task'"
            class="event-item event-item--task"
            :class="{
              'event-item--done': item.taskDone,
              'event-item--missed': item.taskMissed,
            }"
            :style="{ borderLeftColor: item.color }"
          >
            <el-checkbox
              :model-value="item.taskDone"
              @change="togglePlanTask(item.taskId!, item.planId!, !!item.taskDone)"
              style="flex-shrink:0;margin-top:2px"
            />
            <div class="event-info">
              <div class="event-title" :class="{ 'line-through': item.taskDone, 'title--missed': item.taskMissed }">
                {{ item.title }}
              </div>
              <div style="margin-top:4px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                <el-tag size="small" :type="item.taskDone ? 'success' : item.taskMissed ? 'info' : 'success'">
                  {{ item.planTitle }}
                </el-tag>
                <el-tag v-if="item.taskMissed" size="small" type="info" effect="plain" class="missed-tag">
                  当日未完成
                </el-tag>
              </div>
            </div>
          </div>

        </template>

        <el-empty v-if="store.todayItems.length === 0" description="当天没有日程" :image-size="60" />
      </div>
    </div>

    <!-- 新建日程弹窗 -->
    <el-dialog v-model="showAdd" title="新建日程" :width="isMobile ? '92%' : '420px'">
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
import { useTodoStore } from '../../stores/todo'
import { useStudyStore } from '../../stores/study'
import dayjs from 'dayjs'

const store = useScheduleStore()
const todoStore = useTodoStore()
const studyStore = useStudyStore()
const showAdd = ref(false)
const weekDays = ['日', '一', '二', '三', '四', '五', '六']
const colors = ['#0071e3', '#34c759', '#ff9f0a', '#ff3b30', '#af52de', '#5ac8fa']
const isMobile = window.innerWidth <= 600

const form = reactive({
  title: '', note: '', start: '', end: '', allDay: false, color: '#0071e3'
})

onMounted(async () => {
  // 并行加载：日程 + 待办 + 计划（供聚合展示）
  await Promise.all([
    store.loadMonth(),
    todoStore.load(),
    studyStore.loadPlans(),
  ])
  // 计划加载完后再拉任务（依赖 studyStore.plans）
  await store.loadCheckinPlanTasks()
})

async function handleSelectDate(date: dayjs.Dayjs) {
  await store.selectDate(date)
}

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

async function toggleTodo(id: string) {
  await todoStore.toggleDone(id)
}

async function togglePlanTask(taskId: string, planId: string, currentDone: boolean) {
  // 历史日期补卡：传入选中日期，任务 last_done_date 写该日而非今天
  const targetDate = store.selectedDate.isToday() ? undefined : store.selectedDate.format('YYYY-MM-DD')
  await store.togglePlanTask(taskId, planId, currentDone, targetDate)
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
/* ========== 基础（PC 左右布局） ========== */
.schedule-view { display: flex; flex-direction: row; height: 100%; overflow: hidden; }

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
.event-item--done {
  opacity: 0.6;
}
.event-item--overdue {
  background: rgba(255, 59, 48, 0.06);
}
/* 历史日期未完成的打卡任务 */
.event-item--missed {
  background: var(--color-bg-card);
  opacity: 0.72;
}
.event-item--missed .title--missed {
  color: var(--color-text-muted);
}
.missed-tag {
  font-size: 11px;
  border-style: dashed !important;
}
.event-info { flex: 1; min-width: 0; }
.event-title { font-size: 14px; font-weight: 600; color: var(--color-text); }
.event-title.line-through { text-decoration: line-through; color: var(--color-text-muted); }
.event-note { font-size: 12px; color: var(--color-text-secondary); margin-top: 4px; }


.color-picker { display: flex; gap: 6px; }
.color-dot { width: 20px; height: 20px; border-radius: 50%; cursor: pointer; transition: transform 150ms; }
.color-dot:hover { transform: scale(1.2); }
.color-dot.selected { outline: 3px solid var(--color-text); outline-offset: 2px; }

/* ========== 移动端（上下布局） ========== */
@media (max-width: 600px) {
  .schedule-view { flex-direction: column; overflow-y: auto; }

  .calendar-panel {
    width: 100%; border-right: none; border-bottom: 1px solid var(--color-border);
    padding: 12px 12px 10px; gap: 8px; flex-shrink: 0;
  }

  .month-label { font-size: 14px; }

  .weekdays span { font-size: 10px; padding: 2px 0; }

  .days-grid { gap: 1px; }

  .day-num { font-size: 12px; }

  .day-panel { flex: 1; padding: 14px 16px; gap: 12px; overflow: visible; min-height: 0; }

  .day-header h3 { font-size: 15px; }

  .event-list { flex: none; overflow-y: visible; }
}
</style>
