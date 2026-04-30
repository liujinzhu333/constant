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
    this.registerNote()
    this.registerSchedule()
    this.registerReminder()
    this.registerAccount()
    this.registerFavorite()
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
    }) => {
      const id = uuid()
      this.db.prepare(`
        INSERT INTO study_plans (id, title, description, goal, category, start_date, end_date, color, parent_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, data.title, data.description ?? '', data.goal ?? '',
        data.category ?? 'study',
        data.start_date ?? null, data.end_date ?? null, data.color ?? '#0071e3',
        data.parent_id ?? null, now(), now())
      const plan = this.db.prepare('SELECT * FROM study_plans WHERE id = ?').get(id) as Record<string, unknown>
      return { ...plan, taskCount: 0, doneCount: 0, subPlanCount: 0 }
    })

    ipcMain.handle('study:planUpdate', (_e, id: string, data: Partial<{
      title: string; description: string; goal: string; category: string; status: string; start_date: number; end_date: number; color: string; progress: number
    }>) => {
      const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
      const vals = Object.values(data)
      if (!fields) return null
      this.db.prepare(`UPDATE study_plans SET ${fields}, updated_at = ? WHERE id = ?`).run(...vals, now(), id)
      return this.db.prepare('SELECT * FROM study_plans WHERE id = ?').get(id)
    })

    ipcMain.handle('study:planDelete', (_e, id: string) => {
      this.db.prepare('DELETE FROM study_plans WHERE id = ?').run(id)
      return true
    })

    ipcMain.handle('study:taskList', (_e, planId: string) => {
      return this.db.prepare('SELECT * FROM study_tasks WHERE plan_id = ? ORDER BY sort_order ASC, created_at ASC').all(planId)
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
      this.db.prepare(`UPDATE study_tasks SET status = 'done', updated_at = ? WHERE id = ?`).run(now(), id)
      this.syncPlanProgress(planId)
      return true
    })

    ipcMain.handle('study:taskUndone', (_e, id: string, planId: string) => {
      this.db.prepare(`UPDATE study_tasks SET status = 'todo', updated_at = ? WHERE id = ?`).run(now(), id)
      this.syncPlanProgress(planId)
      return true
    })

    ipcMain.handle('study:taskDelete', (_e, id: string, planId: string) => {
      this.db.prepare('DELETE FROM study_tasks WHERE id = ?').run(id)
      this.syncPlanProgress(planId)
      return true
    })
  }

  private syncPlanProgress(planId: string) {
    const total = (this.db.prepare('SELECT COUNT(*) as c FROM study_tasks WHERE plan_id = ?').get(planId) as { c: number }).c
    const done = (this.db.prepare("SELECT COUNT(*) as c FROM study_tasks WHERE plan_id = ? AND status = 'done'").get(planId) as { c: number }).c
    const progress = total > 0 ? Math.round((done / total) * 100) : 0
    this.db.prepare('UPDATE study_plans SET progress = ?, updated_at = ? WHERE id = ?').run(progress, now(), planId)
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
}
