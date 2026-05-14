import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Schedule } from '../../electron/preload/index'
import { useTodoStore } from './todo'
import { useStudyStore } from './study'
import dayjs from 'dayjs'

export type { Schedule }

/** 日程面板展示的统一条目类型 */
export interface DayItem {
  id: string
  title: string
  note?: string
  color: string
  /** schedule: 普通日程 | todo: 未完成待办 | checkin: 打卡计划 */
  source: 'schedule' | 'todo' | 'checkin'
  // schedule 专属
  all_day?: number
  start_at?: number
  end_at?: number
  // todo 专属（用于勾选）
  todoId?: string
  // checkin 专属
  planId?: string
}

export const useScheduleStore = defineStore('schedule', () => {
  const schedules = ref<Schedule[]>([])
  const currentMonth = ref(dayjs().startOf('month'))
  const selectedDate = ref(dayjs().startOf('day'))
  const loading = ref(false)

  const monthLabel = computed(() => currentMonth.value.format('YYYY年MM月'))

  // -------- 聚合：普通日程（当日范围内）--------
  const todaySchedules = computed(() => {
    const start = selectedDate.value.unix()
    const end = selectedDate.value.endOf('day').unix()
    return schedules.value
      .filter(s => s.start_at <= end && s.end_at >= start)
      .sort((a, b) => a.start_at - b.start_at)
  })

  // -------- 聚合：当日所有展示条目 --------
  const todayItems = computed<DayItem[]>(() => {
    const items: DayItem[] = []
    const selectedStr = selectedDate.value.format('YYYY-MM-DD')
    const isToday = selectedDate.value.isToday()

    // 1. 普通日程
    for (const s of todaySchedules.value) {
      items.push({
        id: s.id,
        title: s.title,
        note: s.note,
        color: s.color ?? '#0071e3',
        source: 'schedule',
        all_day: s.all_day,
        start_at: s.start_at,
        end_at: s.end_at,
      })
    }

    // 2. 未完成待办（截止日期为当天，或无截止日期且选中日期为今天）
    const todoStore = useTodoStore()
    for (const t of todoStore.items) {
      if (t.status !== 'todo') continue
      const dueDate = t.due_at ? dayjs.unix(t.due_at).format('YYYY-MM-DD') : null
      if (dueDate === selectedStr || (!dueDate && isToday)) {
        items.push({
          id: `todo-${t.id}`,
          title: t.title,
          note: t.note || undefined,
          color: '#ff9f0a',
          source: 'todo',
          todoId: t.id,
        })
      }
    }

    // 3. 开启打卡的计划（仅在选中日期为今天时展示）
    if (isToday) {
      const studyStore = useStudyStore()
      for (const p of studyStore.plans) {
        if (!p.checkin_enabled) continue
        items.push({
          id: `checkin-${p.id}`,
          title: `打卡：${p.title}`,
          note: p.checkin_goal || undefined,
          color: p.color ?? '#34c759',
          source: 'checkin',
          planId: p.id,
        })
      }
    }

    return items
  })

  // -------- 日历标记 --------
  const markedDays = computed(() => {
    const set = new Set<string>()

    // 普通日程
    for (const s of schedules.value) {
      set.add(dayjs.unix(s.start_at).format('YYYY-MM-DD'))
    }

    // 未完成待办（有截止日期的）
    const todoStore = useTodoStore()
    for (const t of todoStore.items) {
      if (t.status !== 'todo' || !t.due_at) continue
      set.add(dayjs.unix(t.due_at).format('YYYY-MM-DD'))
    }

    // 有打卡计划 → 今天打点
    const studyStore = useStudyStore()
    const hasCheckinPlan = studyStore.plans.some(p => p.checkin_enabled)
    if (hasCheckinPlan) {
      set.add(dayjs().format('YYYY-MM-DD'))
    }

    return set
  })

  async function loadMonth(month = currentMonth.value) {
    loading.value = true
    try {
      const start = month.startOf('month').unix()
      const end = month.endOf('month').unix()
      schedules.value = await window.dreamAPI.schedule.list(start, end)
    } finally {
      loading.value = false
    }
  }

  async function prevMonth() {
    currentMonth.value = currentMonth.value.subtract(1, 'month')
    await loadMonth()
  }

  async function nextMonth() {
    currentMonth.value = currentMonth.value.add(1, 'month')
    await loadMonth()
  }

  function selectDate(date: dayjs.Dayjs) {
    selectedDate.value = date.startOf('day')
  }

  async function add(data: {
    title: string; note?: string; start_at: number; end_at: number
    all_day?: number; color?: string; remind_at?: number
  }) {
    const s = await window.dreamAPI.schedule.add(data)
    schedules.value.push(s)
    schedules.value.sort((a, b) => a.start_at - b.start_at)
    return s
  }

  async function update(id: string, data: Partial<Schedule>) {
    const updated = await window.dreamAPI.schedule.update(id, data as Record<string, unknown>)
    const idx = schedules.value.findIndex(s => s.id === id)
    if (idx !== -1 && updated) schedules.value[idx] = updated
  }

  async function remove(id: string) {
    await window.dreamAPI.schedule.delete(id)
    schedules.value = schedules.value.filter(s => s.id !== id)
  }

  return {
    schedules, currentMonth, selectedDate, monthLabel,
    todaySchedules, todayItems, markedDays,
    loadMonth, prevMonth, nextMonth, selectDate,
    add, update, remove,
  }
})
