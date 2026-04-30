/**
 * Electron 预加载脚本
 * 安全地将主进程 API 暴露给渲染进程（业务包）
 * 通过 contextBridge 隔离，确保安全性
 */
import { contextBridge, ipcRenderer } from 'electron'

// ==================== 类型定义 ====================

export interface TodoItem {
  id: string; title: string; note: string; status: string
  priority: number; due_at: number | null; remind_at: number | null
  tags: string; created_at: number; updated_at: number; done_at: number | null
}

export type PlanCategory = 'study' | 'work' | 'life' | 'fitness' | 'finance'

export interface StudyPlan {
  id: string; title: string; description: string; goal: string
  category: PlanCategory
  status: string; start_date: number | null; end_date: number | null
  progress: number; color: string; created_at: number; updated_at: number
  parent_id: string | null
  taskCount?: number; doneCount?: number; subPlanCount?: number
}

export interface StudyTask {
  id: string; plan_id: string; title: string; status: string
  due_at: number | null; sort_order: number; created_at: number; updated_at: number
}

export interface Note {
  id: string; title: string; content: string; tags: string
  is_pinned: number; created_at: number; updated_at: number
}

export interface Schedule {
  id: string; title: string; note: string; start_at: number; end_at: number
  all_day: number; color: string; remind_at: number | null
  created_at: number; updated_at: number
}

export interface Reminder {
  id: string; source_type: string; source_id: string | null
  title: string; body: string; remind_at: number; status: string; created_at: number
}

export interface BackupInfo {
  name: string
  path: string
  size: number
  createdAt: number
}

export type AccountCategory =
  | 'dev'       // 开发工具（GitHub、GitLab、云服务…）
  | 'social'    // 社交媒体（微博、Twitter、小红书…）
  | 'shopping'  // 购物（淘宝、京东…）
  | 'finance'   // 金融（支付宝、银行…）
  | 'game'      // 游戏
  | 'work'      // 工作（企业邮箱、OA…）
  | 'media'     // 音视频（Netflix、B站…）
  | 'other'     // 其他

export interface Account {
  id: string
  platform: string
  platform_url: string
  account_name: string
  phone: string
  email: string
  password_enc: string   // AES 密文，用户密钥在渲染进程持有
  note: string
  category: AccountCategory
  created_at: number
  updated_at: number
}

export interface DreamAPI {
  app: {
    getVersion: () => Promise<string>
    getPlatform: () => Promise<string>
    getPath: (name: string) => Promise<string>
    openExternal: (url: string) => Promise<boolean>
    showInFolder: (filePath: string) => Promise<boolean>
    showOpenDialog: (options: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>
    showSaveDialog: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>
    minimize: () => Promise<void>
    quit: () => Promise<void>
  }
  store: {
    set: (namespace: string, key: string, value: unknown) => Promise<{ success: boolean; error?: string }>
    get: (namespace: string, key: string) => Promise<{ success: boolean; value?: unknown; error?: string }>
    delete: (namespace: string, key: string) => Promise<{ success: boolean; error?: string }>
    backup: () => Promise<{ success: boolean; path?: string; error?: string }>
    listBackups: () => Promise<{ success: boolean; backups: BackupInfo[]; error?: string }>
    deleteBackup: (backupPath: string) => Promise<{ success: boolean; error?: string }>
    restoreBackup: (backupPath: string) => Promise<{ success: boolean; error?: string }>
    importBackup: () => Promise<{ success: boolean; canceled?: boolean; error?: string }>
    getMeta: (key: string) => Promise<string | null>
  }
  notification: {
    send: (options: { title: string; body: string; silent?: boolean }) => Promise<{ success: boolean }>
  }
  updater: {
    check: () => Promise<{ hasUpdate: boolean; version?: string }>
    download: () => Promise<boolean>
    install: () => Promise<void>
    getStatus: () => Promise<string>
    rollback: () => Promise<boolean>
    onStatus: (callback: (data: { status: string; info?: unknown }) => void) => () => void
    onProgress: (callback: (data: { percent: number; transferred: number; total: number }) => void) => () => void
    onError: (callback: (data: { message: string }) => void) => () => void
  }
  log: {
    debug: (module: string, message: string) => void
    info: (module: string, message: string) => void
    warn: (module: string, message: string) => void
    error: (module: string, message: string) => void
    getLogDir: () => Promise<string>
    getFiles: () => Promise<Array<{ name: string; date: string; size: number; isToday: boolean }>>
    readFile: (filename: string, maxLines?: number) => Promise<{ lines: string[]; total: number }>
    deleteFile: (filename: string) => Promise<{ success: boolean; error?: string }>
    clearAll: () => Promise<{ success: boolean; deleted: number; error?: string }>
  }
  // ========== 业务模块 ==========
  todo: {
    list: (filter?: { status?: string; priority?: number }) => Promise<TodoItem[]>
    add: (data: { title: string; note?: string; priority?: number; due_at?: number; tags?: string[] }) => Promise<TodoItem>
    update: (id: string, data: Partial<TodoItem>) => Promise<TodoItem>
    done: (id: string) => Promise<boolean>
    undone: (id: string) => Promise<boolean>
    delete: (id: string) => Promise<boolean>
  }
  study: {
    planList: (category?: string) => Promise<StudyPlan[]>
    planAdd: (data: { title: string; description?: string; goal?: string; category?: string; start_date?: number; end_date?: number; color?: string; parent_id?: string }) => Promise<StudyPlan>
    planUpdate: (id: string, data: Partial<StudyPlan>) => Promise<StudyPlan>
    planDelete: (id: string) => Promise<boolean>
    subPlanList: (parentId: string) => Promise<StudyPlan[]>
    taskList: (planId: string) => Promise<StudyTask[]>
    taskAdd: (planId: string, data: { title: string; due_at?: number }) => Promise<StudyTask>
    taskDone: (id: string, planId: string) => Promise<boolean>
    taskUndone: (id: string, planId: string) => Promise<boolean>
    taskDelete: (id: string, planId: string) => Promise<boolean>
  }
  note: {
    list: (keyword?: string) => Promise<Note[]>
    get: (id: string) => Promise<Note>
    add: (data: { title?: string; content?: string; tags?: string[] }) => Promise<Note>
    update: (id: string, data: Partial<Note>) => Promise<Note>
    delete: (id: string) => Promise<boolean>
  }
  schedule: {
    list: (startTs: number, endTs: number) => Promise<Schedule[]>
    add: (data: { title: string; note?: string; start_at: number; end_at: number; all_day?: number; color?: string; remind_at?: number }) => Promise<Schedule>
    update: (id: string, data: Partial<Schedule>) => Promise<Schedule>
    delete: (id: string) => Promise<boolean>
  }
  reminder: {
    list: (status?: string) => Promise<Reminder[]>
    add: (data: { source_type: string; source_id?: string; title: string; body?: string; remind_at: number }) => Promise<Reminder>
    dismiss: (id: string) => Promise<boolean>
    snooze: (id: string, newRemindAt: number) => Promise<boolean>
    delete: (id: string) => Promise<boolean>
  }
  account: {
    list: () => Promise<Account[]>
    add: (data: {
      platform: string; platform_url?: string; account_name?: string
      phone?: string; email?: string; password_enc?: string; note?: string; category?: string
    }) => Promise<Account>
    update: (id: string, data: Partial<Omit<Account, 'id' | 'created_at' | 'updated_at'>>) => Promise<Account>
    delete: (id: string) => Promise<boolean>
  }
}

// ==================== 注册 contextBridge ====================

contextBridge.exposeInMainWorld('dreamAPI', {
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
    getPath: (name: string) => ipcRenderer.invoke('app:getPath', name),
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
    showInFolder: (filePath: string) => ipcRenderer.invoke('app:showInFolder', filePath),
    showOpenDialog: (options: Electron.OpenDialogOptions) => ipcRenderer.invoke('app:showOpenDialog', options),
    showSaveDialog: (options: Electron.SaveDialogOptions) => ipcRenderer.invoke('app:showSaveDialog', options),
    minimize: () => ipcRenderer.invoke('app:minimize'),
    quit: () => ipcRenderer.invoke('app:quit')
  },
  store: {
    set: (namespace: string, key: string, value: unknown) => ipcRenderer.invoke('store:set', namespace, key, value),
    get: (namespace: string, key: string) => ipcRenderer.invoke('store:get', namespace, key),
    delete: (namespace: string, key: string) => ipcRenderer.invoke('store:delete', namespace, key),
    backup: () => ipcRenderer.invoke('store:backup'),
    listBackups: () => ipcRenderer.invoke('store:listBackups'),
    deleteBackup: (backupPath: string) => ipcRenderer.invoke('store:deleteBackup', backupPath),
    restoreBackup: (backupPath: string) => ipcRenderer.invoke('store:restoreBackup', backupPath),
    importBackup: () => ipcRenderer.invoke('store:importBackup'),
    getMeta: (key: string) => ipcRenderer.invoke('store:getMeta', key)
  },
  notification: {
    send: (options: { title: string; body: string; silent?: boolean }) => ipcRenderer.invoke('notification:send', options)
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    getStatus: () => ipcRenderer.invoke('updater:getStatus'),
    rollback: () => ipcRenderer.invoke('updater:rollback'),
    onStatus: (callback: (data: { status: string; info?: unknown }) => void) => {
      const h = (_: Electron.IpcRendererEvent, d: { status: string; info?: unknown }) => callback(d)
      ipcRenderer.on('updater:status', h); return () => ipcRenderer.off('updater:status', h)
    },
    onProgress: (callback: (data: { percent: number; transferred: number; total: number }) => void) => {
      const h = (_: Electron.IpcRendererEvent, d: { percent: number; transferred: number; total: number }) => callback(d)
      ipcRenderer.on('updater:progress', h); return () => ipcRenderer.off('updater:progress', h)
    },
    onError: (callback: (data: { message: string }) => void) => {
      const h = (_: Electron.IpcRendererEvent, d: { message: string }) => callback(d)
      ipcRenderer.on('updater:error', h); return () => ipcRenderer.off('updater:error', h)
    }
  },
  log: {
    debug: (module: string, message: string) => ipcRenderer.invoke('system:log', 'debug', module, message),
    info: (module: string, message: string) => ipcRenderer.invoke('system:log', 'info', module, message),
    warn: (module: string, message: string) => ipcRenderer.invoke('system:log', 'warn', module, message),
    error: (module: string, message: string) => ipcRenderer.invoke('system:log', 'error', module, message),
    getLogDir: () => ipcRenderer.invoke('system:getLogDir'),
    getFiles: () => ipcRenderer.invoke('log:getFiles'),
    readFile: (filename: string, maxLines?: number) => ipcRenderer.invoke('log:readFile', filename, maxLines),
    deleteFile: (filename: string) => ipcRenderer.invoke('log:deleteFile', filename),
    clearAll: () => ipcRenderer.invoke('log:clearAll'),
  },
  // ========== 业务模块 ==========
  todo: {
    list: (filter?: { status?: string; priority?: number }) => ipcRenderer.invoke('todo:list', filter),
    add: (data: Record<string, unknown>) => ipcRenderer.invoke('todo:add', data),
    update: (id: string, data: Record<string, unknown>) => ipcRenderer.invoke('todo:update', id, data),
    done: (id: string) => ipcRenderer.invoke('todo:done', id),
    undone: (id: string) => ipcRenderer.invoke('todo:undone', id),
    delete: (id: string) => ipcRenderer.invoke('todo:delete', id)
  },
  study: {
    planList: (category?: string) => ipcRenderer.invoke('study:planList', category),
    planAdd: (data: Record<string, unknown>) => ipcRenderer.invoke('study:planAdd', data),
    planUpdate: (id: string, data: Record<string, unknown>) => ipcRenderer.invoke('study:planUpdate', id, data),
    planDelete: (id: string) => ipcRenderer.invoke('study:planDelete', id),
    subPlanList: (parentId: string) => ipcRenderer.invoke('study:subPlanList', parentId),
    taskList: (planId: string) => ipcRenderer.invoke('study:taskList', planId),
    taskAdd: (planId: string, data: Record<string, unknown>) => ipcRenderer.invoke('study:taskAdd', planId, data),
    taskDone: (id: string, planId: string) => ipcRenderer.invoke('study:taskDone', id, planId),
    taskUndone: (id: string, planId: string) => ipcRenderer.invoke('study:taskUndone', id, planId),
    taskDelete: (id: string, planId: string) => ipcRenderer.invoke('study:taskDelete', id, planId)
  },
  note: {
    list: (keyword?: string) => ipcRenderer.invoke('note:list', keyword),
    get: (id: string) => ipcRenderer.invoke('note:get', id),
    add: (data: Record<string, unknown>) => ipcRenderer.invoke('note:add', data),
    update: (id: string, data: Record<string, unknown>) => ipcRenderer.invoke('note:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('note:delete', id)
  },
  schedule: {
    list: (startTs: number, endTs: number) => ipcRenderer.invoke('schedule:list', startTs, endTs),
    add: (data: Record<string, unknown>) => ipcRenderer.invoke('schedule:add', data),
    update: (id: string, data: Record<string, unknown>) => ipcRenderer.invoke('schedule:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('schedule:delete', id)
  },
  reminder: {
    list: (status?: string) => ipcRenderer.invoke('reminder:list', status),
    add: (data: Record<string, unknown>) => ipcRenderer.invoke('reminder:add', data),
    dismiss: (id: string) => ipcRenderer.invoke('reminder:dismiss', id),
    snooze: (id: string, newRemindAt: number) => ipcRenderer.invoke('reminder:snooze', id, newRemindAt),
    delete: (id: string) => ipcRenderer.invoke('reminder:delete', id)
  },
  account: {
    list: () => ipcRenderer.invoke('account:list'),
    add: (data: Record<string, unknown>) => ipcRenderer.invoke('account:add', data),
    update: (id: string, data: Record<string, unknown>) => ipcRenderer.invoke('account:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('account:delete', id)
  }
} satisfies DreamAPI)
