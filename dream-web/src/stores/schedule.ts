import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { scheduleApi, offlinePost, offlinePatch, offlineDelete, type Schedule } from '../utils/api'
import { useConnectionStore } from './connection'
import dayjs from 'dayjs'

export type { Schedule }

const now = () => Math.floor(Date.now() / 1000)

export const useScheduleStore = defineStore('schedule', () => {
  const schedules = ref<Schedule[]>([])
  const currentMonth = ref(dayjs().startOf('month'))
  const selectedDate = ref(dayjs().startOf('day'))
  const loading = ref(false)

  const monthLabel = computed(() => currentMonth.value.format('YYYY年MM月'))

  const todaySchedules = computed(() => {
    const start = selectedDate.value.unix()
    const end = selectedDate.value.endOf('day').unix()
    return schedules.value.filter(s => s.start_at <= end && s.end_at >= start)
      .sort((a, b) => a.start_at - b.start_at)
  })

  const markedDays = computed(() => {
    const set = new Set<string>()
    schedules.value.forEach(s => {
      const d = dayjs.unix(s.start_at).format('YYYY-MM-DD')
      set.add(d)
    })
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
    const t = now()
    const s = await offlinePost<Schedule>(
      '/api/schedules',
      { ...data, start_at: data.start_at * 1000, end_at: data.end_at * 1000 },
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

  // 向 connection store 注册数据刷新回调（重连同步时重载当前月份日程）
  useConnectionStore().registerRefresh(() => loadMonth())

  return { schedules, currentMonth, selectedDate, monthLabel, todaySchedules, markedDays, loadMonth, prevMonth, nextMonth, selectDate, add, update, remove }
})
