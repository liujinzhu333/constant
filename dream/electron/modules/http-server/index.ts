/**
 * Dream — 局域网 HTTP 服务
 *
 * 职责：
 *  1. 暴露完整 REST API（所有业务表 CRUD），供局域网内浏览器 / 手机访问
 *  2. 静态文件服务：托管 dream-web 构建产物（/app/...）
 *  3. GET /qrcode  — 返回局域网访问地址的 SVG 二维码
 *  4. GET /ping    — 心跳，返回 { ok, app, version, ip, port }
 *
 * 监听：0.0.0.0:<PORT>（局域网可达）
 *   生产端口：45678
 *   开发端口：45679（避免与生产实例冲突）
 * CORS：全放行（局域网内可信）
 */

import * as http from 'http'
import * as https from 'https'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { randomUUID } from 'crypto'
import QRCode from 'qrcode'
import { StorageManager } from '../storage'
import { Logger } from '../logger'

export const PORT_PROD = 45678
export const PORT_DEV  = 45679

/** 读取自签名证书，找不到则返回 null（降级为 http） */
function loadCerts(appPath: string): { key: Buffer; cert: Buffer } | null {
  // 优先从 app 目录找（打包后），其次从项目根目录找（开发时）
  const candidates = [
    path.join(appPath, 'certs'),
    path.join(__dirname, '../../../certs'),
    path.join(__dirname, '../../../../certs'),
  ]
  for (const dir of candidates) {
    const keyPath  = path.join(dir, 'key.pem')
    const certPath = path.join(dir, 'cert.pem')
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }
    }
  }
  return null
}

// ─── 工具函数 ──────────────────────────────────────────────────

function now() { return Math.floor(Date.now() / 1000) }
function uuid() { return randomUUID() }

/** 获取本机所有局域网 IPv4 地址 */
function getLanIPs(): string[] {
  const ips: string[] = []
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address)
      }
    }
  }
  return ips
}

/** 读取请求 body（JSON） */
function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', c => { raw += c })
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}) }
      catch { reject(new Error('Invalid JSON')) }
    })
    req.on('error', reject)
  })
}

/** 发送 JSON 响应 */
function json(res: http.ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

/** 简单路由匹配：返回 { matched, params } */
function matchRoute(method: string, url: string, pattern: string, patternMethod: string)
  : { matched: boolean; params: Record<string, string> } {
  if (method !== patternMethod) return { matched: false, params: {} }
  const urlParts = url.split('?')[0].split('/').filter(Boolean)
  const patParts = pattern.split('/').filter(Boolean)
  if (urlParts.length !== patParts.length) return { matched: false, params: {} }
  const params: Record<string, string> = {}
  for (let i = 0; i < patParts.length; i++) {
    if (patParts[i].startsWith(':')) {
      params[patParts[i].slice(1)] = urlParts[i]
    } else if (patParts[i] !== urlParts[i]) {
      return { matched: false, params: {} }
    }
  }
  return { matched: true, params }
}

/** 解析 URL query string */
function parseQuery(url: string): Record<string, string> {
  const qs = url.includes('?') ? url.split('?')[1] : ''
  return Object.fromEntries(new URLSearchParams(qs))
}

// ─── MIME 映射 ─────────────────────────────────────────────────

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
  '.ttf':  'font/ttf',
  '.json': 'application/json',
}

// ─── HTTP Server ───────────────────────────────────────────────

export class LocalHttpServer {
  private static instance: LocalHttpServer
  private server: http.Server | https.Server | null = null
  private running = false
  private port: number = PORT_PROD
  private useHttps = false
  /** dream-web dist 目录，由外部调用 setWebRoot() 注入 */
  private webRoot: string | null = null
  /** app 根目录，用于定位 certs/（由外部注入） */
  private appPath: string = ''

  private constructor() {}

  static getInstance(): LocalHttpServer {
    if (!LocalHttpServer.instance) {
      LocalHttpServer.instance = new LocalHttpServer()
    }
    return LocalHttpServer.instance
  }

  /** 设置监听端口（必须在 start() 前调用） */
  setPort(port: number) { this.port = port }

  /** 注入 app 路径，用于定位证书 */
  setAppPath(p: string) { this.appPath = p }

  isRunning() { return this.running }
  getPort()   { return this.port }
  isUsingHttps() { return this.useHttps }

  getLanUrl() {
    const scheme = this.useHttps ? 'https' : 'http'
    const ips = getLanIPs()
    return ips.length ? `${scheme}://${ips[0]}:${this.port}` : `${scheme}://localhost:${this.port}`
  }

  /** 设置静态文件根目录（dream-web dist） */
  setWebRoot(dir: string) { this.webRoot = dir }

  start() {
    if (this.running) return
    const logger = Logger.getInstance()

    const handler = async (req: http.IncomingMessage, res: http.ServerResponse) => {
      const method = req.method?.toUpperCase() ?? 'GET'
      const rawUrl  = req.url ?? '/'

      // ── CORS ──
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      if (method === 'OPTIONS') { res.writeHead(204); res.end(); return }

      try {
        await this.route(method, rawUrl, req, res, logger)
      } catch (e: any) {
        logger.error('HttpServer', `未处理异常 ${method} ${rawUrl}`, e)
        json(res, 500, { error: e?.message ?? 'Internal error' })
      }
    }

    // 尝试加载证书，成功则启 HTTPS，否则降级 HTTP
    const certs = loadCerts(this.appPath)
    if (certs) {
      this.server = https.createServer({ key: certs.key, cert: certs.cert }, handler)
      this.useHttps = true
    } else {
      this.server = http.createServer(handler)
      this.useHttps = false
      logger.warn('HttpServer', '未找到证书，降级为 HTTP（云端 Web 可能无法访问）')
    }

    this.server.listen(this.port, '0.0.0.0', () => {
      this.running = true
      const lan = this.getLanUrl()
      logger.info('HttpServer', `已启动 → ${lan}  (局域网可达, ${this.useHttps ? 'HTTPS' : 'HTTP'})`)
    })

    this.server.on('error', (err: NodeJS.ErrnoException) => {
      this.running = false
      if (err.code === 'EADDRINUSE') {
        logger.warn('HttpServer', `端口 ${this.port} 已被占用`)
      } else {
        logger.error('HttpServer', '服务错误', err)
      }
      this.server = null
    })
  }

  stop() {
    this.server?.close()
    this.server = null
    this.running = false
    Logger.getInstance().info('HttpServer', '已停止')
  }

  // ─── 路由分发 ────────────────────────────────────────────────

  private async route(
    method: string, rawUrl: string,
    req: http.IncomingMessage, res: http.ServerResponse,
    logger: Logger
  ) {
    const url   = rawUrl.split('?')[0]
    const query = parseQuery(rawUrl)
    const db    = StorageManager.getInstance().getDb()

    // ── 系统接口 ──────────────────────────────────────────────

    // GET /ping
    if (method === 'GET' && url === '/ping') {
      return json(res, 200, {
        ok: true, app: 'Dream',
        ip: getLanIPs()[0] ?? 'localhost',
        port: this.port,
        lan: this.getLanUrl(),
      })
    }

    // GET /qrcode — 返回 SVG 二维码（局域网 Web App 地址）
    if (method === 'GET' && url === '/qrcode') {
      const target = `${this.getLanUrl()}/`
      const svg = await QRCode.toString(target, { type: 'svg', margin: 2 })
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' })
      res.end(svg)
      return
    }

    // ── API 路由 /api/... ─────────────────────────────────────

    if (url.startsWith('/api/')) {
      return this.handleApi(method, url, query, req, res, db, logger)
    }

    // ── 静态文件服务 /app/... ─────────────────────────────────

    if (this.webRoot) {
      // 去掉 /app 前缀，或直接从 webRoot 找
      let filePath = url === '/' ? '/index.html' : url
      // 如果路径不含 . (非文件扩展名)，返回 index.html（SPA fallback）
      if (!path.extname(filePath)) filePath = '/index.html'
      const fullPath = path.join(this.webRoot, filePath)
      if (fs.existsSync(fullPath)) {
        const ext  = path.extname(fullPath)
        const mime = MIME[ext] ?? 'application/octet-stream'
        res.writeHead(200, { 'Content-Type': mime })
        fs.createReadStream(fullPath).pipe(res)
        return
      }
    }

    json(res, 404, { error: 'Not found' })
  }

  // ─── API 处理（所有业务表） ───────────────────────────────────

  private async handleApi(
    method: string, url: string, query: Record<string, string>,
    req: http.IncomingMessage, res: http.ServerResponse,
    db: ReturnType<StorageManager['getDb']>,
    logger: Logger
  ) {
    let m: ReturnType<typeof matchRoute>

    // ═══════════════ TODOS ═══════════════════════════════════

    // GET /api/todos
    if ((m = matchRoute(method, url, '/api/todos', 'GET')).matched) {
      let sql = 'SELECT * FROM todos WHERE 1=1'
      const p: unknown[] = []
      if (query.status) { sql += ' AND status = ?'; p.push(query.status) }
      if (query.priority) { sql += ' AND priority = ?'; p.push(Number(query.priority)) }
      sql += ' ORDER BY priority ASC, created_at DESC'
      return json(res, 200, db.prepare(sql).all(...p))
    }

    // POST /api/todos
    if ((m = matchRoute(method, url, '/api/todos', 'POST')).matched) {
      const d = await readBody(req)
      const id = uuid(); const t = now()
      db.prepare(`INSERT INTO todos (id,title,note,status,priority,due_at,remind_at,tags,done_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, d.title, d.note??'', d.status??'todo', d.priority??2,
          d.due_at??null, d.remind_at??null, d.tags?JSON.stringify(d.tags):'[]', null, t, t)
      return json(res, 201, db.prepare('SELECT * FROM todos WHERE id=?').get(id))
    }

    // PATCH /api/todos/:id
    if ((m = matchRoute(method, url, '/api/todos/:id', 'PATCH')).matched) {
      const d = await readBody(req)
      const allowed = ['title','note','status','priority','due_at','remind_at','tags','done_at']
      const safe = Object.fromEntries(Object.entries(d).filter(([k]) => allowed.includes(k)))
      if ('tags' in safe && Array.isArray(safe.tags)) safe.tags = JSON.stringify(safe.tags)
      if (Object.keys(safe).length) {
        const sets = Object.keys(safe).map(k=>`${k}=?`).join(',')
        db.prepare(`UPDATE todos SET ${sets},updated_at=? WHERE id=?`)
          .run(...Object.values(safe).map(v => v === undefined ? null : v), now(), m.params.id)
      }
      return json(res, 200, db.prepare('SELECT * FROM todos WHERE id=?').get(m.params.id))
    }

    // DELETE /api/todos/:id
    if ((m = matchRoute(method, url, '/api/todos/:id', 'DELETE')).matched) {
      db.prepare('DELETE FROM todos WHERE id=?').run(m.params.id)
      return json(res, 200, { ok: true })
    }

    // ═══════════════ STUDY PLANS ══════════════════════════════

    // GET /api/study/plans
    if ((m = matchRoute(method, url, '/api/study/plans', 'GET')).matched) {
      let sql = 'SELECT * FROM study_plans WHERE 1=1'
      const p: unknown[] = []
      if (query.parent_id === 'null' || query.parent_id === undefined) {
        sql += ' AND parent_id IS NULL'
      } else if (query.parent_id) {
        sql += ' AND parent_id = ?'; p.push(query.parent_id)
      }
      if (query.category && query.category !== 'all') { sql += ' AND category=?'; p.push(query.category) }
      sql += ' ORDER BY created_at DESC'
      const plans = db.prepare(sql).all(...p) as any[]
      return json(res, 200, plans.map(pl => ({
        ...pl,
        task_count:     (db.prepare('SELECT COUNT(*) as c FROM study_tasks WHERE plan_id=?').get(pl.id) as any).c,
        done_count:     (db.prepare("SELECT COUNT(*) as c FROM study_tasks WHERE plan_id=? AND status='done'").get(pl.id) as any).c,
        sub_plan_count: (db.prepare('SELECT COUNT(*) as c FROM study_plans WHERE parent_id=?').get(pl.id) as any).c,
      })))
    }

    // POST /api/study/plans
    if ((m = matchRoute(method, url, '/api/study/plans', 'POST')).matched) {
      const d = await readBody(req); const id = uuid(); const t = now()
      db.prepare(`INSERT INTO study_plans (id,title,description,goal,category,status,start_date,end_date,progress,color,parent_id,checkin_enabled,checkin_goal,checkin_target_days,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, d.title, d.description??'', d.goal??'', d.category??'study',
          d.status??'active', d.start_date??null, d.end_date??null, d.progress??0,
          d.color??'#0071e3', d.parent_id??null,
          d.checkin_enabled??0, d.checkin_goal??'', d.checkin_target_days??0,
          t, t)
      const plan = db.prepare('SELECT * FROM study_plans WHERE id=?').get(id) as any
      return json(res, 201, { ...plan, task_count:0, done_count:0, sub_plan_count:0 })
    }

    // PATCH /api/study/plans/:id
    if ((m = matchRoute(method, url, '/api/study/plans/:id', 'PATCH')).matched) {
      const d = await readBody(req)
      const allowed = ['title','description','goal','category','status','start_date','end_date','progress','color','checkin_enabled','checkin_goal','checkin_target_days']
      const safe = Object.fromEntries(Object.entries(d).filter(([k]) => allowed.includes(k)))
      if (Object.keys(safe).length) {
        const sets = Object.keys(safe).map(k=>`${k}=?`).join(',')
        db.prepare(`UPDATE study_plans SET ${sets},updated_at=? WHERE id=?`)
          .run(...Object.values(safe).map(v => v === undefined ? null : v), now(), m.params.id)
      }
      return json(res, 200, db.prepare('SELECT * FROM study_plans WHERE id=?').get(m.params.id))
    }

    // DELETE /api/study/plans/:id
    if ((m = matchRoute(method, url, '/api/study/plans/:id', 'DELETE')).matched) {
      db.prepare('DELETE FROM study_tasks WHERE plan_id=?').run(m.params.id)
      db.prepare('DELETE FROM study_plans WHERE id=?').run(m.params.id)
      return json(res, 200, { ok: true })
    }

    // GET /api/study/tasks?plan_id=xxx
    if ((m = matchRoute(method, url, '/api/study/tasks', 'GET')).matched) {
      return json(res, 200,
        db.prepare('SELECT * FROM study_tasks WHERE plan_id=? ORDER BY sort_order ASC,created_at ASC')
          .all(query.plan_id ?? ''))
    }

    // POST /api/study/tasks
    if ((m = matchRoute(method, url, '/api/study/tasks', 'POST')).matched) {
      const d = await readBody(req); const id = uuid(); const t = now()
      const maxOrd = (db.prepare('SELECT MAX(sort_order) as m FROM study_tasks WHERE plan_id=?').get(d.plan_id) as any).m ?? 0
      db.prepare(`INSERT INTO study_tasks (id,plan_id,title,status,due_at,sort_order,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?)`)
        .run(id, d.plan_id, d.title, d.status??'todo', d.due_at??null, maxOrd+1, t, t)
      this.syncPlanProgress(db, d.plan_id)
      return json(res, 201, db.prepare('SELECT * FROM study_tasks WHERE id=?').get(id))
    }

    // PATCH /api/study/tasks/:id
    if ((m = matchRoute(method, url, '/api/study/tasks/:id', 'PATCH')).matched) {
      const d = await readBody(req)
      const allowed = ['title','status','due_at','sort_order']
      const safe = Object.fromEntries(Object.entries(d).filter(([k]) => allowed.includes(k)))
      if (Object.keys(safe).length) {
        const sets = Object.keys(safe).map(k=>`${k}=?`).join(',')
        // better-sqlite3 不接受 undefined，统一转为 null
        const vals = Object.values(safe).map(v => v === undefined ? null : v)
        db.prepare(`UPDATE study_tasks SET ${sets},updated_at=? WHERE id=?`)
          .run(...vals, now(), m.params.id)
      }
      const task = db.prepare('SELECT * FROM study_tasks WHERE id=?').get(m.params.id) as any
      if (task) {
        this.syncPlanProgress(db, task.plan_id)
        // 状态变更时尝试自动打卡 / 撤销打卡
        if ('status' in safe) {
          if ((safe as any).status === 'done') {
            this.tryAutoCheckin(db, task.plan_id)
          } else {
            this.tryRemoveAutoCheckin(db, task.plan_id)
          }
        }
      }
      return json(res, 200, task)
    }

    // DELETE /api/study/tasks/:id
    if ((m = matchRoute(method, url, '/api/study/tasks/:id', 'DELETE')).matched) {
      const task = db.prepare('SELECT plan_id FROM study_tasks WHERE id=?').get(m.params.id) as any
      db.prepare('DELETE FROM study_tasks WHERE id=?').run(m.params.id)
      if (task) {
        this.syncPlanProgress(db, task.plan_id)
        this.tryRemoveAutoCheckin(db, task.plan_id) // 删除任务后可能不再满足全完成
      }
      return json(res, 200, { ok: true })
    }

    // ═══════════════ STUDY CHECKINS ═══════════════════════════

    // GET /api/study/checkins?plan_id=xxx[&months=3]
    if ((m = matchRoute(method, url, '/api/study/checkins', 'GET')).matched) {
      if (!query.plan_id) return json(res, 400, { error: 'plan_id required' })
      const months = Math.min(Number(query.months ?? 3), 12)
      const since = new Date()
      since.setMonth(since.getMonth() - months)
      const sinceStr = since.toISOString().slice(0, 10)
      return json(res, 200,
        db.prepare('SELECT * FROM study_checkins WHERE plan_id=? AND date>=? ORDER BY date ASC')
          .all(query.plan_id, sinceStr))
    }

    // ═══════════════ NOTES ════════════════════════════════════

    // GET /api/notes
    if ((m = matchRoute(method, url, '/api/notes', 'GET')).matched) {
      if (query.keyword) {
        const kw = `%${query.keyword}%`
        return json(res, 200,
          db.prepare('SELECT * FROM notes WHERE title LIKE ? OR content LIKE ? ORDER BY is_pinned DESC,updated_at DESC')
            .all(kw, kw))
      }
      return json(res, 200,
        db.prepare('SELECT * FROM notes ORDER BY is_pinned DESC,updated_at DESC').all())
    }

    // GET /api/notes/:id
    if ((m = matchRoute(method, url, '/api/notes/:id', 'GET')).matched) {
      const note = db.prepare('SELECT * FROM notes WHERE id=?').get(m.params.id)
      return note ? json(res, 200, note) : json(res, 404, { error: 'Not found' })
    }

    // POST /api/notes
    if ((m = matchRoute(method, url, '/api/notes', 'POST')).matched) {
      const d = await readBody(req); const id = uuid(); const t = now()
      db.prepare(`INSERT INTO notes (id,title,content,tags,is_pinned,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
        .run(id, d.title??'无标题', d.content??'', d.tags?JSON.stringify(d.tags):'[]', d.is_pinned??0, t, t)
      return json(res, 201, db.prepare('SELECT * FROM notes WHERE id=?').get(id))
    }

    // PATCH /api/notes/:id
    if ((m = matchRoute(method, url, '/api/notes/:id', 'PATCH')).matched) {
      const d = await readBody(req)
      const allowed = ['title','content','tags','is_pinned']
      const safe = Object.fromEntries(Object.entries(d).filter(([k]) => allowed.includes(k)))
      if ('tags' in safe && Array.isArray(safe.tags)) safe.tags = JSON.stringify(safe.tags)
      if (Object.keys(safe).length) {
        const sets = Object.keys(safe).map(k=>`${k}=?`).join(',')
        db.prepare(`UPDATE notes SET ${sets},updated_at=? WHERE id=?`).run(...Object.values(safe).map(v => v === undefined ? null : v), now(), m.params.id)
      }
      return json(res, 200, db.prepare('SELECT * FROM notes WHERE id=?').get(m.params.id))
    }

    // DELETE /api/notes/:id
    if ((m = matchRoute(method, url, '/api/notes/:id', 'DELETE')).matched) {
      db.prepare('DELETE FROM notes WHERE id=?').run(m.params.id)
      return json(res, 200, { ok: true })
    }

    // ═══════════════ SCHEDULES ════════════════════════════════

    // GET /api/schedules?start=ts&end=ts
    if ((m = matchRoute(method, url, '/api/schedules', 'GET')).matched) {
      const start = Number(query.start ?? 0)
      const end   = Number(query.end   ?? 9999999999999)
      return json(res, 200,
        db.prepare('SELECT * FROM schedules WHERE start_at >= ? AND start_at < ? ORDER BY start_at ASC')
          .all(start, end))
    }

    // POST /api/schedules
    if ((m = matchRoute(method, url, '/api/schedules', 'POST')).matched) {
      const d = await readBody(req); const id = uuid(); const t = now()
      db.prepare(`INSERT INTO schedules (id,title,note,start_at,end_at,all_day,color,remind_at,repeat_rule,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, d.title, d.note??'', d.start_at, d.end_at,
          d.all_day??0, d.color??'#0071e3', d.remind_at??null, d.repeat_rule??'', t, t)
      return json(res, 201, db.prepare('SELECT * FROM schedules WHERE id=?').get(id))
    }

    // PATCH /api/schedules/:id
    if ((m = matchRoute(method, url, '/api/schedules/:id', 'PATCH')).matched) {
      const d = await readBody(req)
      const allowed = ['title','note','start_at','end_at','all_day','color','remind_at','repeat_rule']
      const safe = Object.fromEntries(Object.entries(d).filter(([k]) => allowed.includes(k)))
      if (Object.keys(safe).length) {
        const sets = Object.keys(safe).map(k=>`${k}=?`).join(',')
        db.prepare(`UPDATE schedules SET ${sets},updated_at=? WHERE id=?`).run(...Object.values(safe).map(v => v === undefined ? null : v), now(), m.params.id)
      }
      return json(res, 200, db.prepare('SELECT * FROM schedules WHERE id=?').get(m.params.id))
    }

    // DELETE /api/schedules/:id
    if ((m = matchRoute(method, url, '/api/schedules/:id', 'DELETE')).matched) {
      db.prepare('DELETE FROM schedules WHERE id=?').run(m.params.id)
      return json(res, 200, { ok: true })
    }

    // ═══════════════ REMINDERS ════════════════════════════════

    // GET /api/reminders?status=pending
    if ((m = matchRoute(method, url, '/api/reminders', 'GET')).matched) {
      if (query.status) {
        return json(res, 200,
          db.prepare('SELECT * FROM reminders WHERE status=? ORDER BY remind_at ASC').all(query.status))
      }
      return json(res, 200, db.prepare('SELECT * FROM reminders ORDER BY remind_at ASC').all())
    }

    // POST /api/reminders
    if ((m = matchRoute(method, url, '/api/reminders', 'POST')).matched) {
      const d = await readBody(req); const id = uuid(); const t = now()
      db.prepare(`INSERT INTO reminders (id,source_type,source_id,title,body,remind_at,status,created_at)
        VALUES (?,?,?,?,?,?,?,?)`)
        .run(id, d.source_type??'custom', d.source_id??null, d.title, d.body??'', d.remind_at, d.status??'pending', t)
      return json(res, 201, db.prepare('SELECT * FROM reminders WHERE id=?').get(id))
    }

    // PATCH /api/reminders/:id
    if ((m = matchRoute(method, url, '/api/reminders/:id', 'PATCH')).matched) {
      const d = await readBody(req)
      const allowed = ['status','remind_at','body']
      const safe = Object.fromEntries(Object.entries(d).filter(([k]) => allowed.includes(k)))
      if (Object.keys(safe).length) {
        const sets = Object.keys(safe).map(k=>`${k}=?`).join(',')
        db.prepare(`UPDATE reminders SET ${sets} WHERE id=?`).run(...Object.values(safe).map(v => v === undefined ? null : v), m.params.id)
      }
      return json(res, 200, db.prepare('SELECT * FROM reminders WHERE id=?').get(m.params.id))
    }

    // DELETE /api/reminders/:id
    if ((m = matchRoute(method, url, '/api/reminders/:id', 'DELETE')).matched) {
      db.prepare('DELETE FROM reminders WHERE id=?').run(m.params.id)
      return json(res, 200, { ok: true })
    }

    // ═══════════════ ACCOUNTS ═════════════════════════════════

    // GET /api/accounts?category=dev
    if ((m = matchRoute(method, url, '/api/accounts', 'GET')).matched) {
      if (query.category && query.category !== 'all') {
        return json(res, 200,
          db.prepare('SELECT * FROM accounts WHERE category=? ORDER BY created_at DESC').all(query.category))
      }
      return json(res, 200, db.prepare('SELECT * FROM accounts ORDER BY created_at DESC').all())
    }

    // POST /api/accounts
    if ((m = matchRoute(method, url, '/api/accounts', 'POST')).matched) {
      const d = await readBody(req); const id = uuid(); const t = now()
      db.prepare(`INSERT INTO accounts (id,platform,platform_url,account_name,phone,email,password_enc,note,category,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, d.platform, d.platform_url??'', d.account_name??'',
          d.phone??'', d.email??'', d.password_enc??'', d.note??'', d.category??'other', t, t)
      return json(res, 201, db.prepare('SELECT * FROM accounts WHERE id=?').get(id))
    }

    // PATCH /api/accounts/:id
    if ((m = matchRoute(method, url, '/api/accounts/:id', 'PATCH')).matched) {
      const d = await readBody(req)
      const allowed = ['platform','platform_url','account_name','phone','email','password_enc','note','category']
      const safe = Object.fromEntries(Object.entries(d).filter(([k]) => allowed.includes(k)))
      if (Object.keys(safe).length) {
        const sets = Object.keys(safe).map(k=>`${k}=?`).join(',')
        db.prepare(`UPDATE accounts SET ${sets},updated_at=? WHERE id=?`).run(...Object.values(safe).map(v => v === undefined ? null : v), now(), m.params.id)
      }
      return json(res, 200, db.prepare('SELECT * FROM accounts WHERE id=?').get(m.params.id))
    }

    // DELETE /api/accounts/:id
    if ((m = matchRoute(method, url, '/api/accounts/:id', 'DELETE')).matched) {
      db.prepare('DELETE FROM accounts WHERE id=?').run(m.params.id)
      return json(res, 200, { ok: true })
    }

    // ═══════════════ FAVORITES ════════════════════════════════

    // GET /api/favorites?type=link&keyword=xxx
    if ((m = matchRoute(method, url, '/api/favorites', 'GET')).matched) {
      let sql = 'SELECT * FROM favorites WHERE 1=1'
      const p: unknown[] = []
      if (query.type && query.type !== 'all') { sql += ' AND type=?'; p.push(query.type) }
      if (query.keyword) {
        sql += ' AND (title LIKE ? OR content LIKE ? OR author LIKE ?)'
        const kw = `%${query.keyword}%`; p.push(kw, kw, kw)
      }
      sql += ' ORDER BY is_pinned DESC,created_at DESC'
      return json(res, 200, db.prepare(sql).all(...p))
    }

    // POST /api/favorites
    if ((m = matchRoute(method, url, '/api/favorites', 'POST')).matched) {
      const d = await readBody(req); const id = uuid(); const t = now()
      // 去重
      if (d.url) {
        const dup = db.prepare('SELECT id FROM favorites WHERE url=?').get(d.url) as any
        if (dup) return json(res, 200, { duplicate: true, id: dup.id })
      }
      db.prepare(`INSERT INTO favorites (id,type,title,url,content,author,tags,is_pinned,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(id, d.type??'link', d.title??'', d.url??'', d.content??'', d.author??'',
          d.tags?JSON.stringify(d.tags):'[]', d.is_pinned??0, t, t)
      return json(res, 201, db.prepare('SELECT * FROM favorites WHERE id=?').get(id))
    }

    // PATCH /api/favorites/:id
    if ((m = matchRoute(method, url, '/api/favorites/:id', 'PATCH')).matched) {
      const d = await readBody(req)
      const allowed = ['type','title','url','content','author','tags','is_pinned']
      const safe = Object.fromEntries(Object.entries(d).filter(([k]) => allowed.includes(k)))
      if ('tags' in safe && Array.isArray(safe.tags)) safe.tags = JSON.stringify(safe.tags)
      if (Object.keys(safe).length) {
        const sets = Object.keys(safe).map(k=>`${k}=?`).join(',')
        db.prepare(`UPDATE favorites SET ${sets},updated_at=? WHERE id=?`).run(...Object.values(safe).map(v => v === undefined ? null : v), now(), m.params.id)
      }
      return json(res, 200, db.prepare('SELECT * FROM favorites WHERE id=?').get(m.params.id))
    }

    // DELETE /api/favorites/:id
    if ((m = matchRoute(method, url, '/api/favorites/:id', 'DELETE')).matched) {
      db.prepare('DELETE FROM favorites WHERE id=?').run(m.params.id)
      return json(res, 200, { ok: true })
    }

    logger.warn('HttpServer', `未匹配路由: ${method} ${url}`)
    return json(res, 404, { error: 'Not found' })
  }

  // ─── 辅助 ────────────────────────────────────────────────────

  private syncPlanProgress(db: ReturnType<StorageManager['getDb']>, planId: string) {
    const total = (db.prepare('SELECT COUNT(*) as c FROM study_tasks WHERE plan_id=?').get(planId) as any).c
    const done  = (db.prepare("SELECT COUNT(*) as c FROM study_tasks WHERE plan_id=? AND status='done'").get(planId) as any).c
    const progress = total > 0 ? Math.round((done / total) * 100) : 0
    db.prepare('UPDATE study_plans SET progress=?,updated_at=? WHERE id=?').run(progress, now(), planId)
  }

  private tryAutoCheckin(db: ReturnType<StorageManager['getDb']>, planId: string) {
    const plan = db.prepare('SELECT checkin_enabled FROM study_plans WHERE id=?').get(planId) as any
    if (!plan?.checkin_enabled) return
    const total = (db.prepare('SELECT COUNT(*) as c FROM study_tasks WHERE plan_id=?').get(planId) as any).c
    if (total === 0) return
    const todo = (db.prepare("SELECT COUNT(*) as c FROM study_tasks WHERE plan_id=? AND status='todo'").get(planId) as any).c
    if (todo > 0) return
    const today = new Date().toISOString().slice(0, 10)
    const exists = db.prepare('SELECT id FROM study_checkins WHERE plan_id=? AND date=?').get(planId, today)
    if (exists) return
    try {
      db.prepare('INSERT INTO study_checkins (id,plan_id,date,note,created_at) VALUES (?,?,?,?,?)')
        .run(randomUUID(), planId, today, '', now())
    } catch { /* UNIQUE 冲突忽略 */ }
  }

  private tryRemoveAutoCheckin(db: ReturnType<StorageManager['getDb']>, planId: string) {
    const plan = db.prepare('SELECT checkin_enabled FROM study_plans WHERE id=?').get(planId) as any
    if (!plan?.checkin_enabled) return
    const today = new Date().toISOString().slice(0, 10)
    db.prepare('DELETE FROM study_checkins WHERE plan_id=? AND date=?').run(planId, today)
  }
}
