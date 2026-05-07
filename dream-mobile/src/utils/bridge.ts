/**
 * Dream Mobile — H5 侧 JSBridge SDK
 *
 * 与 Android BridgeDispatcher.kt 对接，封装 window.DreamBridge.call()
 * 为类型安全的 Promise API。
 *
 * 调用约定（与原生对齐）：
 *   H5 → 原生：window.DreamBridge.call(JSON)
 *   原生 → H5：window.__dreamBridgeCallback__(JSON)
 *   原生就绪事件：window.dispatchEvent(new CustomEvent('dream:ready', { detail: {...} }))
 *
 * 环境检测：
 *   - 在原生基座内：window.DreamBridge 存在
 *   - 纯浏览器调试：window.DreamBridge 不存在，自动降级为 localStorage 模拟
 */

// ==================== 类型 ====================

export interface BridgeRequest {
  id: string
  module: string
  method: string
  params?: Record<string, unknown>
}

export interface BridgeResponse<T = unknown> {
  id: string
  ok: boolean
  data?: T
  error?: string
}

export interface PlatformInfo {
  platform: 'android' | 'ios' | 'browser'
  version: string
  bridgeVersion: string
}

// ==================== 核心 Bridge 类 ====================

class DreamBridgeSDK {
  /** 是否运行在原生基座内 */
  readonly isNative: boolean

  /** 平台信息（dream:ready 事件填充） */
  private _platform: PlatformInfo = {
    platform: 'browser',
    version: 'unknown',
    bridgeVersion: 'N/A',
  }

  private _pendingCallbacks = new Map<string, {
    resolve: (data: unknown) => void
    reject: (err: Error) => void
    timer: ReturnType<typeof setTimeout>
  }>()

  private _readyPromise: Promise<PlatformInfo>
  private _readyResolve!: (info: PlatformInfo) => void

  constructor() {
    // 检测原生环境
    this.isNative = typeof (window as any).DreamBridge !== 'undefined'

    // 注入全局回调函数（原生调用此函数将结果返还 H5）
    ;(window as any).__dreamBridgeCallback__ = (payload: BridgeResponse) => {
      this._handleCallback(payload)
    }

    // 等待原生就绪事件
    this._readyPromise = new Promise<PlatformInfo>((resolve) => {
      this._readyResolve = resolve
    })

    if (this.isNative) {
      window.addEventListener('dream:ready', (e: Event) => {
        const info = (e as CustomEvent<PlatformInfo>).detail
        this._platform = info
        this._readyResolve(info)
      }, { once: true })

      // 超时保护：3s 未收到 ready 事件，仍 resolve（防止卡住）
      setTimeout(() => {
        this._readyResolve(this._platform)
      }, 3000)
    } else {
      // 纯浏览器：立即 resolve
      this._platform = { platform: 'browser', version: 'dev', bridgeVersion: 'mock' }
      this._readyResolve(this._platform)
    }
  }

  /** 等待原生桥就绪 */
  ready(): Promise<PlatformInfo> {
    return this._readyPromise
  }

  get platform(): PlatformInfo {
    return { ...this._platform }
  }

  /**
   * 调用原生模块方法
   * @param module  原生模块名（sqlite / notification / biometric / file / update）
   * @param method  方法名
   * @param params  参数
   * @param timeout 超时毫秒，默认 10000
   */
  call<T = unknown>(
    module: string,
    method: string,
    params: Record<string, unknown> = {},
    timeout = 10_000
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = `${module}.${method}.${Date.now()}.${Math.random().toString(36).slice(2)}`

      const timer = setTimeout(() => {
        this._pendingCallbacks.delete(id)
        reject(new Error(`Bridge timeout: ${module}.${method}`))
      }, timeout)

      this._pendingCallbacks.set(id, {
        resolve: (data) => resolve(data as T),
        reject,
        timer,
      })

      const request: BridgeRequest = { id, module, method, params }

      if (this.isNative) {
        try {
          ;(window as any).DreamBridge.call(JSON.stringify(request))
        } catch (e) {
          clearTimeout(timer)
          this._pendingCallbacks.delete(id)
          reject(new Error(`Bridge call failed: ${String(e)}`))
        }
      } else {
        // 非原生环境：路由到本地 mock
        this._mockDispatch(id, module, method, params)
      }
    })
  }

  private _handleCallback(payload: BridgeResponse) {
    const pending = this._pendingCallbacks.get(payload.id)
    if (!pending) return

    clearTimeout(pending.timer)
    this._pendingCallbacks.delete(payload.id)

    if (payload.ok) {
      pending.resolve(payload.data)
    } else {
      pending.reject(new Error(payload.error || 'Bridge error'))
    }
  }

  // ==================== 浏览器调试 Mock ====================
  private _mockDispatch(
    id: string,
    module: string,
    method: string,
    params: Record<string, unknown>
  ) {
    // 异步模拟，保持与原生一致的异步语义
    setTimeout(() => {
      try {
        const result = this._mockHandle(module, method, params)
        this._handleCallback({ id, ok: true, data: result })
      } catch (e) {
        this._handleCallback({ id, ok: false, error: String(e) })
      }
    }, 0)
  }

  private _mockHandle(
    module: string,
    method: string,
    params: Record<string, unknown>
  ): unknown {
    return mockBridge[module]?.[method]?.(params) ?? null
  }
}

// ==================== 浏览器 Mock 实现 ====================
// 开发调试时用 localStorage 代替原生 SQLite，模拟通知/更新接口

const DB_PREFIX = 'dream_mock_'

function mockStorage(table: string): any[] {
  return JSON.parse(localStorage.getItem(DB_PREFIX + table) || '[]')
}

function mockSave(table: string, data: any[]): void {
  localStorage.setItem(DB_PREFIX + table, JSON.stringify(data))
}

function mockNextId(table: string): number {
  const key = DB_PREFIX + '_seq_' + table
  const id = (parseInt(localStorage.getItem(key) || '0') || 0) + 1
  localStorage.setItem(key, String(id))
  return id
}

const TABLES = [
  'todos', 'study_plans', 'study_tasks', 'notes',
  'schedules', 'reminders', 'accounts', 'favorites',
]

const mockBridge: Record<string, Record<string, (p: any) => unknown>> = {
  // ---------- SQLite Mock ----------
  sqlite: {
    exec: (p: { sql: string; args?: any[] }) => {
      const sql = (p.sql || '').trim()
      const args = p.args || []
      const su = sql.toUpperCase()

      if (su.startsWith('CREATE TABLE')) return { changes: 0 }

      if (su.startsWith('INSERT')) {
        const tableMatch = sql.match(/INSERT INTO (\w+)/i)
        if (!tableMatch) return { changes: 0 }
        const table = tableMatch[1]
        const rows = mockStorage(table)
        const colsMatch = sql.match(/\(([^)]+)\)\s*VALUES/i)
        if (!colsMatch) return { changes: 0 }
        const cols = colsMatch[1].split(',').map((c: string) => c.trim())
        const row: any = { id: mockNextId(table) }
        cols.forEach((col: string, i: number) => { row[col] = args[i] })
        rows.push(row)
        mockSave(table, rows)
        return { changes: 1, lastInsertId: row.id }
      }

      if (su.startsWith('UPDATE')) {
        const tableMatch = sql.match(/UPDATE (\w+)/i)
        if (!tableMatch) return { changes: 0 }
        const table = tableMatch[1]
        const rows = mockStorage(table)
        const idArg = args[args.length - 1]
        const setMatch = sql.match(/SET (.+) WHERE/i)
        if (!setMatch) return { changes: 0 }
        const setCols = setMatch[1].split(',').map((c: string) => c.trim().split(/\s*=\s*\?/)[0].trim())
        let changes = 0
        const updated = rows.map((r: any) => {
          if (r.id !== idArg) return r
          changes++
          const newRow = { ...r }
          setCols.forEach((col: string, i: number) => { newRow[col] = args[i] })
          return newRow
        })
        mockSave(table, updated)
        return { changes }
      }

      if (su.startsWith('DELETE')) {
        const tableMatch = sql.match(/DELETE FROM (\w+)/i)
        if (!tableMatch) return { changes: 0 }
        const table = tableMatch[1]
        const idArg = args[0]
        const before = mockStorage(table)
        const after = before.filter((r: any) => r.id !== idArg)
        mockSave(table, after)
        return { changes: before.length - after.length }
      }

      return { changes: 0 }
    },

    query: (p: { sql: string; args?: any[] }) => {
      const sql = p.sql || ''
      const args = p.args || []
      const tableMatch = sql.match(/FROM (\w+)/i)
      if (!tableMatch) return { rows: [] }
      const table = tableMatch[1]
      let rows: any[] = mockStorage(table)
      // 简单 WHERE id = ?
      if (args.length === 1 && sql.toUpperCase().includes('WHERE') && sql.includes('id = ?')) {
        rows = rows.filter((r: any) => r.id === args[0])
      }
      // WHERE plan_id = ?
      if (args.length === 1 && sql.includes('plan_id = ?')) {
        rows = rows.filter((r: any) => r.plan_id === args[0])
      }
      // WHERE parent_id IS NULL
      if (sql.includes('parent_id IS NULL')) {
        rows = rows.filter((r: any) => r.parent_id === null || r.parent_id === undefined)
      }
      // ORDER BY … DESC
      if (sql.toUpperCase().includes('ORDER BY') && sql.toUpperCase().includes('DESC')) {
        rows = [...rows].reverse()
      }
      return { rows }
    },

    lastInsertId: (_p: unknown) => {
      // 由 exec 返回，此接口仅兼容老调用
      let max = 0
      for (const t of TABLES) {
        const arr = mockStorage(t)
        if (arr.length) max = Math.max(max, arr[arr.length - 1]?.id ?? 0)
      }
      return { id: max }
    },

    init: (_p: unknown) => {
      for (const t of TABLES) {
        if (!localStorage.getItem(DB_PREFIX + t)) {
          mockSave(t, [])
        }
      }
      return { ok: true }
    },
  },

  // ---------- Notification Mock ----------
  notification: {
    requestPermission: (_p: unknown) => ({ granted: true }),
    send: (p: any) => {
      console.log('[Bridge Mock] notification.send', p)
      return { notifId: p.id ?? Date.now() }
    },
    schedule: (p: any) => {
      console.log('[Bridge Mock] notification.schedule', p)
      return { notifId: p.id ?? Date.now(), triggerAt: Date.now() + (p.delaySec ?? 0) * 1000 }
    },
    cancel: (p: any) => {
      console.log('[Bridge Mock] notification.cancel', p)
      return {}
    },
  },

  // ---------- Biometric Mock ----------
  biometric: {
    isAvailable: (_p: unknown) => ({ available: false, reason: 'browser mock' }),
    authenticate: (_p: unknown) => { throw new Error('Biometric not available in browser') },
  },

  // ---------- File Mock ----------
  file: {
    write: (p: any) => {
      localStorage.setItem(DB_PREFIX + 'file_' + p.path, p.content ?? '')
      return { written: true }
    },
    read: (p: any) => {
      const content = localStorage.getItem(DB_PREFIX + 'file_' + p.path)
      if (content === null) throw new Error(`File not found: ${p.path}`)
      return { content }
    },
    delete: (p: any) => {
      localStorage.removeItem(DB_PREFIX + 'file_' + p.path)
      return { deleted: true }
    },
    list: (_p: unknown) => ({ files: [] }),
    stat: (p: any) => {
      const exists = localStorage.getItem(DB_PREFIX + 'file_' + p.path) !== null
      return { exists, size: 0 }
    },
  },

  // ---------- Update Mock ----------
  update: {
    getVersion: (_p: unknown) => ({ version: '1.0.0', source: 'bundle' }),
    download: (_p: unknown) => { throw new Error('Update not available in browser') },
    apply: (_p: unknown) => { throw new Error('Update not available in browser') },
    reload: (_p: unknown) => { throw new Error('Update not available in browser') },
    clean: (_p: unknown) => ({ cleaned: true }),
  },
}

// ==================== 单例导出 ====================

export const bridge = new DreamBridgeSDK()

// ==================== 便捷子模块封装 ====================

/** SQLite 操作（exec/query/lastInsertId/init） */
export const bridgeSQLite = {
  init: () => bridge.call<{ ok: boolean }>('sqlite', 'init', {}, 5000),
  exec: (sql: string, args: any[] = []) =>
    bridge.call<{ changes: number; lastInsertId: number }>('sqlite', 'exec', { sql, args }),
  query: <T = any>(sql: string, args: any[] = []) =>
    bridge.call<{ rows: T[] }>('sqlite', 'query', { sql, args }),
  lastInsertId: () =>
    bridge.call<{ id: number }>('sqlite', 'lastInsertId', {}),
}

/** 通知操作 */
export const bridgeNotification = {
  requestPermission: () =>
    bridge.call<{ granted: boolean }>('notification', 'requestPermission', {}),
  send: (params: { id?: number; title: string; content: string; delaySec?: number }) =>
    bridge.call<{ notifId: number }>('notification', 'send', params as any),
  schedule: (params: { id: number; title: string; content: string; delaySec: number }) =>
    bridge.call<{ notifId: number; triggerAt: number }>('notification', 'schedule', params as any),
  cancel: (id: number) =>
    bridge.call<Record<string, never>>('notification', 'cancel', { id }),
}

/** 生物识别 */
export const bridgeBiometric = {
  isAvailable: () =>
    bridge.call<{ available: boolean; reason?: string }>('biometric', 'isAvailable', {}),
  authenticate: (reason: string) =>
    bridge.call<{ success: boolean }>('biometric', 'authenticate', { reason }),
}

/** 文件操作 */
export const bridgeFile = {
  write: (filePath: string, content: string) =>
    bridge.call<{ written: boolean }>('file', 'write', { path: filePath, content }),
  read: (filePath: string) =>
    bridge.call<{ content: string }>('file', 'read', { path: filePath }),
  delete: (filePath: string) =>
    bridge.call<{ deleted: boolean }>('file', 'delete', { path: filePath }),
  list: (dir: string) =>
    bridge.call<{ files: string[] }>('file', 'list', { path: dir }),
  stat: (filePath: string) =>
    bridge.call<{ exists: boolean; size: number }>('file', 'stat', { path: filePath }),
}

/** 热更新 */
export const bridgeUpdate = {
  getVersion: () =>
    bridge.call<{ version: string; source: 'bundle' | 'update' }>('update', 'getVersion', {}),
  download: (params: { url: string; md5?: string; callbackEvent?: string }) =>
    bridge.call<{ tempPath: string; size: number }>('update', 'download', params as any, 120_000),
  apply: (tempPath?: string) =>
    bridge.call<{ applied: boolean; dir: string }>('update', 'apply', tempPath ? { tempPath } : {}),
  reload: () =>
    bridge.call<Record<string, never>>('update', 'reload', {}),
  clean: () =>
    bridge.call<{ cleaned: boolean }>('update', 'clean', {}),
}
