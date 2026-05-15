import { defineStore } from 'pinia'
import { ref } from 'vue'
import { studyApi, checkinApi, offlinePost, offlinePatch, offlineDelete, readCache, writeCache, isApiOffline, type StudyPlan, type StudyTask, type StudyCheckin, type PlanCategory } from '../utils/api'
import { getAxiosInstance } from '../utils/api'
import { useConnectionStore } from './connection'

export type { StudyPlan, StudyTask, StudyCheckin, PlanCategory }

export const PLAN_CATEGORIES: { value: PlanCategory | 'all'; label: string; icon: string; color: string }[] = [
  { value: 'all',     label: '全部',   icon: '🗂',  color: '#8e8e93' },
  { value: 'study',   label: '学习',   icon: '📚',  color: '#0071e3' },
  { value: 'work',    label: '工作',   icon: '💼',  color: '#ff9f0a' },
  { value: 'life',    label: '生活',   icon: '🏠',  color: '#34c759' },
  { value: 'fitness', label: '健身',   icon: '💪',  color: '#ff3b30' },
  { value: 'finance', label: '财务',   icon: '💰',  color: '#af52de' },
]

const now = () => Math.floor(Date.now() / 1000)

export const useStudyStore = defineStore('study', () => {
  const plans = ref<StudyPlan[]>([])
  const currentPlan = ref<StudyPlan | null>(null)
  const tasks = ref<StudyTask[]>([])
  const loading = ref(false)
  const activeCategory = ref<PlanCategory | 'all'>('all')

  const subPlans = ref<StudyPlan[]>([])
  const currentSubPlan = ref<StudyPlan | null>(null)
  const subTasks = ref<StudyTask[]>([])
  const subPlansLoading = ref(false)

  // 打卡
  const checkins = ref<StudyCheckin[]>([])
  const checkinLoading = ref(false)

  // 热力图选中日期（null = 未选中，展示今日；选中后展示补卡模式）
  const selectedCheckinDate = ref<string | null>(null)
  // 选中日期的任务列表（从服务端按 last_done_date 过滤或全量）
  const selectedDateTasks = ref<StudyTask[]>([])
  const selectedDateTasksLoading = ref(false)

  // ==================== 顶层计划 ====================

  async function loadPlans(category?: PlanCategory | 'all') {
    loading.value = true
    try {
      const cat = category ?? activeCategory.value
      activeCategory.value = cat
      plans.value = await studyApi.planList(cat === 'all' ? undefined : cat)
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
    // 切换计划时退出补卡模式
    selectedCheckinDate.value = null
    selectedDateTasks.value = []
    const [t, s, c] = await Promise.all([
      studyApi.taskList(plan.id),
      studyApi.subPlanList(plan.id),
      checkinApi.list(plan.id, 3),
    ])
    tasks.value = t
    subPlans.value = s
    checkins.value = c
  }

  async function addPlan(data: {
    title: string; description?: string; goal?: string
    category?: PlanCategory; color?: string
    checkin_enabled?: number; checkin_goal?: string; checkin_target_days?: number
  }) {
    const t = now()
    const plan = await offlinePost<StudyPlan>(
      '/api/study/plans',
      data as Record<string, unknown>,
      (tempId) => ({
        id: tempId, title: data.title,
        description: data.description ?? '', goal: data.goal ?? '',
        category: data.category ?? 'study', status: 'active',
        start_date: null, end_date: null, progress: 0,
        color: data.color ?? '#0071e3', parent_id: null,
        created_at: t, updated_at: t,
        taskCount: 0, doneCount: 0, subPlanCount: 0,
        task_count: 0, done_count: 0, sub_plan_count: 0,
        checkin_enabled: data.checkin_enabled ?? 0,
        checkin_goal: data.checkin_goal ?? '',
        checkin_target_days: data.checkin_target_days ?? 0,
      }),
    )
    plans.value.unshift({ ...plan, taskCount: 0, doneCount: 0, subPlanCount: 0 })
    return plan
  }

  async function updatePlan(id: string, data: Partial<StudyPlan>) {
    const current = plans.value.find(p => p.id === id)
    if (!current) return
    const updated = await offlinePatch<StudyPlan>(
      `/api/study/plans/${id}`,
      data as Record<string, unknown>,
      current,
    )
    const idx = plans.value.findIndex(p => p.id === id)
    if (idx !== -1 && updated) {
      plans.value[idx] = { ...plans.value[idx], ...updated }
      if (currentPlan.value?.id === id) currentPlan.value = plans.value[idx]
    }
  }

  async function deletePlan(id: string) {
    await offlineDelete(`/api/study/plans/${id}`)
    plans.value = plans.value.filter(p => p.id !== id)
    if (currentPlan.value?.id === id) {
      currentPlan.value = null; tasks.value = []
      subPlans.value = []; currentSubPlan.value = null; subTasks.value = []
    }
  }

  // ==================== 子计划 ====================

  async function loadSubPlans(parentId: string) {
    subPlansLoading.value = true
    try {
      subPlans.value = await studyApi.subPlanList(parentId)
    } finally {
      subPlansLoading.value = false
    }
  }

  async function selectSubPlan(sub: StudyPlan) {
    currentSubPlan.value = sub
    subTasks.value = await studyApi.taskList(sub.id)
  }

  async function addSubPlan(data: {
    title: string; description?: string; goal?: string; color?: string
  }) {
    if (!currentPlan.value) return
    const t = now()
    const plan = await offlinePost<StudyPlan>(
      '/api/study/plans',
      { ...data, category: currentPlan.value.category, parent_id: currentPlan.value.id } as Record<string, unknown>,
      (tempId) => ({
        id: tempId, title: data.title,
        description: data.description ?? '', goal: data.goal ?? '',
        category: currentPlan.value!.category, status: 'active',
        start_date: null, end_date: null, progress: 0,
        color: data.color ?? '#0071e3', parent_id: currentPlan.value!.id,
        created_at: t, updated_at: t,
        taskCount: 0, doneCount: 0, subPlanCount: 0,
        task_count: 0, done_count: 0, sub_plan_count: 0,
        checkin_enabled: 0, checkin_goal: '', checkin_target_days: 0,
      }),
    )
    subPlans.value.push({ ...plan, taskCount: 0, doneCount: 0, subPlanCount: 0 })
    const idx = plans.value.findIndex(p => p.id === currentPlan.value!.id)
    if (idx !== -1) plans.value[idx].subPlanCount = (plans.value[idx].subPlanCount ?? 0) + 1

    // 离线时 offlinePost 会把数据写入 /api/study/plans 的缓存（顶层计划列表），
    // 但子计划的缓存 key 是 /api/study/plans?parent_id=<id>，需要单独写入，
    // 否则切换计划后 subPlanList 走离线缓存时读不到该子计划。
    // 同时要从顶层计划缓存中移除被错误插入的子计划条目（parent_id != null 的不属于顶层）。
    if ((plan as StudyPlan & { _offline?: boolean })._offline) {
      const parentId = currentPlan.value!.id

      // 1. 写入子计划专属缓存
      const subCachePath = `/api/study/plans?parent_id=${parentId}`
      const subCached = readCache<StudyPlan[]>(subCachePath) ?? []
      writeCache(subCachePath, [...subCached, plan])

      // 2. 从顶层计划缓存中移除被错误插入的子计划（parent_id 不为 null 的条目）
      const topCachePath = `/api/study/plans?parent_id=null`
      const topCached = readCache<StudyPlan[]>(topCachePath) ?? []
      writeCache(topCachePath, topCached.filter(p => p.id !== plan.id))
    }

    return plan
  }

  async function updateSubPlan(id: string, data: Partial<StudyPlan>) {
    const current = subPlans.value.find(p => p.id === id)
    if (!current) return
    const updated = await offlinePatch<StudyPlan>(
      `/api/study/plans/${id}`,
      data as Record<string, unknown>,
      current,
    )
    const idx = subPlans.value.findIndex(p => p.id === id)
    if (idx !== -1 && updated) {
      subPlans.value[idx] = { ...subPlans.value[idx], ...updated }
      if (currentSubPlan.value?.id === id) currentSubPlan.value = subPlans.value[idx]
    }
  }

  async function deleteSubPlan(id: string) {
    await offlineDelete(`/api/study/plans/${id}`)
    subPlans.value = subPlans.value.filter(p => p.id !== id)
    if (currentSubPlan.value?.id === id) { currentSubPlan.value = null; subTasks.value = [] }
    if (currentPlan.value) {
      const idx = plans.value.findIndex(p => p.id === currentPlan.value!.id)
      if (idx !== -1 && (plans.value[idx].subPlanCount ?? 0) > 0)
        plans.value[idx].subPlanCount = (plans.value[idx].subPlanCount ?? 1) - 1
    }
  }

  // ==================== 打卡（只读，由任务完成自动触发） ====================

  async function loadCheckins(planId: string, months = 3) {
    checkinLoading.value = true
    try {
      checkins.value = await checkinApi.list(planId, months)
    } finally {
      checkinLoading.value = false
    }
  }

  /**
   * 点击热力图格子，切换选中日期。
   * 再次点击已选中日期 → 取消选中（回到今日模式）。
   */
  async function selectCheckinDate(date: string) {
    const today = new Date().toISOString().slice(0, 10)
    if (selectedCheckinDate.value === date || date === today) {
      // 取消选中 / 点今天 → 退出补卡模式
      selectedCheckinDate.value = null
      selectedDateTasks.value = []
      return
    }
    selectedCheckinDate.value = date
    await loadSelectedDateTasks(date)
  }

  /** 加载选中历史日期的任务列表（走服务端，带 last_done_date 过滤） */
  async function loadSelectedDateTasks(date: string) {
    if (!currentPlan.value) return
    selectedDateTasksLoading.value = true
    try {
      // 拉取该计划全量任务（服务端已按 last_done_date 做今日重置，历史日期需客户端过滤）
      const all = await studyApi.taskList(currentPlan.value.id)
      // 历史日期：展示所有任务（让用户知道哪些没完成），完成状态 = last_done_date === date
      selectedDateTasks.value = all.map(t => ({
        ...t,
        status: t.last_done_date === date ? 'done' as const : 'todo' as const,
      }))
    } finally {
      selectedDateTasksLoading.value = false
    }
  }

  /**
   * 补卡模式下切换任务完成状态（历史日期）。
   * done → 发 PATCH last_done_date=date；todo → 发 PATCH last_done_date=null（需检查是否有其它日期）。
   * 完成后重新判断是否需要写/撤打卡记录。
   */
  async function toggleSelectedDateTask(task: StudyTask) {
    if (!selectedCheckinDate.value || !currentPlan.value) return
    const date = selectedCheckinDate.value
    const planId = currentPlan.value.id
    const isDone = task.last_done_date === date

    if (isDone) {
      // 撤销该日完成：清空 last_done_date（只影响该任务）
      await getAxiosInstance().patch(`/api/study/tasks/${task.id}`, { status: 'todo', last_done_date: null })
    } else {
      // 补完成：写 last_done_date = 选中日期
      await getAxiosInstance().patch(`/api/study/tasks/${task.id}`, { status: 'done', last_done_date: date })
    }

    // 重新加载选中日期任务（刷新完成状态）
    await loadSelectedDateTasks(date)

    // 重新判断该日打卡：该日所有任务 last_done_date === date 才打卡
    const allDoneOnDate = selectedDateTasks.value.every(t => t.last_done_date === date)
    const alreadyChecked = checkins.value.some(c => c.date === date)
    if (allDoneOnDate && !alreadyChecked) {
      await manualCheckin(planId, date)
    } else if (!allDoneOnDate && alreadyChecked) {
      await manualRemoveCheckin(planId, date)
    }
  }

  /** 手动写入指定日期的打卡记录（补卡） */
  async function manualCheckin(planId: string, date: string) {
    try {
      const http = getAxiosInstance()
      await http.post('/api/study/checkins', { plan_id: planId, date })
      // 刷新打卡记录
      checkins.value = await checkinApi.list(planId, 3)
    } catch { /* 忽略，可能已存在 */ }
  }

  /** 手动撤销指定日期的打卡记录 */
  async function manualRemoveCheckin(planId: string, date: string) {
    try {
      const http = getAxiosInstance()
      await http.delete(`/api/study/checkins/${planId}/${date}`)
      checkins.value = checkins.value.filter(c => c.date !== date)
    } catch { /* 忽略 */ }
  }

  /** 今日是否已打卡 */
  function todayChecked(): boolean {
    const today = new Date().toISOString().slice(0, 10)
    return checkins.value.some(c => c.date === today)
  }

  /** 连续打卡天数（从今天往前数连续的天数） */
  function streakDays(): number {
    const set = new Set(checkins.value.map(c => c.date))
    let streak = 0
    const d = new Date()
    while (true) {
      const key = d.toISOString().slice(0, 10)
      if (!set.has(key)) break
      streak++
      d.setDate(d.getDate() - 1)
    }
    return streak
  }

  // ==================== 任务 ====================

  async function addTask(title: string, due_at?: number) {
    if (!currentPlan.value) return
    const t = now()
    const planId = currentPlan.value.id
    const task = await offlinePost<StudyTask>(
      '/api/study/tasks',
      { plan_id: planId, title, due_at },
      (tempId) => ({
        id: tempId, plan_id: planId,
        title, status: 'todo' as const, due_at: due_at ?? null,
        sort_order: tasks.value.length + 1, last_done_date: null, created_at: t, updated_at: t,
      }),
    )
    tasks.value.push(task)
    syncProgress('top')

    // 离线时 offlinePost 写入 /api/study/tasks（无查询参数），
    // 但 taskList 读缓存路径是 /api/study/tasks?plan_id=<id>，key 不一致导致切换计划后任务丢失。
    // 需要手动写入正确的任务缓存，并从无参数的通用缓存中移除错误插入的条目。
    if ((task as StudyTask & { _offline?: boolean })._offline) {
      const taskCachePath = `/api/study/tasks?plan_id=${planId}`
      const cached = readCache<StudyTask[]>(taskCachePath) ?? []
      writeCache(taskCachePath, [...cached, task])

      const genericCachePath = '/api/study/tasks'
      const genericCached = readCache<StudyTask[]>(genericCachePath) ?? []
      writeCache(genericCachePath, genericCached.filter(t => t.id !== task.id))
    }
  }

  async function toggleTask(task: StudyTask) {
    if (!currentPlan.value) return
    const planId = currentPlan.value.id
    // 在 syncProgress 替换 currentPlan.value 之前，先把打卡开关状态保存下来
    const checkinEnabled = !!currentPlan.value.checkin_enabled
    const today = new Date().toISOString().slice(0, 10)
    const patch = task.status === 'todo'
      ? { status: 'done' as const, last_done_date: today }
      : { status: 'todo' as const, last_done_date: null as string | null }
    await offlinePatch<StudyTask>(`/api/study/tasks/${task.id}`, patch, task)
    // 乐观更新内存（用 map 替换，保证 Vue 响应式追踪）
    const idx = tasks.value.findIndex(t => t.id === task.id)
    if (idx !== -1) tasks.value[idx] = { ...tasks.value[idx], ...patch }
    syncProgress('top')

    // offlinePatch 内部 listPathOf 得到 /api/study/tasks（无 plan_id），
    // 实际缓存 key 是 /api/study/tasks?plan_id=<id>，需手动修正缓存。
    const taskCachePath = `/api/study/tasks?plan_id=${planId}`
    const cached = readCache<StudyTask[]>(taskCachePath) ?? []
    writeCache(taskCachePath, cached.map(t => t.id === task.id ? { ...t, ...patch } : t))

    // 若计划开启打卡，在本地直接判断是否需要自动打卡/撤卡
    // 离线时后端不会执行 tryAutoCheckin，需前端自己维护 checkins
    if (checkinEnabled) {
      // 按天重置语义：只有 last_done_date === today 的才算今日完成
      const allDone = tasks.value.length > 0 && tasks.value.every(t => t.last_done_date === today)
      const alreadyChecked = checkins.value.some(c => c.date === today)
      if (allDone && !alreadyChecked) {
        checkins.value = [...checkins.value, { id: `local_${today}`, plan_id: planId, date: today, note: '', created_at: Math.floor(Date.now() / 1000) }]
      } else if (!allDone && alreadyChecked) {
        checkins.value = checkins.value.filter(c => c.date !== today)
      }
      // 在线时额外从服务端同步一次（服务端 tryAutoCheckin 已写入真实记录）
      // 离线时跳过，否则会用空数组覆盖刚写入的本地打卡记录
      if (!isApiOffline()) {
        checkinApi.list(planId, 3).then(list => {
          checkins.value = list
        }).catch(() => {/* 忽略 */})
      }
    }
  }

  async function deleteTask(id: string) {
    if (!currentPlan.value) return
    await offlineDelete(`/api/study/tasks/${id}`)
    tasks.value = tasks.value.filter(t => t.id !== id)
    syncProgress('top')
  }

  async function addSubTask(title: string, due_at?: number) {
    if (!currentSubPlan.value) return
    const t = now()
    const planId = currentSubPlan.value.id
    const task = await offlinePost<StudyTask>(
      '/api/study/tasks',
      { plan_id: planId, title, due_at },
      (tempId) => ({
        id: tempId, plan_id: planId,
        title, status: 'todo' as const, due_at: due_at ?? null,
        sort_order: subTasks.value.length + 1, last_done_date: null, created_at: t, updated_at: t,
      }),
    )
    subTasks.value.push(task)
    syncProgress('sub')

    // 同 addTask，离线时写入正确的子计划任务缓存路径，并清理通用缓存中的错误条目。
    if ((task as StudyTask & { _offline?: boolean })._offline) {
      const taskCachePath = `/api/study/tasks?plan_id=${planId}`
      const cached = readCache<StudyTask[]>(taskCachePath) ?? []
      writeCache(taskCachePath, [...cached, task])

      const genericCachePath = '/api/study/tasks'
      const genericCached = readCache<StudyTask[]>(genericCachePath) ?? []
      writeCache(genericCachePath, genericCached.filter(t => t.id !== task.id))
    }
  }

  async function toggleSubTask(task: StudyTask) {
    if (!currentSubPlan.value) return
    const planId = currentSubPlan.value.id
    const patch = task.status === 'todo'
      ? { status: 'done' as const }
      : { status: 'todo' as const }
    await offlinePatch<StudyTask>(`/api/study/tasks/${task.id}`, patch, task)
    // 乐观更新内存（用 map 替换，保证 Vue 响应式追踪）
    const idx = subTasks.value.findIndex(t => t.id === task.id)
    if (idx !== -1) subTasks.value[idx] = { ...subTasks.value[idx], ...patch }
    syncProgress('sub')

    // 同 toggleTask，手动修正缓存 key
    const taskCachePath = `/api/study/tasks?plan_id=${planId}`
    const cached = readCache<StudyTask[]>(taskCachePath) ?? []
    writeCache(taskCachePath, cached.map(t => t.id === task.id ? { ...t, ...patch } : t))
  }

  async function deleteSubTask(id: string) {
    if (!currentSubPlan.value) return
    await offlineDelete(`/api/study/tasks/${id}`)
    subTasks.value = subTasks.value.filter(t => t.id !== id)
    syncProgress('sub')
  }

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
        // 同步写入顶层计划缓存，防止切换后统计数据丢失
        const topCachePath = `/api/study/plans?parent_id=null`
        const topCached = readCache<StudyPlan[]>(topCachePath) ?? []
        writeCache(topCachePath, topCached.map(p => p.id === currentPlan.value!.id ? plans.value[idx] : p))
      }
    } else {
      if (!currentSubPlan.value) return
      const parentId = currentPlan.value?.id
      const total = subTasks.value.length
      const done = subTasks.value.filter(t => t.status === 'done').length
      const progress = total > 0 ? Math.round((done / total) * 100) : 0
      const idx = subPlans.value.findIndex(p => p.id === currentSubPlan.value!.id)
      if (idx !== -1) {
        subPlans.value[idx] = { ...subPlans.value[idx], progress, taskCount: total, doneCount: done }
        currentSubPlan.value = subPlans.value[idx]
        // 同步写入子计划缓存，防止切换后统计数据丢失
        if (parentId) {
          const subCachePath = `/api/study/plans?parent_id=${parentId}`
          const subCached = readCache<StudyPlan[]>(subCachePath) ?? []
          writeCache(subCachePath, subCached.map(p => p.id === currentSubPlan.value!.id ? subPlans.value[idx] : p))
        }
      }
    }
  }

  /**
   * 不依赖 currentPlan，直接按 taskId + planId 切换任务完成状态。
   * 供日程页等场景使用，完成后返回更新后的任务对象。
   */
  async function toggleTaskById(taskId: string, planId: string, currentDone: boolean): Promise<StudyTask | null> {
    const today = new Date().toISOString().slice(0, 10)
    const patch = currentDone
      ? { status: 'todo' as const, last_done_date: null as string | null }
      : { status: 'done' as const, last_done_date: today }

    // 构造最小 task 占位（offlinePatch 需要原始对象做乐观合并）
    const placeholder: StudyTask = {
      id: taskId, plan_id: planId, title: '', status: currentDone ? 'done' : 'todo',
      due_at: null, sort_order: 0, last_done_date: currentDone ? today : null,
      created_at: 0, updated_at: 0,
    }
    const updated = await offlinePatch<StudyTask>(`/api/study/tasks/${taskId}`, patch, placeholder)

    // 若 tasks 里恰好有这条（当前计划打开着），一并更新内存
    const idx = tasks.value.findIndex(t => t.id === taskId)
    if (idx !== -1) tasks.value[idx] = { ...tasks.value[idx], ...patch }
    const subIdx = subTasks.value.findIndex(t => t.id === taskId)
    if (subIdx !== -1) subTasks.value[subIdx] = { ...subTasks.value[subIdx], ...patch }

    // 修正缓存
    const taskCachePath = `/api/study/tasks?plan_id=${planId}`
    const cached = readCache<StudyTask[]>(taskCachePath) ?? []
    writeCache(taskCachePath, cached.map(t => t.id === taskId ? { ...t, ...patch } : t))

    return updated ?? null
  }

  // 向 connection store 注册数据刷新回调（重连同步时重载顶层计划列表，以及当前打开计划的详细数据）
  useConnectionStore().registerRefresh(async () => {
    await loadPlans()
    // 若用户当前正在查看某个计划，同步重载其任务、子计划、打卡记录
    if (currentPlan.value) {
      const [t, s, c] = await Promise.all([
        studyApi.taskList(currentPlan.value.id),
        studyApi.subPlanList(currentPlan.value.id),
        checkinApi.list(currentPlan.value.id, 3),
      ])
      tasks.value = t
      subPlans.value = s
      checkins.value = c
      // 若当前有选中的补卡日期，同步刷新该日任务列表
      if (selectedCheckinDate.value) {
        await loadSelectedDateTasks(selectedCheckinDate.value)
      }
    }
  })

  return {
    plans, currentPlan, tasks, loading, activeCategory,
    subPlans, currentSubPlan, subTasks, subPlansLoading,
    checkins, checkinLoading,
    selectedCheckinDate, selectedDateTasks, selectedDateTasksLoading,
    loadPlans, selectCategory, selectPlan,
    addPlan, updatePlan, deletePlan,
    loadSubPlans, selectSubPlan, addSubPlan, updateSubPlan, deleteSubPlan,
    addTask, toggleTask, toggleTaskById, deleteTask,
    addSubTask, toggleSubTask, deleteSubTask,
    loadCheckins, todayChecked, streakDays,
    selectCheckinDate, toggleSelectedDateTask, manualCheckin, manualRemoveCheckin,
  }
})
