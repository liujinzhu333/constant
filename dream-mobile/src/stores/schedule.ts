/**
 * Dream Mobile — 日程 Store
 * 对标 PC 端 dream/src/stores/schedule.ts
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { scheduleDao, type ScheduleItem } from '../utils/db'
import { logger } from '../utils/logger'
import dayjs from 'dayjs'

export const useScheduleStore = defineStore('schedule', () => {
  const schedules = ref<ScheduleItem[]>([])
  const currentMonth = ref(dayjs().format('YYYY-MM'))
  const selectedDate = ref(dayjs().format('YYYY-MM-DD'))
  const loading = ref(false)

  /** 当月所有日程 */
  const monthSchedules = computed(() => schedules.value)

  /** 选中日期的日程 */
  const daySchedules = computed(() =>
    schedules.value.filter(s => s.date === selectedDate.value)
  )

  /** 当月有日程的日期集合（用于月历标记点） */
  const markedDates = computed(() => {
    const set = new Set<string>()
    schedules.value.forEach(s => set.add(s.date))
    return set
  })

  async function loadMonth(month?: string) {
    loading.value = true
    try {
      const m = month ?? currentMonth.value
      schedules.value = await scheduleDao.list(m)
    } catch (err) {
      logger.error('ScheduleStore', 'loadMonth 失败', err)
    } finally {
      loading.value = false
    }
  }

  async function addSchedule(data: Omit<ScheduleItem, 'id' | 'created_at' | 'updated_at'>): Promise<number | undefined> {
    try {
      const id = await scheduleDao.add(data)
      await loadMonth()
      return id
    } catch (err) {
      logger.error('ScheduleStore', 'addSchedule 失败', err)
      console.error('[ScheduleStore] 添加失败', err)
    }
  }

  async function updateSchedule(id: number, data: Partial<ScheduleItem>) {
    try {
      await scheduleDao.update(id, data)
      const idx = schedules.value.findIndex(s => s.id === id)
      if (idx !== -1) schedules.value[idx] = { ...schedules.value[idx], ...data }
    } catch (err) {
      logger.error('ScheduleStore', `updateSchedule id=${id} 失败`, err)
    }
  }

  async function removeSchedule(id: number) {
    try {
      await scheduleDao.remove(id)
      schedules.value = schedules.value.filter(s => s.id !== id)
    } catch (err) {
      logger.error('ScheduleStore', `removeSchedule id=${id} 失败`, err)
      console.error('[ScheduleStore] 删除失败', err)
    }
  }

  function selectDate(date: string) {
    selectedDate.value = date
  }

  function selectMonth(month: string) {
    currentMonth.value = month
    loadMonth(month)
  }

  return {
    schedules, currentMonth, selectedDate, loading,
    monthSchedules, daySchedules, markedDates,
    loadMonth, addSchedule, updateSchedule, removeSchedule,
    selectDate, selectMonth,
  }
})
