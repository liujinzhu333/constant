/**
 * Dream Mobile — 本地数据库统一封装（纯 H5 版）
 *
 * 数据层完全通过 JSBridge 调用 Android 原生 SQLite。
 * 在浏览器调试环境（非基座），Bridge SDK 自动降级为 localStorage mock。
 *
 * 表结构与 PC 端 dream/electron/modules/storage/index.ts 保持一致。
 */

import { bridgeSQLite } from './bridge'

// ==================== 类型定义 ====================

export interface TodoItem {
  id: number
  title: string
  note: string
  priority: 'high' | 'medium' | 'low'
  status: 'pending' | 'done'
  due_at: number | null
  remind_at: number | null
  tags: string               // JSON 数组字符串
  created_at: number
  updated_at: number
}

export interface PlanItem {
  id: number
  title: string
  description: string
  category: 'study' | 'work' | 'life' | 'fitness' | 'finance'
  status: 'active' | 'done' | 'paused'
  parent_id: number | null
  task_count: number
  done_count: number
  sub_plan_count: number
  created_at: number
  updated_at: number
}

export interface PlanTask {
  id: number
  plan_id: number
  title: string
  status: 'pending' | 'done'
  created_at: number
  updated_at: number
}

export interface NoteItem {
  id: number
  title: string
  content: string
  is_pinned: number   // 0 | 1
  created_at: number
  updated_at: number
}

export interface ScheduleItem {
  id: number
  title: string
  description: string
  date: string        // YYYY-MM-DD
  start_time: string  // HH:mm 或 ''
  end_time: string
  is_all_day: number  // 0 | 1
  color: string
  created_at: number
  updated_at: number
}

export interface ReminderItem {
  id: number
  title: string
  description: string
  remind_at: number
  status: 'pending' | 'done' | 'snoozed'
  source_type: string
  source_id: number | null
  created_at: number
  updated_at: number
}

export interface AccountItem {
  id: number
  platform: string
  type: 'dev' | 'social' | 'shopping' | 'finance' | 'game' | 'work' | 'media' | 'other'
  username: string
  email: string
  phone: string
  password_encrypted: string
  url: string
  note: string
  created_at: number
  updated_at: number
}

export interface FavoriteItem {
  id: number
  type: 'link' | 'quote'
  title: string
  url: string
  content: string
  author: string
  source: string
  tags: string
  is_pinned: number
  created_at: number
  updated_at: number
}

// ==================== DDL ====================

const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    note TEXT DEFAULT '',
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'pending',
    due_at INTEGER,
    remind_at INTEGER,
    tags TEXT DEFAULT '[]',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS study_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    category TEXT DEFAULT 'study',
    status TEXT DEFAULT 'active',
    parent_id INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS study_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    is_pinned INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    date TEXT NOT NULL,
    start_time TEXT DEFAULT '',
    end_time TEXT DEFAULT '',
    is_all_day INTEGER DEFAULT 0,
    color TEXT DEFAULT '#0071e3',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    remind_at INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    source_type TEXT DEFAULT '',
    source_id INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    type TEXT DEFAULT 'other',
    username TEXT DEFAULT '',
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    password_encrypted TEXT DEFAULT '',
    url TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT DEFAULT 'link',
    title TEXT NOT NULL,
    url TEXT DEFAULT '',
    content TEXT DEFAULT '',
    author TEXT DEFAULT '',
    source TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    is_pinned INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
]

// ==================== 数据库适配器 ====================

class DatabaseAdapter {
  private initialized = false

  /** 初始化数据库（建表）— 应用启动时调用一次 */
  async init(): Promise<void> {
    if (this.initialized) return
    // 非原生环境通过 mock 的 init 方法预初始化 localStorage
    await bridgeSQLite.init()
    // 建表
    for (const ddl of DDL_STATEMENTS) {
      await bridgeSQLite.exec(ddl)
    }
    this.initialized = true
  }

  async execute(sql: string, args: any[] = []): Promise<{ lastInsertId?: number }> {
    return bridgeSQLite.exec(sql, args)
  }

  async query<T>(sql: string, args: any[] = []): Promise<T[]> {
    const result = await bridgeSQLite.query<T>(sql, args)
    return result.rows
  }

  async lastInsertId(): Promise<number> {
    const result = await bridgeSQLite.lastInsertId()
    return result.id
  }
}

export const db = new DatabaseAdapter()

// ==================== 业务 DAO 层 ====================

const now = () => Date.now()

// ---------- Todo ----------
export const todoDao = {
  async list(status?: string): Promise<TodoItem[]> {
    const where = status && status !== 'all' ? `WHERE status = '${status}'` : ''
    return db.query<TodoItem>(`SELECT * FROM todos ${where} ORDER BY created_at DESC`)
  },
  async add(data: Omit<TodoItem, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    const t = now()
    const res = await db.execute(
      `INSERT INTO todos (title,note,priority,status,due_at,remind_at,tags,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      [data.title, data.note || '', data.priority, data.status, data.due_at ?? null, data.remind_at ?? null, data.tags || '[]', t, t]
    )
    return res.lastInsertId ?? await db.lastInsertId()
  },
  async update(id: number, data: Partial<TodoItem>): Promise<void> {
    const ALLOWED = new Set(['title', 'note', 'priority', 'status', 'due_at', 'remind_at', 'tags'])
    const safe = Object.fromEntries(Object.entries(data).filter(([k]) => ALLOWED.has(k)))
    if (!Object.keys(safe).length) return
    const sets = Object.keys(safe).map(k => `${k} = ?`).join(', ')
    await db.execute(`UPDATE todos SET ${sets}, updated_at = ? WHERE id = ?`, [...Object.values(safe), now(), id])
  },
  async done(id: number): Promise<void> {
    await db.execute(`UPDATE todos SET status = 'done', updated_at = ? WHERE id = ?`, [now(), id])
  },
  async undone(id: number): Promise<void> {
    await db.execute(`UPDATE todos SET status = 'pending', updated_at = ? WHERE id = ?`, [now(), id])
  },
  async remove(id: number): Promise<void> {
    await db.execute(`DELETE FROM todos WHERE id = ?`, [id])
  },
}

// ---------- Study Plan ----------
export const studyDao = {
  async planList(category?: string, parentId?: number | null): Promise<PlanItem[]> {
    let where = parentId !== undefined
      ? `WHERE parent_id ${parentId === null ? 'IS NULL' : `= ${parentId}`}`
      : 'WHERE parent_id IS NULL'
    if (category && category !== 'all') where += ` AND category = '${category}'`
    const plans = await db.query<PlanItem>(`SELECT * FROM study_plans ${where} ORDER BY created_at DESC`)
    for (const p of plans) {
      const tasks = await db.query<{ status: string }>(`SELECT status FROM study_tasks WHERE plan_id = ?`, [p.id])
      p.task_count = tasks.length
      p.done_count = tasks.filter(t => t.status === 'done').length
      const subs = await db.query<{ id: number }>(`SELECT id FROM study_plans WHERE parent_id = ?`, [p.id])
      p.sub_plan_count = subs.length
    }
    return plans
  },
  async planAdd(data: Omit<PlanItem, 'id' | 'task_count' | 'done_count' | 'sub_plan_count' | 'created_at' | 'updated_at'>): Promise<number> {
    const t = now()
    const res = await db.execute(
      `INSERT INTO study_plans (title,description,category,status,parent_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`,
      [data.title, data.description || '', data.category, data.status || 'active', data.parent_id ?? null, t, t]
    )
    return res.lastInsertId ?? await db.lastInsertId()
  },
  async planUpdate(id: number, data: Partial<PlanItem>): Promise<void> {
    const ALLOWED = new Set(['title', 'description', 'category', 'status'])
    const safe = Object.fromEntries(Object.entries(data).filter(([k]) => ALLOWED.has(k)))
    if (!Object.keys(safe).length) return
    const sets = Object.keys(safe).map(k => `${k} = ?`).join(', ')
    await db.execute(`UPDATE study_plans SET ${sets}, updated_at = ? WHERE id = ?`, [...Object.values(safe), now(), id])
  },
  async planDelete(id: number): Promise<void> {
    await db.execute(`DELETE FROM study_tasks WHERE plan_id = ?`, [id])
    await db.execute(`DELETE FROM study_plans WHERE id = ?`, [id])
  },
  async taskList(planId: number): Promise<PlanTask[]> {
    return db.query<PlanTask>(`SELECT * FROM study_tasks WHERE plan_id = ? ORDER BY created_at ASC`, [planId])
  },
  async taskAdd(planId: number, title: string): Promise<number> {
    const t = now()
    const res = await db.execute(
      `INSERT INTO study_tasks (plan_id,title,status,created_at,updated_at) VALUES (?,?,?,?,?)`,
      [planId, title, 'pending', t, t]
    )
    return res.lastInsertId ?? await db.lastInsertId()
  },
  async taskDone(id: number): Promise<void> {
    await db.execute(`UPDATE study_tasks SET status = 'done', updated_at = ? WHERE id = ?`, [now(), id])
  },
  async taskUndone(id: number): Promise<void> {
    await db.execute(`UPDATE study_tasks SET status = 'pending', updated_at = ? WHERE id = ?`, [now(), id])
  },
  async taskDelete(id: number): Promise<void> {
    await db.execute(`DELETE FROM study_tasks WHERE id = ?`, [id])
  },
}

// ---------- Note ----------
export const noteDao = {
  async list(keyword?: string): Promise<NoteItem[]> {
    if (keyword) {
      return db.query<NoteItem>(
        `SELECT * FROM notes WHERE title LIKE '%${keyword.replace(/'/g, "''")}%' OR content LIKE '%${keyword.replace(/'/g, "''")}%' ORDER BY is_pinned DESC, updated_at DESC`
      )
    }
    return db.query<NoteItem>(`SELECT * FROM notes ORDER BY is_pinned DESC, updated_at DESC`)
  },
  async get(id: number): Promise<NoteItem | null> {
    const rows = await db.query<NoteItem>(`SELECT * FROM notes WHERE id = ?`, [id])
    return rows[0] ?? null
  },
  async add(data: Omit<NoteItem, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    const t = now()
    const res = await db.execute(
      `INSERT INTO notes (title,content,is_pinned,created_at,updated_at) VALUES (?,?,?,?,?)`,
      [data.title, data.content || '', data.is_pinned || 0, t, t]
    )
    return res.lastInsertId ?? await db.lastInsertId()
  },
  async update(id: number, data: Partial<NoteItem>): Promise<void> {
    const ALLOWED = new Set(['title', 'content', 'is_pinned'])
    const safe = Object.fromEntries(Object.entries(data).filter(([k]) => ALLOWED.has(k)))
    if (!Object.keys(safe).length) return
    const sets = Object.keys(safe).map(k => `${k} = ?`).join(', ')
    await db.execute(`UPDATE notes SET ${sets}, updated_at = ? WHERE id = ?`, [...Object.values(safe), now(), id])
  },
  async remove(id: number): Promise<void> {
    await db.execute(`DELETE FROM notes WHERE id = ?`, [id])
  },
}

// ---------- Schedule ----------
export const scheduleDao = {
  async list(month?: string): Promise<ScheduleItem[]> {
    if (month) {
      return db.query<ScheduleItem>(
        `SELECT * FROM schedules WHERE date LIKE '${month}%' ORDER BY date ASC, start_time ASC`
      )
    }
    return db.query<ScheduleItem>(`SELECT * FROM schedules ORDER BY date ASC, start_time ASC`)
  },
  async add(data: Omit<ScheduleItem, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    const t = now()
    const res = await db.execute(
      `INSERT INTO schedules (title,description,date,start_time,end_time,is_all_day,color,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      [data.title, data.description || '', data.date, data.start_time || '', data.end_time || '', data.is_all_day || 0, data.color || '#0071e3', t, t]
    )
    return res.lastInsertId ?? await db.lastInsertId()
  },
  async update(id: number, data: Partial<ScheduleItem>): Promise<void> {
    const ALLOWED = new Set(['title', 'description', 'date', 'start_time', 'end_time', 'is_all_day', 'color'])
    const safe = Object.fromEntries(Object.entries(data).filter(([k]) => ALLOWED.has(k)))
    if (!Object.keys(safe).length) return
    const sets = Object.keys(safe).map(k => `${k} = ?`).join(', ')
    await db.execute(`UPDATE schedules SET ${sets}, updated_at = ? WHERE id = ?`, [...Object.values(safe), now(), id])
  },
  async remove(id: number): Promise<void> {
    await db.execute(`DELETE FROM schedules WHERE id = ?`, [id])
  },
}

// ---------- Reminder ----------
export const reminderDao = {
  async list(status?: string): Promise<ReminderItem[]> {
    const where = status ? `WHERE status = '${status}'` : ''
    return db.query<ReminderItem>(`SELECT * FROM reminders ${where} ORDER BY remind_at ASC`)
  },
  async add(data: Omit<ReminderItem, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    const t = now()
    const res = await db.execute(
      `INSERT INTO reminders (title,description,remind_at,status,source_type,source_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
      [data.title, data.description || '', data.remind_at, data.status || 'pending', data.source_type || '', data.source_id ?? null, t, t]
    )
    return res.lastInsertId ?? await db.lastInsertId()
  },
  async dismiss(id: number): Promise<void> {
    await db.execute(`UPDATE reminders SET status = 'done', updated_at = ? WHERE id = ?`, [now(), id])
  },
  async snooze(id: number, newRemindAt: number): Promise<void> {
    if (newRemindAt <= Date.now()) throw new Error('snooze time must be in the future')
    await db.execute(
      `UPDATE reminders SET status = 'snoozed', remind_at = ?, updated_at = ? WHERE id = ?`,
      [newRemindAt, now(), id]
    )
  },
  async remove(id: number): Promise<void> {
    await db.execute(`DELETE FROM reminders WHERE id = ?`, [id])
  },
}

// ---------- Account ----------
export const accountDao = {
  async list(type?: string): Promise<AccountItem[]> {
    const where = type && type !== 'all' ? `WHERE type = '${type}'` : ''
    return db.query<AccountItem>(`SELECT * FROM accounts ${where} ORDER BY created_at DESC`)
  },
  async add(data: Omit<AccountItem, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    const t = now()
    const res = await db.execute(
      `INSERT INTO accounts (platform,type,username,email,phone,password_encrypted,url,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [data.platform, data.type || 'other', data.username || '', data.email || '', data.phone || '', data.password_encrypted || '', data.url || '', data.note || '', t, t]
    )
    return res.lastInsertId ?? await db.lastInsertId()
  },
  async update(id: number, data: Partial<AccountItem>): Promise<void> {
    const ALLOWED = new Set(['platform', 'type', 'username', 'email', 'phone', 'password_encrypted', 'url', 'note'])
    const safe = Object.fromEntries(Object.entries(data).filter(([k]) => ALLOWED.has(k)))
    if (!Object.keys(safe).length) return
    const sets = Object.keys(safe).map(k => `${k} = ?`).join(', ')
    await db.execute(`UPDATE accounts SET ${sets}, updated_at = ? WHERE id = ?`, [...Object.values(safe), now(), id])
  },
  async remove(id: number): Promise<void> {
    await db.execute(`DELETE FROM accounts WHERE id = ?`, [id])
  },
}

// ---------- Favorite ----------
export const favoriteDao = {
  async list(type?: string): Promise<FavoriteItem[]> {
    const where = type && type !== 'all' ? `WHERE type = '${type}'` : ''
    return db.query<FavoriteItem>(`SELECT * FROM favorites ${where} ORDER BY is_pinned DESC, created_at DESC`)
  },
  async add(data: Omit<FavoriteItem, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    const t = now()
    const res = await db.execute(
      `INSERT INTO favorites (type,title,url,content,author,source,tags,is_pinned,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [data.type || 'link', data.title, data.url || '', data.content || '', data.author || '', data.source || '', data.tags || '[]', data.is_pinned || 0, t, t]
    )
    return res.lastInsertId ?? await db.lastInsertId()
  },
  async update(id: number, data: Partial<FavoriteItem>): Promise<void> {
    const ALLOWED = new Set(['type', 'title', 'url', 'content', 'author', 'source', 'tags', 'is_pinned'])
    const safe = Object.fromEntries(Object.entries(data).filter(([k]) => ALLOWED.has(k)))
    if (!Object.keys(safe).length) return
    const sets = Object.keys(safe).map(k => `${k} = ?`).join(', ')
    await db.execute(`UPDATE favorites SET ${sets}, updated_at = ? WHERE id = ?`, [...Object.values(safe), now(), id])
  },
  async pin(id: number, pinned: boolean): Promise<void> {
    await db.execute(`UPDATE favorites SET is_pinned = ?, updated_at = ? WHERE id = ?`, [pinned ? 1 : 0, now(), id])
  },
  async remove(id: number): Promise<void> {
    await db.execute(`DELETE FROM favorites WHERE id = ?`, [id])
  },
}
