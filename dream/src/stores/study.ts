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
    await loadPlans(cat)
  }

  async function selectPlan(plan: StudyPlan) {
    currentPlan.value = plan
    tasks.value = await window.dreamAPI.study.taskList(plan.id)
  }

  async function addPlan(data: {
    title: string; description?: string; goal?: string
    category?: PlanCategory; color?: string
  }) {
    const plan = await window.dreamAPI.study.planAdd(data)
    plans.value.unshift({ ...plan, taskCount: 0, doneCount: 0 })
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
    if (currentPlan.value?.id === id) { currentPlan.value = null; tasks.value = [] }
  }

  async function addTask(title: string, due_at?: number) {
    if (!currentPlan.value) return
    const task = await window.dreamAPI.study.taskAdd(currentPlan.value.id, { title, due_at })
    tasks.value.push(task)
    syncProgress()
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
    syncProgress()
  }

  async function deleteTask(id: string) {
    if (!currentPlan.value) return
    await window.dreamAPI.study.taskDelete(id, currentPlan.value.id)
    tasks.value = tasks.value.filter(t => t.id !== id)
    syncProgress()
  }

  function syncProgress() {
    if (!currentPlan.value) return
    const total = tasks.value.length
    const done = tasks.value.filter(t => t.status === 'done').length
    const progress = total > 0 ? Math.round((done / total) * 100) : 0
    const idx = plans.value.findIndex(p => p.id === currentPlan.value!.id)
    if (idx !== -1) {
      plans.value[idx].progress = progress
      plans.value[idx].taskCount = total
      plans.value[idx].doneCount = done
      currentPlan.value = plans.value[idx]
    }
  }

  return {
    plans, currentPlan, tasks, loading, activeCategory,
    loadPlans, selectCategory, selectPlan,
    addPlan, updatePlan, deletePlan,
    addTask, toggleTask, deleteTask
  }
})
