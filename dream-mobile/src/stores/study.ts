/**
 * Dream Mobile — 计划 Store
 * 对标 PC 端 dream/src/stores/study.ts
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { studyDao, type PlanItem, type PlanTask } from '../utils/db'
import { logger } from '../utils/logger'

export const PLAN_CATEGORIES = [
  { value: 'all',     label: '全部', icon: '🗂', color: '#8e8e93' },
  { value: 'study',   label: '学习', icon: '📚', color: '#0071e3' },
  { value: 'work',    label: '工作', icon: '💼', color: '#ff9f0a' },
  { value: 'life',    label: '生活', icon: '🌿', color: '#34c759' },
  { value: 'fitness', label: '健身', icon: '💪', color: '#ff3b30' },
  { value: 'finance', label: '财务', icon: '💰', color: '#af52de' },
] as const

export type PlanCategory = typeof PLAN_CATEGORIES[number]['value']

export const useStudyStore = defineStore('study', () => {
  const plans = ref<PlanItem[]>([])
  const subPlans = ref<PlanItem[]>([])
  const tasks = ref<PlanTask[]>([])
  const selectedCategory = ref<PlanCategory>('all')
  const selectedPlan = ref<PlanItem | null>(null)
  const selectedSubPlan = ref<PlanItem | null>(null)
  const loading = ref(false)

  const filteredPlans = computed(() => {
    if (selectedCategory.value === 'all') return plans.value
    return plans.value.filter(p => p.category === selectedCategory.value)
  })

  async function loadPlans(category?: PlanCategory) {
    loading.value = true
    try {
      const cat = category ?? selectedCategory.value
      plans.value = await studyDao.planList(cat === 'all' ? undefined : cat, null)
    } catch (err) {
      logger.error('StudyStore', 'loadPlans 失败', err)
    } finally {
      loading.value = false
    }
  }

  async function loadSubPlans(parentId: number) {
    try {
      subPlans.value = await studyDao.planList(undefined, parentId)
    } catch (err) {
      logger.error('StudyStore', 'loadSubPlans 失败', err)
    }
  }

  async function loadTasks(planId: number) {
    try {
      tasks.value = await studyDao.taskList(planId)
    } catch (err) {
      logger.error('StudyStore', 'loadTasks 失败', err)
    }
  }

  async function addPlan(data: {
    title: string
    description?: string
    category: PlanCategory
    parent_id?: number | null
  }) {
    try {
      const id = await studyDao.planAdd({
        title: data.title,
        description: data.description || '',
        category: data.category === 'all' ? 'study' : data.category,
        status: 'active',
        parent_id: data.parent_id ?? null,
      })
      await loadPlans()
      return id
    } catch (err) {
      logger.error('StudyStore', 'addPlan 失败', err)
      console.error('[StudyStore] 添加失败', err)
    }
  }

  async function updatePlan(id: number, data: Partial<PlanItem>) {
    try {
      await studyDao.planUpdate(id, data)
      await loadPlans()
      if (selectedPlan.value?.id === id) {
        selectedPlan.value = { ...selectedPlan.value, ...data }
      }
    } catch (err) {
      logger.error('StudyStore', `updatePlan id=${id} 失败`, err)
    }
  }

  async function deletePlan(id: number) {
    try {
      await studyDao.planDelete(id)
      plans.value = plans.value.filter(p => p.id !== id)
      if (selectedPlan.value?.id === id) selectedPlan.value = null
    } catch (err) {
      logger.error('StudyStore', `deletePlan id=${id} 失败`, err)
      console.error('[StudyStore] 删除失败', err)
    }
  }

  async function addTask(planId: number, title: string) {
    try {
      await studyDao.taskAdd(planId, title)
      await loadTasks(planId)
      // 同步进度到当前计划
      syncProgress(planId)
    } catch (err) {
      logger.error('StudyStore', 'addTask 失败', err)
    }
  }

  async function taskDone(id: number, planId: number) {
    try {
      await studyDao.taskDone(id)
      const t = tasks.value.find(t => t.id === id)
      if (t) t.status = 'done'
      syncProgress(planId)
    } catch (err) {
      logger.error('StudyStore', 'taskDone 失败', err)
    }
  }

  async function taskUndone(id: number, planId: number) {
    try {
      await studyDao.taskUndone(id)
      const t = tasks.value.find(t => t.id === id)
      if (t) t.status = 'pending'
      syncProgress(planId)
    } catch (err) {
      logger.error('StudyStore', 'taskUndone 失败', err)
    }
  }

  async function deleteTask(id: number, planId: number) {
    try {
      await studyDao.taskDelete(id)
      tasks.value = tasks.value.filter(t => t.id !== id)
      syncProgress(planId)
    } catch (err) {
      logger.error('StudyStore', 'deleteTask 失败', err)
    }
  }

  /** 本地同步进度（减少数据库查询） */
  function syncProgress(planId: number) {
    const plan = plans.value.find(p => p.id === planId)
    if (plan) {
      plan.task_count = tasks.value.length
      plan.done_count = tasks.value.filter(t => t.status === 'done').length
    }
  }

  function selectCategory(cat: PlanCategory) {
    selectedCategory.value = cat
    loadPlans(cat)
  }

  function selectPlan(plan: PlanItem | null) {
    selectedPlan.value = plan
    if (plan) {
      loadTasks(plan.id)
      loadSubPlans(plan.id)
    } else {
      tasks.value = []
      subPlans.value = []
    }
  }

  return {
    plans, subPlans, tasks, selectedCategory, selectedPlan, selectedSubPlan,
    loading, filteredPlans, PLAN_CATEGORIES,
    loadPlans, loadSubPlans, loadTasks,
    addPlan, updatePlan, deletePlan,
    addTask, taskDone, taskUndone, deleteTask,
    selectCategory, selectPlan,
  }
})
