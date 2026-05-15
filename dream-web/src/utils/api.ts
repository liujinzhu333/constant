/**
 * Dream Web — HTTP API 层
 *
 * 替代 window.dreamAPI（Electron IPC），所有数据请求通过 axios 走 HTTP Server。
 * 开发时由 vite proxy 转发到 localhost:45679；生产时直接请求同源。
 *
 * 缓存策略：
 *  - GET 请求成功后将结果写入 localStorage（key: dream_cache_<path>）
 *  - 离线时 GET 请求自动降级读取缓存，写操作抛出 ApiOfflineError
 */

import axios from 'axios'
import { enqueue, genTempId } from './offline-queue'

// ─── 错误类型 ─────────────────────────────────────────────────────

export class ApiOfflineError extends Error {
  constructor() { super('服务不可达（离线）') }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

// ─── 缓存工具 ─────────────────────────────────────────────────────

const CACHE_PREFIX = 'dream_cache_'

function cacheKey(path: string) {
  // 保留查询参数，确保不同参数的请求使用不同缓存 key
  // 例如 /api/study/plans?parent_id=null 与 /api/study/plans?parent_id=abc 互不干扰
  return CACHE_PREFIX + path.replace(/\//g, '_').replace(/[?&=]/g, '-')
}

export function writeCache(path: string, data: unknown) {
  try {
    localStorage.setItem(cacheKey(path), JSON.stringify(data))
  } catch { /* 存储满时静默忽略 */ }
}

export function readCache<T>(path: string): T | null {
  try {
    const raw = localStorage.getItem(cacheKey(path))
    return raw ? JSON.parse(raw) as T : null
  } catch { return null }
}

// ─── 离线状态（轻量标志，避免循环依赖 pinia store） ────────────────

let _offline = false
export function setApiOffline(v: boolean) { _offline = v }
export function isApiOffline() { return _offline }

// ─── axios 实例 ───────────────────────────────────────────────────

const API_BASE_KEY = 'dream_api_base'

const instance = axios.create({
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

/**
 * 设置 API baseURL（云端访问本地 PC 时使用）。
 * 传空字符串则恢复相对路径（开发 vite proxy 模式）。
 */
export function setApiBase(base: string) {
  instance.defaults.baseURL = base || undefined
}

/** 供 offline-queue 等工具使用，复用同一个配了 baseURL 的 axios 实例 */
export function getAxiosInstance() {
  return instance
}

// 初始化时从 localStorage 读取已保存的 base（页面刷新后自动恢复）
// 例外：localhost 访问时运行在 vite proxy 模式，不需要 baseURL（走相对路径即可）
;(function initApiBase() {
  const isLocalhost = typeof location !== 'undefined' && location.hostname === 'localhost'
  if (isLocalhost) return  // vite proxy 模式，忽略持久化的 baseURL
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(API_BASE_KEY) : null
  if (saved) instance.defaults.baseURL = saved
})()

/** 判断是否属于"服务不可达"类错误（网络断开 / vite proxy 502~504） */
function isOfflineError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { response?: { status?: number } }
  if (!e.response) return true   // 网络层错误（ECONNREFUSED 等）
  const s = e.response.status
  return s === 502 || s === 503 || s === 504  // proxy 无法连接后端
}

instance.interceptors.response.use(
  res => res.data,
  err => {
    if (isOfflineError(err)) throw new ApiOfflineError()
    throw new ApiError(err.response.status, err.response.data?.error ?? err.message)
  }
)

const http = {
  get<T>(path: string): Promise<T> {
    if (_offline) {
      const cached = readCache<T>(path)
      // 有缓存直接返回，没有缓存返回空数组（兜底），不抛错
      return Promise.resolve(cached ?? ([] as unknown as T))
    }
    return instance.get<T, T>(path).then(data => {
      writeCache(path, data)
      return data
    }).catch(err => {
      // 在线状态下请求失败（服务关闭/proxy 502-503）→ 自动切换离线，读缓存
      if (err instanceof ApiOfflineError) {
        _offline = true
        const cached = readCache<T>(path)
        return cached ?? ([] as unknown as T)
      }
      throw err
    })
  },
  post<T>(path: string, body: unknown): Promise<T> {
    return instance.post<T, T>(path, body)
  },
  patch<T>(path: string, body: unknown): Promise<T> {
    return instance.patch<T, T>(path, body)
  },
  delete<T>(path: string): Promise<T> {
    return instance.delete<T, T>(path)
  },
}

// ─── 离线缓存列表更新工具 ─────────────────────────────────────────
//
// 离线写操作完成后，同步更新对应 GET 路径的 localStorage 缓存，
// 这样刷新页面后 load() 走离线路径时能读到最新数据。

/** 从 PATCH/DELETE 路径中提取列表路径，如 /api/todos/123 → /api/todos */
function listPathOf(itemPath: string): string {
  return itemPath.replace(/\/[^/]+$/, '')
}

/** 离线 POST 后，将新条目插入缓存列表头部 */
function cacheInsert<T extends { id: string }>(listPath: string, item: T) {
  const list = readCache<T[]>(listPath) ?? []
  writeCache(listPath, [item, ...list])
}

/** 离线 PATCH 后，用合并结果替换缓存列表中对应条目 */
function cacheUpdate<T extends { id: string }>(listPath: string, updated: T) {
  const list = readCache<T[]>(listPath) ?? []
  writeCache(listPath, list.map(i => i.id === updated.id ? updated : i))
}

/** 离线 DELETE 后，从缓存列表中删除对应条目 */
function cacheRemove(listPath: string, id: string) {
  const list = readCache<{ id: string }[]>(listPath) ?? []
  writeCache(listPath, list.filter(i => i.id !== id))
}

/** 从 item 路径末尾提取 id，如 /api/todos/offline_xxx → offline_xxx */
function idFromPath(itemPath: string): string {
  return itemPath.split('/').pop() ?? ''
}

// ─── 离线感知写操作（供 store 使用） ──────────────────────────────
//
// offlinePost：离线时（或请求失败时）入队并返回含 tempId 的占位对象，在线时正常请求
// offlinePatch：离线时（或请求失败时）入队，返回合并后的对象
// offlineDelete：离线时（或请求失败时）入队，返回 { ok: true }
//
// 注意：若当前标记为在线但网络不通（ApiOfflineError），会自动切换离线并入队，
// 而不是向上层抛出异常。这样 store 层无需额外 try-catch。
// 离线时同步更新 localStorage 缓存，刷新页面后 load() 仍能读到最新数据。

function _doOfflinePost<T extends object & { id: string }>(
  path: string,
  body: Record<string, unknown>,
  makeLocal: (tempId: string) => T,
  switchOffline = false,
): T & { _offline: true } {
  if (switchOffline) _offline = true
  const tempId = genTempId()
  const local = makeLocal(tempId)
  enqueue({ method: 'POST', path, body: { ...body, _tempId: tempId }, tempId })
  cacheInsert(path, local)   // 写入 GET 缓存，刷新后可读到
  return { ...local, _offline: true as const }
}

export function offlinePost<T extends object & { id: string }>(
  path: string,
  body: Record<string, unknown>,
  /** 构造离线占位对象（含 tempId）的工厂函数 */
  makeLocal: (tempId: string) => T,
): Promise<T & { _offline?: boolean }> {
  if (_offline) {
    return Promise.resolve(_doOfflinePost(path, body, makeLocal))
  }
  return http.post<T>(path, body).catch(err => {
    if (err instanceof ApiOfflineError) {
      return _doOfflinePost(path, body, makeLocal, true)
    }
    throw err
  })
}

export function offlinePatch<T extends object & { id: string }>(
  path: string,
  body: Record<string, unknown>,
  /** 当前本地对象，用于合并成乐观结果 */
  current: T,
): Promise<T & { _offline?: boolean }> {
  const merged = { ...current, ...body } as T & { _offline?: boolean }
  if (_offline) {
    enqueue({ method: 'PATCH', path, body })
    cacheUpdate(listPathOf(path), merged)
    return Promise.resolve(merged)
  }
  return http.patch<T>(path, body).catch(err => {
    if (err instanceof ApiOfflineError) {
      _offline = true
      enqueue({ method: 'PATCH', path, body })
      cacheUpdate(listPathOf(path), merged)
      return merged
    }
    throw err
  })
}

export function offlineDelete(
  path: string,
): Promise<{ ok: boolean; _offline?: boolean }> {
  if (_offline) {
    enqueue({ method: 'DELETE', path })
    cacheRemove(listPathOf(path), idFromPath(path))
    return Promise.resolve({ ok: true, _offline: true })
  }
  return http.delete<{ ok: boolean }>(path).catch(err => {
    if (err instanceof ApiOfflineError) {
      _offline = true
      enqueue({ method: 'DELETE', path })
      cacheRemove(listPathOf(path), idFromPath(path))
      return { ok: true, _offline: true as const }
    }
    throw err
  })
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
  checkin_enabled: number        // 0=关闭 1=开启
  checkin_goal: string           // 打卡文字目标
  checkin_target_days: number    // 连续打卡目标天数
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
  last_done_date: string | null  // YYYY-MM-DD，用于按天重置完成状态
  created_at: number
  updated_at: number
}

export interface StudyCheckin {
  id: string
  plan_id: string
  date: string        // YYYY-MM-DD
  note: string
  created_at: number
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
    return http.get(`/api/study/plans?${qs.toString()}`).then((plans) =>
      (plans as StudyPlan[]).map(p => ({
        ...p,
        taskCount: p.task_count ?? 0,
        doneCount: p.done_count ?? 0,
        subPlanCount: p.sub_plan_count ?? 0,
      }))
    )
  },
  subPlanList(parentId: string): Promise<StudyPlan[]> {
    return http.get(`/api/study/plans?parent_id=${parentId}`).then((plans) =>
      (plans as StudyPlan[]).map(p => ({
        ...p,
        taskCount: p.task_count ?? 0,
        doneCount: p.done_count ?? 0,
        subPlanCount: p.sub_plan_count ?? 0,
      }))
    )
  },
  planAdd(data: {
    title: string; description?: string; goal?: string; category?: string
    start_date?: number; end_date?: number; color?: string; parent_id?: string
    checkin_enabled?: number; checkin_goal?: string; checkin_target_days?: number
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

// ─── Study Checkins ───────────────────────────────────────────────

export const checkinApi = {
  list(planId: string, months = 3): Promise<StudyCheckin[]> {
    return http.get(`/api/study/checkins?plan_id=${planId}&months=${months}`)
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

// ─── Members ──────────────────────────────────────────────────────

export type MemberRelation = 'family' | 'relative' | 'friend' | 'colleague' | 'other'
export type MemberGender   = 'male' | 'female' | 'unknown'

export interface Member {
  id: string
  name: string
  nickname: string
  gender: MemberGender
  birth_date: string
  birth_lunar: string
  relation: MemberRelation
  relation_title: string
  phone: string
  email: string
  note: string
  tags: string         // JSON 字符串数组
  avatar_color: string
  created_at: number
  updated_at: number
}

export interface MemberEvent {
  id: string
  member_id: string
  event_date: string
  title: string
  content: string
  created_at: number
}

export interface MemberRelationRow {
  rel_id: string
  label: string
  rel_created_at: number
  id: string
  name: string
  nickname: string
  gender: MemberGender
  relation: MemberRelation
  relation_title: string
  avatar_color: string
  tags: string
}

export const memberApi = {
  list(filter?: { relation?: string; keyword?: string; tag?: string }): Promise<Member[]> {
    const qs = new URLSearchParams()
    if (filter?.relation) qs.set('relation', filter.relation)
    if (filter?.keyword)  qs.set('keyword',  filter.keyword)
    if (filter?.tag)      qs.set('tag',       filter.tag)
    const q = qs.toString()
    return http.get(`/api/members${q ? '?' + q : ''}`)
  },
  add(data: Omit<Member, 'id' | 'created_at' | 'updated_at'>): Promise<Member> {
    return http.post('/api/members', data)
  },
  update(id: string, data: Partial<Member>): Promise<Member> {
    return http.patch(`/api/members/${id}`, data)
  },
  delete(id: string): Promise<{ ok: boolean }> {
    return http.delete(`/api/members/${id}`)
  },
  allTags(): Promise<string[]> {
    return http.get('/api/members/tags')
  },
}

export const memberEventApi = {
  list(memberId: string): Promise<MemberEvent[]> {
    return http.get(`/api/member-events?member_id=${memberId}`)
  },
  add(data: { member_id: string; event_date?: string; title: string; content?: string }): Promise<MemberEvent> {
    return http.post('/api/member-events', data)
  },
  delete(id: string): Promise<{ ok: boolean }> {
    return http.delete(`/api/member-events/${id}`)
  },
}

export const memberRelationApi = {
  list(memberId: string): Promise<MemberRelationRow[]> {
    return http.get(`/api/member-relations?member_id=${memberId}`)
  },
  add(data: { from_id: string; to_id: string; label?: string }): Promise<{ ok: boolean }> {
    return http.post('/api/member-relations', data)
  },
  delete(fromId: string, toId: string): Promise<{ ok: boolean }> {
    return http.delete(`/api/member-relations/${fromId}/${toId}`)
  },
}
