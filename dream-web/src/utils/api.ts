/**
 * Dream Web — HTTP API 层
 *
 * 替代 window.dreamAPI（Electron IPC），所有数据请求通过 axios 走 HTTP Server。
 * 开发时由 vite proxy 转发到 localhost:45678；生产时直接请求同源。
 */

import axios from 'axios'

// ─── 错误类型 ─────────────────────────────────────────────────────

export class ApiOfflineError extends Error {
  constructor() { super('服务不可达（离线）') }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

// ─── axios 实例 ───────────────────────────────────────────────────

const instance = axios.create({
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

instance.interceptors.response.use(
  res => res.data,
  err => {
    if (!err.response) throw new ApiOfflineError()
    throw new ApiError(err.response.status, err.response.data?.error ?? err.message)
  }
)

const http = {
  get:    <T>(path: string)                => instance.get<T, T>(path),
  post:   <T>(path: string, body: unknown) => instance.post<T, T>(path, body),
  patch:  <T>(path: string, body: unknown) => instance.patch<T, T>(path, body),
  delete: <T>(path: string)                => instance.delete<T, T>(path),
}

// ─── 类型（与 preload/index.ts 对齐） ────────────────────────────

export interface TodoItem {
  id: string
  title: string
  note: string
  priority: number
  status: 'todo' | 'done'
  due_at: number | null
  remind_at: number | null
  tags: string
  created_at: number
  updated_at: number
  done_at: number | null
}

export type PlanCategory = 'study' | 'work' | 'life' | 'fitness' | 'finance'

export interface StudyPlan {
  id: string
  title: string
  description: string
  goal: string
  category: PlanCategory
  status: string
  start_date: number | null
  end_date: number | null
  progress: number
  color: string
  parent_id: string | null
  created_at: number
  updated_at: number
  // 聚合字段（服务端计算）
  task_count?: number
  done_count?: number
  sub_plan_count?: number
  // 兼容旧 PC 端字段名
  taskCount?: number
  doneCount?: number
  subPlanCount?: number
}

export interface StudyTask {
  id: string
  plan_id: string
  title: string
  status: 'todo' | 'done'
  due_at: number | null
  sort_order: number
  created_at: number
  updated_at: number
}

export interface Note {
  id: string
  title: string
  content: string
  tags: string
  is_pinned: number
  created_at: number
  updated_at: number
}

export interface Schedule {
  id: string
  title: string
  note: string
  start_at: number
  end_at: number
  all_day: number
  color: string
  remind_at: number | null
  repeat_rule: string
  created_at: number
  updated_at: number
}

export interface Reminder {
  id: string
  source_type: string
  source_id: string | null
  title: string
  body: string
  remind_at: number
  status: 'pending' | 'sent' | 'snoozed' | 'dismissed'
  created_at: number
}

export type AccountCategory = 'dev' | 'social' | 'shopping' | 'finance' | 'game' | 'work' | 'media' | 'other'

export interface Account {
  id: string
  platform: string
  platform_url: string
  account_name: string
  phone: string
  email: string
  password_enc: string
  note: string
  category: AccountCategory
  created_at: number
  updated_at: number
}

export type FavoriteType = 'link' | 'quote'

export interface Favorite {
  id: string
  type: FavoriteType
  title: string
  url: string
  content: string
  author: string
  tags: string
  is_pinned: number
  created_at: number
  updated_at: number
  duplicate?: boolean
}

// ─── /ping ───────────────────────────────────────────────────────

export async function ping(): Promise<{ ok: boolean; ip: string; port: number; lan: string }> {
  return http.get('/ping')
}

// ─── Todos ───────────────────────────────────────────────────────

export const todoApi = {
  list(filter?: { status?: string; priority?: number }): Promise<TodoItem[]> {
    const qs = new URLSearchParams()
    if (filter?.status)   qs.set('status',   filter.status)
    if (filter?.priority) qs.set('priority', String(filter.priority))
    const q = qs.toString()
    return http.get(`/api/todos${q ? '?' + q : ''}`)
  },
  add(data: { title: string; note?: string; priority?: number; due_at?: number | null; tags?: string[] }): Promise<TodoItem> {
    return http.post('/api/todos', data)
  },
  update(id: string, data: Partial<TodoItem>): Promise<TodoItem> {
    return http.patch(`/api/todos/${id}`, data)
  },
  done(id: string): Promise<TodoItem> {
    return http.patch(`/api/todos/${id}`, { status: 'done', done_at: Math.floor(Date.now() / 1000) })
  },
  undone(id: string): Promise<TodoItem> {
    return http.patch(`/api/todos/${id}`, { status: 'todo', done_at: null })
  },
  delete(id: string): Promise<{ ok: boolean }> {
    return http.delete(`/api/todos/${id}`)
  },
}

// ─── Study ────────────────────────────────────────────────────────

export const studyApi = {
  planList(category?: string): Promise<StudyPlan[]> {
    const qs = new URLSearchParams()
    qs.set('parent_id', 'null')
    if (category) qs.set('category', category)
    return http.get(`/api/study/plans?${qs.toString()}`)
  },
  subPlanList(parentId: string): Promise<StudyPlan[]> {
    return http.get(`/api/study/plans?parent_id=${parentId}`)
  },
  planAdd(data: {
    title: string; description?: string; goal?: string; category?: string
    start_date?: number; end_date?: number; color?: string; parent_id?: string
  }): Promise<StudyPlan> {
    return http.post('/api/study/plans', data)
  },
  planUpdate(id: string, data: Partial<StudyPlan>): Promise<StudyPlan> {
    return http.patch(`/api/study/plans/${id}`, data)
  },
  planDelete(id: string): Promise<{ ok: boolean }> {
    return http.delete(`/api/study/plans/${id}`)
  },
  taskList(planId: string): Promise<StudyTask[]> {
    return http.get(`/api/study/tasks?plan_id=${planId}`)
  },
  taskAdd(planId: string, data: { title: string; due_at?: number }): Promise<StudyTask> {
    return http.post('/api/study/tasks', { plan_id: planId, ...data })
  },
  taskDone(id: string): Promise<StudyTask> {
    return http.patch(`/api/study/tasks/${id}`, { status: 'done' })
  },
  taskUndone(id: string): Promise<StudyTask> {
    return http.patch(`/api/study/tasks/${id}`, { status: 'todo' })
  },
  taskDelete(id: string): Promise<{ ok: boolean }> {
    return http.delete(`/api/study/tasks/${id}`)
  },
}

// ─── Notes ────────────────────────────────────────────────────────

export const noteApi = {
  list(keyword?: string): Promise<Note[]> {
    return http.get(`/api/notes${keyword ? '?keyword=' + encodeURIComponent(keyword) : ''}`)
  },
  get(id: string): Promise<Note> {
    return http.get(`/api/notes/${id}`)
  },
  add(data: { title?: string; content?: string; tags?: string[] }): Promise<Note> {
    return http.post('/api/notes', data)
  },
  update(id: string, data: Partial<Note> | Record<string, unknown>): Promise<Note> {
    return http.patch(`/api/notes/${id}`, data)
  },
  delete(id: string): Promise<{ ok: boolean }> {
    return http.delete(`/api/notes/${id}`)
  },
}

// ─── Schedules ───────────────────────────────────────────────────

export const scheduleApi = {
  list(startTs: number, endTs: number): Promise<Schedule[]> {
    return http.get(`/api/schedules?start=${startTs * 1000}&end=${endTs * 1000}`)
  },
  add(data: {
    title: string; note?: string; start_at: number; end_at: number
    all_day?: number; color?: string; remind_at?: number
  }): Promise<Schedule> {
    return http.post('/api/schedules', {
      ...data,
      start_at: data.start_at * 1000,
      end_at: data.end_at * 1000,
    })
  },
  update(id: string, data: Partial<Schedule> | Record<string, unknown>): Promise<Schedule> {
    return http.patch(`/api/schedules/${id}`, data)
  },
  delete(id: string): Promise<{ ok: boolean }> {
    return http.delete(`/api/schedules/${id}`)
  },
}

// ─── Reminders ───────────────────────────────────────────────────

export const reminderApi = {
  list(status?: string): Promise<Reminder[]> {
    return http.get(`/api/reminders${status ? '?status=' + status : ''}`)
  },
  add(data: { source_type: string; title: string; body?: string; remind_at: number; source_id?: string }): Promise<Reminder> {
    return http.post('/api/reminders', data)
  },
  update(id: string, data: Partial<Reminder>): Promise<Reminder> {
    return http.patch(`/api/reminders/${id}`, data)
  },
  delete(id: string): Promise<{ ok: boolean }> {
    return http.delete(`/api/reminders/${id}`)
  },
}

// ─── Accounts ────────────────────────────────────────────────────

export const accountApi = {
  list(): Promise<Account[]> {
    return http.get('/api/accounts')
  },
  add(data: Omit<Account, 'id' | 'created_at' | 'updated_at'>): Promise<Account> {
    return http.post('/api/accounts', data)
  },
  update(id: string, data: Partial<Account> | Record<string, string>): Promise<Account> {
    return http.patch(`/api/accounts/${id}`, data)
  },
  delete(id: string): Promise<{ ok: boolean }> {
    return http.delete(`/api/accounts/${id}`)
  },
}

// ─── Favorites ───────────────────────────────────────────────────

export const favoriteApi = {
  list(filter?: { type?: string; keyword?: string }): Promise<Favorite[]> {
    const qs = new URLSearchParams()
    if (filter?.type)    qs.set('type',    filter.type)
    if (filter?.keyword) qs.set('keyword', filter.keyword)
    const q = qs.toString()
    return http.get(`/api/favorites${q ? '?' + q : ''}`)
  },
  add(data: Omit<Favorite, 'id' | 'created_at' | 'updated_at' | 'duplicate'>): Promise<Favorite> {
    return http.post('/api/favorites', data)
  },
  update(id: string, data: Partial<Favorite> | Record<string, unknown>): Promise<Favorite> {
    return http.patch(`/api/favorites/${id}`, data)
  },
  pin(id: string, pinned: boolean): Promise<Favorite> {
    return http.patch(`/api/favorites/${id}`, { is_pinned: pinned ? 1 : 0 })
  },
  delete(id: string): Promise<{ ok: boolean }> {
    return http.delete(`/api/favorites/${id}`)
  },
}
