import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { scheduleApi, studyApi, offlinePost, offlinePatch, offlineDelete, type Schedule, type StudyPlan, type StudyTask } from '../utils/api'
import { useConnectionStore } from './connection'
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
  /** schedule: 普通日程 | todo: 待办 | task: 计划任务 */
  source: 'schedule' | 'todo' | 'task'
  // schedule 专属
  all_day?: number
  start_at?: number
  end_at?: number
  // todo 专属
  todoId?: string
  todoDone?: boolean     // true = 已完成
  todoOverdue?: boolean  // true = 已超过截止日期且未完成
  // task 专属
  taskId?: string
  taskDone?: boolean    // true = 当日已完成
  taskMissed?: boolean  // true = 历史日期未完成（可补卡）
  planId?: string       // 所属计划 id
  planTitle?: string    // 所属计划名称
}

const now = () => Math.floor(Date.now() / 1000)

export const useScheduleStore = defineStore('schedule', () => {
  const schedules = ref<Schedule[]>([])
  const currentMonth = ref(dayjs().startOf('month'))
  const selectedDate = ref(dayjs().startOf('day'))
  const loading = ref(false)

  // 计划任务缓存：planId → 任务列表（用普通对象而非 Map，确保 Vue computed 能追踪属性变化）
  const planTasksMap = ref<Record<string, StudyTask[]>>({})
  // 当前日期展示的计划列表（只加载有打卡的顶层计划）
  const checkinPlans = ref<StudyPlan[]>([])

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
    const isFuture = selectedDate.value.isAfter(dayjs().startOf('day'))

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

    // 2. 待办
    //   - 未完成（有/无截止日期）→ 今天及之后每天展示，直到完成；超过截止日期标红
    //   - 已完成 → 仅在 done_at 当天展示
    const todoStore = useTodoStore()
    const todayStr = dayjs().format('YYYY-MM-DD')
    for (const t of todoStore.items) {
      if (t.status === 'todo') {
        // 未完成：只在今天及以后展示（不展示历史日期）
        if (!isToday && !isFuture) continue
        const overdue = !!(t.due_at && dayjs.unix(t.due_at).format('YYYY-MM-DD') < todayStr)
        items.push({
          id: `todo-${t.id}`,
          title: t.title,
          note: t.note || undefined,
          color: overdue ? '#ff3b30' : '#ff9f0a',
          source: 'todo',
          todoId: t.id,
          todoDone: false,
          todoOverdue: overdue,
        })
      } else {
        // 已完成：仅在 done_at 当天展示
        if (t.done_at && dayjs.unix(t.done_at).format('YYYY-MM-DD') === selectedStr) {
          items.push({
            id: `todo-done-${t.id}`,
            title: t.title,
            note: t.note || undefined,
            color: '#8e8e93',
            source: 'todo',
            todoId: t.id,
            todoDone: true,
          })
        }
      }
    }

    // 3. 计划任务（开启打卡的顶层计划下的所有任务）
    //   - 今天/未来：展示所有任务，完成状态 = last_done_date === selectedStr
    //   - 历史日期：展示所有任务（含未完成），历史未完成用灰色边框区分
    for (const plan of checkinPlans.value) {
      const tasks = planTasksMap.value[plan.id] ?? []
      for (const task of tasks) {
        const doneOnDate = task.last_done_date === selectedStr
        const isPast = !isToday && !isFuture
        // 历史未完成：左边框用灰色，与已完成的计划色边框视觉区分
        const borderColor = (isPast && !doneOnDate) ? '#c0c4cc' : (plan.color ?? '#34c759')
        items.push({
          id: `task-${task.id}`,
          title: task.title,
          color: borderColor,
          source: 'task',
          taskId: task.id,
          taskDone: doneOnDate,
          planId: plan.id,
          planTitle: plan.title,
          taskMissed: isPast && !doneOnDate,  // 标记为历史未完成
        })
      }
    }

    // 未完成在前，已完成在后；同类内保持原有顺序
    return items.sort((a, b) => {
      const aDone = !!(a.todoDone || a.taskDone)
      const bDone = !!(b.todoDone || b.taskDone)
      if (aDone === bDone) return 0
      return aDone ? 1 : -1
    })
  })

  // -------- 日历标记 --------
  const markedDays = computed(() => {
    const set = new Set<string>()

    // 普通日程
    for (const s of schedules.value) {
      set.add(dayjs.unix(s.start_at).format('YYYY-MM-DD'))
    }

    // 待办：未完成有截止日期打点；已完成在 done_at 打点
    const todoStore = useTodoStore()
    for (const t of todoStore.items) {
      if (t.status === 'todo' && t.due_at) {
        set.add(dayjs.unix(t.due_at).format('YYYY-MM-DD'))
      } else if (t.status === 'done' && t.done_at) {
        set.add(dayjs.unix(t.done_at).format('YYYY-MM-DD'))
      }
    }

    // 无截止日期的未完成待办 → 今天打点
    const hasNoDueTodo = todoStore.items.some(t => t.status === 'todo' && !t.due_at)
    if (hasNoDueTodo) {
      set.add(dayjs().format('YYYY-MM-DD'))
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
      schedules.value = await scheduleApi.list(start, end)
    } finally {
      loading.value = false
    }
  }

  /** 加载所有开启打卡的顶层计划及其任务（切换日期时调用） */
  async function loadCheckinPlanTasks() {
    const studyStore = useStudyStore()
    // 确保计划列表已加载
    if (studyStore.plans.length === 0) {
      await studyStore.loadPlans()
    }
    const plans = studyStore.plans.filter(p => p.checkin_enabled && !p.parent_id)
    checkinPlans.value = plans
    // 并行拉取每个计划的任务
    const results = await Promise.all(plans.map(p => studyApi.taskList(p.id)))
    const record: Record<string, StudyTask[]> = {}
    plans.forEach((p, i) => { record[p.id] = results[i] })
    planTasksMap.value = record
  }

  async function prevMonth() {
    currentMonth.value = currentMonth.value.subtract(1, 'month')
    await loadMonth()
  }

  async function nextMonth() {
    currentMonth.value = currentMonth.value.add(1, 'month')
    await loadMonth()
  }

  async function selectDate(date: dayjs.Dayjs) {
    selectedDate.value = date.startOf('day')
    // 切换日期时刷新计划任务（任务完成状态按日期判断）
    await loadCheckinPlanTasks()
  }

  async function add(data: {
    title: string; note?: string; start_at: number; end_at: number
    all_day?: number; color?: string; remind_at?: number
  }) {
    const t = now()
    const s = await offlinePost<Schedule>(
      '/api/schedules',
      { ...data },
      (tempId) => ({
        id: tempId, title: data.title, note: data.note ?? '',
        start_at: data.start_at, end_at: data.end_at,
        all_day: data.all_day ?? 0, color: data.color ?? '#0071e3',
        remind_at: data.remind_at ?? null, repeat_rule: '',
        created_at: t, updated_at: t,
      }),
    )
    schedules.value.push(s)
    schedules.value.sort((a, b) => a.start_at - b.start_at)
    return s
  }

  async function update(id: string, data: Partial<Schedule>) {
    const current = schedules.value.find(s => s.id === id)
    if (!current) return
    const updated = await offlinePatch<Schedule>(
      `/api/schedules/${id}`,
      data as Record<string, unknown>,
      current,
    )
    const idx = schedules.value.findIndex(s => s.id === id)
    if (idx !== -1 && updated) schedules.value[idx] = updated
  }

  async function remove(id: string) {
    await offlineDelete(`/api/schedules/${id}`)
    schedules.value = schedules.value.filter(s => s.id !== id)
  }

  /**
   * 日程页直接切换计划任务完成状态，完成后重新拉取任务列表刷新界面。
   * 历史日期补卡时传入 targetDate，任务 last_done_date 将写为该日期而非今天。
   */
  async function togglePlanTask(taskId: string, planId: string, currentDone: boolean, targetDate?: string) {
    const http = (await import('../utils/api')).getAxiosInstance()
    const date = targetDate ?? dayjs().format('YYYY-MM-DD')

    if (currentDone) {
      // 撤销：清空 last_done_date
      await http.patch(`/api/study/tasks/${taskId}`, { status: 'todo', last_done_date: null })
    } else {
      // 完成：写入目标日期
      await http.patch(`/api/study/tasks/${taskId}`, { status: 'done', last_done_date: date })
    }

    // 重新拉取该计划任务列表
    const tasks = await studyApi.taskList(planId)
    planTasksMap.value = { ...planTasksMap.value, [planId]: tasks }

    // 判断是否需要写/撤打卡记录
    const allDoneOnDate = tasks.every((t: import('../utils/api').StudyTask) => t.last_done_date === date)
    const checkinResp = await (await import('../utils/api')).checkinApi.list(planId, 6)
    const alreadyChecked = checkinResp.some((c: import('../utils/api').StudyCheckin) => c.date === date)

    if (allDoneOnDate && !alreadyChecked) {
      try { await http.post('/api/study/checkins', { plan_id: planId, date }) } catch { /* 忽略 */ }
    } else if (!allDoneOnDate && alreadyChecked) {
      try { await http.delete(`/api/study/checkins/${planId}/${date}`) } catch { /* 忽略 */ }
    }
  }

  // 向 connection store 注册数据刷新回调（重连同步时重载当前月份日程及计划任务）
  useConnectionStore().registerRefresh(async () => { await Promise.all([loadMonth(), loadCheckinPlanTasks()]) })

  return {
    schedules, currentMonth, selectedDate, monthLabel,
    todaySchedules, todayItems, markedDays,
    loadMonth, loadCheckinPlanTasks, prevMonth, nextMonth, selectDate,
    add, update, remove, togglePlanTask,
  }
})
