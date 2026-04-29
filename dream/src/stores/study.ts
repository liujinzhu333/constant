import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { StudyPlan, StudyTask, PlanCategory } from '../../electron/preload/index'

export type { StudyPlan, StudyTask, PlanCategory }

export const PLAN_CATEGORIES: { value: PlanCategory | 'all'; label: string; icon: string; color: string }[] = [
  { value: 'all',     label: '全部',   icon: '🗂',  color: '#8e8e93' },
  { value: 'study',   label: '学习',   icon: '📚',  color: '#0071e3' },
  { value: 'work',    label: '工作',   icon: '💼',  color: '#ff9f0a' },
  { value: 'life',    label: '生活',   icon: '🏠',  color: '#34c759' },
  { value: 'fitness', label: '健身',   icon: '💪',  color: '#ff3b30' },
  { value: 'finance', label: '财务',   icon: '💰',  color: '#af52de' },
]

export const useStudyStore = defineStore('study', () => {
  const plans = ref<StudyPlan[]>([])
  const currentPlan = ref<StudyPlan | null>(null)
  const tasks = ref<StudyTask[]>([])
  const loading = ref(false)
  const activeCategory = ref<PlanCategory | 'all'>('all')

  // 子计划相关
  const subPlans = ref<StudyPlan[]>([])
  const currentSubPlan = ref<StudyPlan | null>(null)
  const subTasks = ref<StudyTask[]>([])
  const subPlansLoading = ref(false)

  // ==================== 顶层计划 ====================

  async function loadPlans(category?: PlanCategory | 'all') {
    loading.value = true
    try {
      const cat = category ?? activeCategory.value
      activeCategory.value = cat
      plans.value = await window.dreamAPI.study.planList(cat === 'all' ? undefined : cat)
    } finally {
      loading.value = false
    }
  }

  async function selectCategory(cat: PlanCategory | 'all') {
    activeCategory.value = cat
    currentPlan.value = null
    tasks.value = []
    subPlans.value = []
    currentSubPlan.value = null
    subTasks.value = []
    await loadPlans(cat)
  }

  async function selectPlan(plan: StudyPlan) {
    currentPlan.value = plan
    currentSubPlan.value = null
    subTasks.value = []
    // 并行加载任务 + 子计划
    const [t, s] = await Promise.all([
      window.dreamAPI.study.taskList(plan.id),
      window.dreamAPI.study.subPlanList(plan.id),
    ])
    tasks.value = t
    subPlans.value = s
  }

  async function addPlan(data: {
    title: string; description?: string; goal?: string
    category?: PlanCategory; color?: string
  }) {
    const plan = await window.dreamAPI.study.planAdd(data)
    plans.value.unshift({ ...plan, taskCount: 0, doneCount: 0, subPlanCount: 0 })
    return plan
  }

  async function updatePlan(id: string, data: Partial<StudyPlan>) {
    const updated = await window.dreamAPI.study.planUpdate(id, data as Record<string, unknown>)
    const idx = plans.value.findIndex(p => p.id === id)
    if (idx !== -1 && updated) {
      plans.value[idx] = { ...plans.value[idx], ...updated }
      if (currentPlan.value?.id === id) currentPlan.value = plans.value[idx]
    }
  }

  async function deletePlan(id: string) {
    await window.dreamAPI.study.planDelete(id)
    plans.value = plans.value.filter(p => p.id !== id)
    if (currentPlan.value?.id === id) {
      currentPlan.value = null
      tasks.value = []
      subPlans.value = []
      currentSubPlan.value = null
      subTasks.value = []
    }
  }

  // ==================== 子计划 ====================

  async function loadSubPlans(parentId: string) {
    subPlansLoading.value = true
    try {
      subPlans.value = await window.dreamAPI.study.subPlanList(parentId)
    } finally {
      subPlansLoading.value = false
    }
  }

  async function selectSubPlan(sub: StudyPlan) {
    currentSubPlan.value = sub
    subTasks.value = await window.dreamAPI.study.taskList(sub.id)
  }

  async function addSubPlan(data: {
    title: string; description?: string; goal?: string; color?: string
  }) {
    if (!currentPlan.value) return
    const plan = await window.dreamAPI.study.planAdd({
      ...data,
      category: currentPlan.value.category,
      parent_id: currentPlan.value.id,
    })
    subPlans.value.push({ ...plan, taskCount: 0, doneCount: 0, subPlanCount: 0 })
    // 更新顶层计划的 subPlanCount
    const idx = plans.value.findIndex(p => p.id === currentPlan.value!.id)
    if (idx !== -1) plans.value[idx].subPlanCount = (plans.value[idx].subPlanCount ?? 0) + 1
    return plan
  }

  async function updateSubPlan(id: string, data: Partial<StudyPlan>) {
    const updated = await window.dreamAPI.study.planUpdate(id, data as Record<string, unknown>)
    const idx = subPlans.value.findIndex(p => p.id === id)
    if (idx !== -1 && updated) {
      subPlans.value[idx] = { ...subPlans.value[idx], ...updated }
      if (currentSubPlan.value?.id === id) currentSubPlan.value = subPlans.value[idx]
    }
  }

  async function deleteSubPlan(id: string) {
    await window.dreamAPI.study.planDelete(id)
    subPlans.value = subPlans.value.filter(p => p.id !== id)
    if (currentSubPlan.value?.id === id) {
      currentSubPlan.value = null
      subTasks.value = []
    }
    // 更新顶层计划 subPlanCount
    if (currentPlan.value) {
      const idx = plans.value.findIndex(p => p.id === currentPlan.value!.id)
      if (idx !== -1 && (plans.value[idx].subPlanCount ?? 0) > 0) {
        plans.value[idx].subPlanCount = (plans.value[idx].subPlanCount ?? 1) - 1
      }
    }
  }

  // ==================== 顶层计划任务 ====================

  async function addTask(title: string, due_at?: number) {
    if (!currentPlan.value) return
    const task = await window.dreamAPI.study.taskAdd(currentPlan.value.id, { title, due_at })
    tasks.value.push(task)
    syncProgress('top')
  }

  async function toggleTask(task: StudyTask) {
    if (!currentPlan.value) return
    if (task.status === 'todo') {
      await window.dreamAPI.study.taskDone(task.id, currentPlan.value.id)
      task.status = 'done'
    } else {
      await window.dreamAPI.study.taskUndone(task.id, currentPlan.value.id)
      task.status = 'todo'
    }
    syncProgress('top')
  }

  async function deleteTask(id: string) {
    if (!currentPlan.value) return
    await window.dreamAPI.study.taskDelete(id, currentPlan.value.id)
    tasks.value = tasks.value.filter(t => t.id !== id)
    syncProgress('top')
  }

  // ==================== 子计划任务 ====================

  async function addSubTask(title: string, due_at?: number) {
    if (!currentSubPlan.value) return
    const task = await window.dreamAPI.study.taskAdd(currentSubPlan.value.id, { title, due_at })
    subTasks.value.push(task)
    syncProgress('sub')
  }

  async function toggleSubTask(task: StudyTask) {
    if (!currentSubPlan.value) return
    if (task.status === 'todo') {
      await window.dreamAPI.study.taskDone(task.id, currentSubPlan.value.id)
      task.status = 'done'
    } else {
      await window.dreamAPI.study.taskUndone(task.id, currentSubPlan.value.id)
      task.status = 'todo'
    }
    syncProgress('sub')
  }

  async function deleteSubTask(id: string) {
    if (!currentSubPlan.value) return
    await window.dreamAPI.study.taskDelete(id, currentSubPlan.value.id)
    subTasks.value = subTasks.value.filter(t => t.id !== id)
    syncProgress('sub')
  }

  // ==================== 进度同步 ====================

  function syncProgress(level: 'top' | 'sub') {
    if (level === 'top') {
      if (!currentPlan.value) return
      const total = tasks.value.length
      const done = tasks.value.filter(t => t.status === 'done').length
      const progress = total > 0 ? Math.round((done / total) * 100) : 0
      const idx = plans.value.findIndex(p => p.id === currentPlan.value!.id)
      if (idx !== -1) {
        plans.value[idx] = { ...plans.value[idx], progress, taskCount: total, doneCount: done }
        currentPlan.value = plans.value[idx]
      }
    } else {
      if (!currentSubPlan.value) return
      const total = subTasks.value.length
      const done = subTasks.value.filter(t => t.status === 'done').length
      const progress = total > 0 ? Math.round((done / total) * 100) : 0
      const idx = subPlans.value.findIndex(p => p.id === currentSubPlan.value!.id)
      if (idx !== -1) {
        subPlans.value[idx] = { ...subPlans.value[idx], progress, taskCount: total, doneCount: done }
        currentSubPlan.value = subPlans.value[idx]
      }
    }
  }

  return {
    plans, currentPlan, tasks, loading, activeCategory,
    subPlans, currentSubPlan, subTasks, subPlansLoading,
    loadPlans, selectCategory, selectPlan,
    addPlan, updatePlan, deletePlan,
    loadSubPlans, selectSubPlan, addSubPlan, updateSubPlan, deleteSubPlan,
    addTask, toggleTask, deleteTask,
    addSubTask, toggleSubTask, deleteSubTask,
  }
})
