/**
 * 业务包：主进程业务 IPC 处理器
 * 提供所有业务模块的数据库 CRUD 操作
 */
import { ipcMain } from 'electron'
import { StorageManager } from '../storage'
import { Logger } from '../logger'
import { randomUUID } from 'crypto'
import CryptoJS from 'crypto-js'

function now() { return Math.floor(Date.now() / 1000) }
function uuid() { return randomUUID() }

export class BusinessIpc {
  private static instance: BusinessIpc
  private db!: ReturnType<StorageManager['getDb']>
  private logger!: Logger

  static getInstance() {
    if (!BusinessIpc.instance) BusinessIpc.instance = new BusinessIpc()
    return BusinessIpc.instance
  }

  register() {
    this.db = StorageManager.getInstance().getDb()
    this.logger = Logger.getInstance()
    this.registerTodo()
    this.registerStudy()
    this.registerCheckin()
    this.registerNote()
    this.registerSchedule()
    this.registerReminder()
    this.registerAccount()
    this.registerFavorite()
    this.registerMember()
    this.logger.info('Business', '业务 IPC 处理器注册完成')
  }

  // ===================== 待办任务 =====================
  private registerTodo() {
    // 查询（支持按状态/优先级筛选）
    ipcMain.handle('todo:list', (_e, filter: { status?: string; priority?: number } = {}) => {
      let sql = 'SELECT * FROM todos WHERE 1=1'
      const params: unknown[] = []
      if (filter.status) { sql += ' AND status = ?'; params.push(filter.status) }
      if (filter.priority) { sql += ' AND priority = ?'; params.push(filter.priority) }
      sql += ' ORDER BY priority ASC, created_at DESC'
      return this.db.prepare(sql).all(...params)
    })

    ipcMain.handle('todo:add', (_e, data: {
      title: string; note?: string; priority?: number; due_at?: number; remind_at?: number; tags?: string[]
    }) => {
      const id = uuid()
      this.db.prepare(`
        INSERT INTO todos (id, title, note, priority, due_at, remind_at, tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, data.title, data.note ?? '', data.priority ?? 2,
        data.due_at ?? null, data.remind_at ?? null,
        JSON.stringify(data.tags ?? []), now(), now())
      return this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id)
    })

    ipcMain.handle('todo:update', (_e, id: string, data: Partial<{
      title: string; note: string; priority: number; due_at: number; remind_at: number; tags: string[]; status: string
    }>) => {
      const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
      const vals = Object.values(data).map(v => Array.isArray(v) ? JSON.stringify(v) : v)
      if (!fields) return null
      this.db.prepare(`UPDATE todos SET ${fields}, updated_at = ? WHERE id = ?`).run(...vals, now(), id)
      return this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id)
    })

    ipcMain.handle('todo:done', (_e, id: string) => {
      this.db.prepare(`UPDATE todos SET status = 'done', done_at = ?, updated_at = ? WHERE id = ?`).run(now(), now(), id)
      return true
    })

    ipcMain.handle('todo:undone', (_e, id: string) => {
      this.db.prepare(`UPDATE todos SET status = 'todo', done_at = NULL, updated_at = ? WHERE id = ?`).run(now(), id)
      return true
    })

    ipcMain.handle('todo:delete', (_e, id: string) => {
      this.db.prepare('DELETE FROM todos WHERE id = ?').run(id)
      return true
    })
  }

  // ===================== 计划 =====================
  private registerStudy() {
    // 顶层计划列表（parent_id IS NULL），支持按 category 筛选
    ipcMain.handle('study:planList', (_e, category?: string) => {
      let sql = 'SELECT * FROM study_plans WHERE parent_id IS NULL'
      const params: unknown[] = []
      if (category && category !== 'all') { sql += ' AND category = ?'; params.push(category) }
      sql += ' ORDER BY created_at DESC'
      const plans = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>
      return plans.map(p => ({
        ...p,
        taskCount: (this.db.prepare('SELECT COUNT(*) as c FROM study_tasks WHERE plan_id = ?').get(p.id) as { c: number }).c,
        doneCount: (this.db.prepare("SELECT COUNT(*) as c FROM study_tasks WHERE plan_id = ? AND status = 'done'").get(p.id) as { c: number }).c,
        subPlanCount: (this.db.prepare('SELECT COUNT(*) as c FROM study_plans WHERE parent_id = ?').get(p.id) as { c: number }).c,
      }))
    })

    // 子计划列表
    ipcMain.handle('study:subPlanList', (_e, parentId: string) => {
      const plans = this.db.prepare(
        'SELECT * FROM study_plans WHERE parent_id = ? ORDER BY created_at ASC'
      ).all(parentId) as Array<Record<string, unknown>>
      return plans.map(p => ({
        ...p,
        taskCount: (this.db.prepare('SELECT COUNT(*) as c FROM study_tasks WHERE plan_id = ?').get(p.id) as { c: number }).c,
        doneCount: (this.db.prepare("SELECT COUNT(*) as c FROM study_tasks WHERE plan_id = ? AND status = 'done'").get(p.id) as { c: number }).c,
        subPlanCount: 0,
      }))
    })

    ipcMain.handle('study:planAdd', (_e, data: {
      title: string; description?: string; goal?: string; category?: string
      start_date?: number; end_date?: number; color?: string; parent_id?: string
      checkin_enabled?: number; checkin_goal?: string; checkin_target_days?: number
    }) => {
      const id = uuid()
      this.db.prepare(`
        INSERT INTO study_plans (id, title, description, goal, category, start_date, end_date, color, parent_id, checkin_enabled, checkin_goal, checkin_target_days, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, data.title, data.description ?? '', data.goal ?? '',
        data.category ?? 'study',
        data.start_date ?? null, data.end_date ?? null, data.color ?? '#0071e3',
        data.parent_id ?? null,
        data.checkin_enabled ?? 0, data.checkin_goal ?? '', data.checkin_target_days ?? 0,
        now(), now())
      const plan = this.db.prepare('SELECT * FROM study_plans WHERE id = ?').get(id) as Record<string, unknown>
      return { ...plan, taskCount: 0, doneCount: 0, subPlanCount: 0 }
    })

    ipcMain.handle('study:planUpdate', (_e, id: string, data: Partial<{
      title: string; description: string; goal: string; category: string; status: string
      start_date: number; end_date: number; color: string; progress: number
      checkin_enabled: number; checkin_goal: string; checkin_target_days: number
    }>) => {
      const ALLOWED = ['title','description','goal','category','status','start_date','end_date','color','progress','checkin_enabled','checkin_goal','checkin_target_days']
      const safe = Object.fromEntries(Object.entries(data).filter(([k]) => ALLOWED.includes(k)))
      const fields = Object.keys(safe).map(k => `${k} = ?`).join(', ')
      const vals = Object.values(safe)
      if (!fields) return null
      this.db.prepare(`UPDATE study_plans SET ${fields}, updated_at = ? WHERE id = ?`).run(...vals, now(), id)
      return this.db.prepare('SELECT * FROM study_plans WHERE id = ?').get(id)
    })

    ipcMain.handle('study:planDelete', (_e, id: string) => {
      this.db.prepare('DELETE FROM study_plans WHERE id = ?').run(id)
      return true
    })

    ipcMain.handle('study:taskList', (_e, planId: string) => {
      const today = new Date().toISOString().slice(0, 10)
      const rows = this.db.prepare('SELECT * FROM study_tasks WHERE plan_id = ? ORDER BY sort_order ASC, created_at ASC').all(planId) as Array<Record<string, unknown>>
      // 若任务上次完成日期不是今天，视为今日未完成（按天重置，不写库）
      return rows.map(t => t.last_done_date === today ? t : { ...t, status: 'todo' })
    })

    ipcMain.handle('study:taskAdd', (_e, planId: string, data: { title: string; due_at?: number }) => {
      const id = uuid()
      const maxOrder = (this.db.prepare('SELECT MAX(sort_order) as m FROM study_tasks WHERE plan_id = ?').get(planId) as { m: number | null }).m ?? 0
      this.db.prepare(`
        INSERT INTO study_tasks (id, plan_id, title, due_at, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, planId, data.title, data.due_at ?? null, maxOrder + 1, now(), now())
      this.syncPlanProgress(planId)
      return this.db.prepare('SELECT * FROM study_tasks WHERE id = ?').get(id)
    })

    ipcMain.handle('study:taskDone', (_e, id: string, planId: string) => {
      const today = new Date().toISOString().slice(0, 10)
      this.db.prepare(`UPDATE study_tasks SET status = 'done', last_done_date = ?, updated_at = ? WHERE id = ?`).run(today, now(), id)
      this.syncPlanProgress(planId)
      this.tryAutoCheckin(planId)
      return true
    })

    ipcMain.handle('study:taskUndone', (_e, id: string, planId: string) => {
      this.db.prepare(`UPDATE study_tasks SET status = 'todo', last_done_date = NULL, updated_at = ? WHERE id = ?`).run(now(), id)
      this.syncPlanProgress(planId)
      // 当日任务不再全部完成，移除今日自动打卡
      this.tryRemoveAutoCheckin(planId)
      return true
    })

    ipcMain.handle('study:taskDelete', (_e, id: string, planId: string) => {
      this.db.prepare('DELETE FROM study_tasks WHERE id = ?').run(id)
      this.syncPlanProgress(planId)
      return true
    })
  }

  private syncPlanProgress(planId: string) {
    const today = new Date().toISOString().slice(0, 10)
    const total = (this.db.prepare('SELECT COUNT(*) as c FROM study_tasks WHERE plan_id = ?').get(planId) as { c: number }).c
    // 只统计今天完成的任务（按天重置语义）
    const done = (this.db.prepare("SELECT COUNT(*) as c FROM study_tasks WHERE plan_id = ? AND status = 'done' AND last_done_date = ?").get(planId, today) as { c: number }).c
    const progress = total > 0 ? Math.round((done / total) * 100) : 0
    this.db.prepare('UPDATE study_plans SET progress = ?, updated_at = ? WHERE id = ?').run(progress, now(), planId)
  }

  /** 若计划开启打卡且当日任务全部完成，自动写入打卡记录 */
  private tryAutoCheckin(planId: string) {
    const plan = this.db.prepare('SELECT checkin_enabled FROM study_plans WHERE id = ?').get(planId) as { checkin_enabled: number } | undefined
    if (!plan || !plan.checkin_enabled) return

    const total = (this.db.prepare('SELECT COUNT(*) as c FROM study_tasks WHERE plan_id = ?').get(planId) as { c: number }).c
    if (total === 0) return // 没有任务时不自动打卡

    const today = new Date().toISOString().slice(0, 10)
    // 未完成 = status='todo' 或 last_done_date 不是今天（按天重置语义）
    const notDoneToday = (this.db.prepare(
      "SELECT COUNT(*) as c FROM study_tasks WHERE plan_id = ? AND (status = 'todo' OR last_done_date IS NULL OR last_done_date != ?)"
    ).get(planId, today) as { c: number }).c
    if (notDoneToday > 0) return // 还有今日未完成任务

    const exists = this.db.prepare('SELECT id FROM study_checkins WHERE plan_id = ? AND date = ?').get(planId, today)
    if (exists) return // 今日已打卡

    const id = uuid()
    try {
      this.db.prepare('INSERT INTO study_checkins (id, plan_id, date, note, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(id, planId, today, '', now())
    } catch { /* UNIQUE 冲突忽略 */ }
  }

  /** 若计划开启打卡但当日任务不再全部完成，移除今日自动打卡 */
  private tryRemoveAutoCheckin(planId: string) {
    const plan = this.db.prepare('SELECT checkin_enabled FROM study_plans WHERE id = ?').get(planId) as { checkin_enabled: number } | undefined
    if (!plan || !plan.checkin_enabled) return
    const today = new Date().toISOString().slice(0, 10)
    this.db.prepare('DELETE FROM study_checkins WHERE plan_id = ? AND date = ?').run(planId, today)
  }

  // ===================== 打卡 =====================
  private registerCheckin() {
    // 查询近 N 个月的打卡记录
    ipcMain.handle('study:checkinList', (_e, planId: string, months = 3) => {
      const since = new Date()
      since.setMonth(since.getMonth() - Math.min(months, 12))
      const sinceStr = since.toISOString().slice(0, 10)
      return this.db.prepare(
        'SELECT * FROM study_checkins WHERE plan_id = ? AND date >= ? ORDER BY date ASC'
      ).all(planId, sinceStr)
    })
  }

  // ===================== 笔记 =====================
  private registerNote() {
    ipcMain.handle('note:list', (_e, keyword = '') => {
      if (keyword) {
        return this.db.prepare(`
          SELECT * FROM notes WHERE title LIKE ? OR content LIKE ?
          ORDER BY is_pinned DESC, updated_at DESC
        `).all(`%${keyword}%`, `%${keyword}%`)
      }
      return this.db.prepare('SELECT * FROM notes ORDER BY is_pinned DESC, updated_at DESC').all()
    })

    ipcMain.handle('note:get', (_e, id: string) => {
      return this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id)
    })

    ipcMain.handle('note:add', (_e, data: { title?: string; content?: string; tags?: string[] }) => {
      const id = uuid()
      this.db.prepare(`
        INSERT INTO notes (id, title, content, tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, data.title ?? '无标题', data.content ?? '', JSON.stringify(data.tags ?? []), now(), now())
      return this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id)
    })

    ipcMain.handle('note:update', (_e, id: string, data: Partial<{ title: string; content: string; tags: string[]; is_pinned: number }>) => {
      const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
      const vals = Object.values(data).map(v => Array.isArray(v) ? JSON.stringify(v) : v)
      if (!fields) return null
      this.db.prepare(`UPDATE notes SET ${fields}, updated_at = ? WHERE id = ?`).run(...vals, now(), id)
      return this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id)
    })

    ipcMain.handle('note:delete', (_e, id: string) => {
      this.db.prepare('DELETE FROM notes WHERE id = ?').run(id)
      return true
    })
  }

  // ===================== 日程 =====================
  private registerSchedule() {
    ipcMain.handle('schedule:list', (_e, startTs: number, endTs: number) => {
      return this.db.prepare(`
        SELECT * FROM schedules
        WHERE start_at <= ? AND end_at >= ?
        ORDER BY start_at ASC
      `).all(endTs, startTs)
    })

    ipcMain.handle('schedule:add', (_e, data: {
      title: string; note?: string; start_at: number; end_at: number; all_day?: number; color?: string; remind_at?: number
    }) => {
      const id = uuid()
      this.db.prepare(`
        INSERT INTO schedules (id, title, note, start_at, end_at, all_day, color, remind_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, data.title, data.note ?? '', data.start_at, data.end_at,
        data.all_day ?? 0, data.color ?? '#0071e3', data.remind_at ?? null, now(), now())
      return this.db.prepare('SELECT * FROM schedules WHERE id = ?').get(id)
    })

    ipcMain.handle('schedule:update', (_e, id: string, data: Partial<{
      title: string; note: string; start_at: number; end_at: number; all_day: number; color: string; remind_at: number
    }>) => {
      const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
      const vals = Object.values(data)
      if (!fields) return null
      this.db.prepare(`UPDATE schedules SET ${fields}, updated_at = ? WHERE id = ?`).run(...vals, now(), id)
      return this.db.prepare('SELECT * FROM schedules WHERE id = ?').get(id)
    })

    ipcMain.handle('schedule:delete', (_e, id: string) => {
      this.db.prepare('DELETE FROM schedules WHERE id = ?').run(id)
      return true
    })
  }

  // ===================== 提醒 =====================
  private registerReminder() {
    ipcMain.handle('reminder:list', (_e, status = 'pending') => {
      return this.db.prepare(`
        SELECT * FROM reminders WHERE status = ? ORDER BY remind_at ASC
      `).all(status)
    })

    ipcMain.handle('reminder:add', (_e, data: {
      source_type: string; source_id?: string; title: string; body?: string; remind_at: number
    }) => {
      const id = uuid()
      this.db.prepare(`
        INSERT INTO reminders (id, source_type, source_id, title, body, remind_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, data.source_type, data.source_id ?? null, data.title, data.body ?? '', data.remind_at, now())
      return this.db.prepare('SELECT * FROM reminders WHERE id = ?').get(id)
    })

    ipcMain.handle('reminder:dismiss', (_e, id: string) => {
      this.db.prepare(`UPDATE reminders SET status = 'dismissed' WHERE id = ?`).run(id)
      return true
    })

    ipcMain.handle('reminder:snooze', (_e, id: string, newRemindAt: number) => {
      this.db.prepare(`UPDATE reminders SET status = 'snoozed', remind_at = ? WHERE id = ?`).run(newRemindAt, id)
      return true
    })

    ipcMain.handle('reminder:delete', (_e, id: string) => {
      this.db.prepare('DELETE FROM reminders WHERE id = ?').run(id)
      return true
    })
  }

  // ===================== 账号管理 =====================
  private registerAccount() {
    // 列表（不返回密码密文，前端按需解密）
    ipcMain.handle('account:list', () => {
      return this.db.prepare('SELECT * FROM accounts ORDER BY created_at DESC').all()
    })

    // 新增账号（密码由前端用用户密钥加密后传入密文）
    ipcMain.handle('account:add', (_e, data: {
      platform: string
      platform_url?: string
      account_name?: string
      phone?: string
      email?: string
      password_enc?: string  // 已由前端加密的密文
      note?: string
      category?: string
    }) => {
      const id = uuid()
      this.db.prepare(`
        INSERT INTO accounts (id, platform, platform_url, account_name, phone, email, password_enc, note, category, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.platform,
        data.platform_url ?? '',
        data.account_name ?? '',
        data.phone ?? '',
        data.email ?? '',
        data.password_enc ?? '',
        data.note ?? '',
        data.category ?? 'other',
        now(), now()
      )
      return this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id)
    })

    // 更新账号
    ipcMain.handle('account:update', (_e, id: string, data: Partial<{
      platform: string
      platform_url: string
      account_name: string
      phone: string
      email: string
      password_enc: string
      note: string
      category: string
    }>) => {
      const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
      const vals = Object.values(data)
      if (!fields) return null
      this.db.prepare(`UPDATE accounts SET ${fields}, updated_at = ? WHERE id = ?`).run(...vals, now(), id)
      return this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id)
    })

    // 删除账号
    ipcMain.handle('account:delete', (_e, id: string) => {
      this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
      return true
    })
  }

  // ===================== 收藏 =====================
  private registerFavorite() {
    // 列表（支持按 type 筛选 + 关键词搜索）
    ipcMain.handle('favorite:list', (_e, filter: { type?: string; keyword?: string } = {}) => {
      let sql = 'SELECT * FROM favorites WHERE 1=1'
      const params: unknown[] = []
      if (filter.type && filter.type !== 'all') {
        sql += ' AND type = ?'; params.push(filter.type)
      }
      if (filter.keyword) {
        sql += ' AND (title LIKE ? OR content LIKE ? OR author LIKE ?)'
        const kw = `%${filter.keyword}%`
        params.push(kw, kw, kw)
      }
      sql += ' ORDER BY is_pinned DESC, created_at DESC'
      return this.db.prepare(sql).all(...params)
    })

    // 新增
    ipcMain.handle('favorite:add', (_e, data: {
      type: string
      title?: string
      url?: string
      content?: string
      author?: string
      tags?: string[]
    }) => {
      const id = uuid()
      this.db.prepare(`
        INSERT INTO favorites (id, type, title, url, content, author, tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, data.type,
        data.title ?? '', data.url ?? '',
        data.content ?? '', data.author ?? '',
        JSON.stringify(data.tags ?? []),
        now(), now()
      )
      return this.db.prepare('SELECT * FROM favorites WHERE id = ?').get(id)
    })

    // 更新
    ipcMain.handle('favorite:update', (_e, id: string, data: Partial<{
      title: string; url: string; content: string; author: string
      tags: string[]; is_pinned: number
    }>) => {
      const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
      const vals = Object.values(data).map(v => Array.isArray(v) ? JSON.stringify(v) : v)
      if (!fields) return null
      this.db.prepare(`UPDATE favorites SET ${fields}, updated_at = ? WHERE id = ?`).run(...vals, now(), id)
      return this.db.prepare('SELECT * FROM favorites WHERE id = ?').get(id)
    })

    // 置顶切换
    ipcMain.handle('favorite:pin', (_e, id: string, pinned: boolean) => {
      this.db.prepare('UPDATE favorites SET is_pinned = ?, updated_at = ? WHERE id = ?').run(pinned ? 1 : 0, now(), id)
      return true
    })

    // 删除
    ipcMain.handle('favorite:delete', (_e, id: string) => {
      this.db.prepare('DELETE FROM favorites WHERE id = ?').run(id)
      return true
    })
  }

  // ===================== 人员管理 =====================
  private registerMember() {
    // ── members ──

    // 查询（支持按 relation/keyword/tag 筛选）
    ipcMain.handle('member:list', (_e, filter: { relation?: string; keyword?: string; tag?: string } = {}) => {
      let sql = 'SELECT * FROM members WHERE 1=1'
      const params: unknown[] = []
      if (filter.relation) { sql += ' AND relation = ?'; params.push(filter.relation) }
      if (filter.keyword) { sql += ' AND (name LIKE ? OR nickname LIKE ? OR relation_title LIKE ?)'; params.push(`%${filter.keyword}%`, `%${filter.keyword}%`, `%${filter.keyword}%`) }
      sql += ' ORDER BY created_at DESC'
      const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>
      if (filter.tag) {
        return rows.filter(r => {
          const tags: string[] = JSON.parse((r.tags as string) || '[]')
          return tags.includes(filter.tag!)
        })
      }
      return rows
    })

    // 新增
    ipcMain.handle('member:add', (_e, data: {
      name: string; nickname?: string; gender?: string; birth_date?: string; birth_lunar?: string
      relation?: string; relation_title?: string; phone?: string; email?: string; note?: string
      tags?: string[]; avatar_color?: string
    }) => {
      const id = uuid()
      const t = now()
      this.db.prepare(`
        INSERT INTO members (id,name,nickname,gender,birth_date,birth_lunar,relation,relation_title,phone,email,note,tags,avatar_color,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        id, data.name, data.nickname ?? '', data.gender ?? 'unknown',
        data.birth_date ?? '', data.birth_lunar ?? '',
        data.relation ?? 'other', data.relation_title ?? '',
        data.phone ?? '', data.email ?? '', data.note ?? '',
        JSON.stringify(data.tags ?? []), data.avatar_color ?? '#409EFF', t, t
      )
      return this.db.prepare('SELECT * FROM members WHERE id = ?').get(id)
    })

    // 更新
    ipcMain.handle('member:update', (_e, id: string, data: Partial<{
      name: string; nickname: string; gender: string; birth_date: string; birth_lunar: string
      relation: string; relation_title: string; phone: string; email: string; note: string
      tags: string[]; avatar_color: string
    }>) => {
      const allowed = ['name','nickname','gender','birth_date','birth_lunar','relation','relation_title','phone','email','note','tags','avatar_color']
      const safe: Record<string, unknown> = {}
      for (const k of allowed) {
        if (k in data) {
          const v = (data as Record<string, unknown>)[k]
          safe[k] = k === 'tags' && Array.isArray(v) ? JSON.stringify(v) : v
        }
      }
      if (Object.keys(safe).length) {
        const sets = Object.keys(safe).map(k => `${k} = ?`).join(', ')
        const vals = Object.values(safe).map(v => v === undefined ? null : v)
        this.db.prepare(`UPDATE members SET ${sets}, updated_at = ? WHERE id = ?`).run(...vals, now(), id)
      }
      return this.db.prepare('SELECT * FROM members WHERE id = ?').get(id)
    })

    // 删除
    ipcMain.handle('member:delete', (_e, id: string) => {
      this.db.prepare('DELETE FROM members WHERE id = ?').run(id)
      return true
    })

    // 获取所有标签（聚合去重）
    ipcMain.handle('member:allTags', () => {
      const rows = this.db.prepare('SELECT tags FROM members').all() as Array<{ tags: string }>
      const set = new Set<string>()
      for (const r of rows) {
        const tags: string[] = JSON.parse(r.tags || '[]')
        for (const t of tags) set.add(t)
      }
      return [...set].sort()
    })

    // ── member_events ──

    // 查询某人的经历
    ipcMain.handle('member:eventList', (_e, memberId: string) => {
      return this.db.prepare('SELECT * FROM member_events WHERE member_id = ? ORDER BY event_date DESC, created_at DESC').all(memberId)
    })

    // 新增经历
    ipcMain.handle('member:eventAdd', (_e, data: { member_id: string; event_date?: string; title: string; content?: string }) => {
      const id = uuid()
      this.db.prepare(`
        INSERT INTO member_events (id, member_id, event_date, title, content, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, data.member_id, data.event_date ?? '', data.title, data.content ?? '', now())
      return this.db.prepare('SELECT * FROM member_events WHERE id = ?').get(id)
    })

    // 删除经历
    ipcMain.handle('member:eventDelete', (_e, id: string) => {
      this.db.prepare('DELETE FROM member_events WHERE id = ?').run(id)
      return true
    })

    // ── member_relations ──

    // 查询某人的关联（返回另一端的 member 信息）
    ipcMain.handle('member:relationList', (_e, memberId: string) => {
      return this.db.prepare(`
        SELECT mr.id as rel_id, mr.label, mr.created_at as rel_created_at, m.*
        FROM member_relations mr
        JOIN members m ON m.id = mr.to_id
        WHERE mr.from_id = ?
        ORDER BY mr.created_at DESC
      `).all(memberId)
    })

    // 新增关联（服务端事务，双向插入）
    ipcMain.handle('member:relationAdd', (_e, data: { from_id: string; to_id: string; label?: string }) => {
      const idAB = uuid()
      const idBA = uuid()
      const t = now()
      const insert = this.db.prepare(`
        INSERT OR IGNORE INTO member_relations (id, from_id, to_id, label, created_at) VALUES (?, ?, ?, ?, ?)
      `)
      this.db.transaction(() => {
        insert.run(idAB, data.from_id, data.to_id, data.label ?? '', t)
        insert.run(idBA, data.to_id, data.from_id, data.label ?? '', t)
      })()
      return { ok: true }
    })

    // 删除关联（双向删除）
    ipcMain.handle('member:relationDelete', (_e, fromId: string, toId: string) => {
      this.db.transaction(() => {
        this.db.prepare('DELETE FROM member_relations WHERE from_id = ? AND to_id = ?').run(fromId, toId)
        this.db.prepare('DELETE FROM member_relations WHERE from_id = ? AND to_id = ?').run(toId, fromId)
      })()
      return true
    })
  }
}
