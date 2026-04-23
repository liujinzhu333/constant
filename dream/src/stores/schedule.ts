import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Schedule } from '../../electron/preload/index'
import dayjs from 'dayjs'

export type { Schedule }

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

  // 当月每天是否有日程（用于日历标记）
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

  return { schedules, currentMonth, selectedDate, monthLabel, todaySchedules, markedDays, loadMonth, prevMonth, nextMonth, selectDate, add, update, remove }
})
