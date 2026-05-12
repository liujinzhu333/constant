/// <reference types="vite/client" />

export interface BackupInfo {
  name: string
  path: string
  size: number
  createdAt: number
}

declare global {
  interface Window {
    /** 仅在 Electron 环境下存在，Web 浏览器中为 undefined */
    dreamAPI?: {
      app: {
        getVersion: () => Promise<string>
        getPlatform: () => Promise<string>
        getPath: (name: string) => Promise<string>
        openExternal: (url: string) => Promise<void>
        showInFolder: (path: string) => Promise<void>
        showOpenDialog: (opts: unknown) => Promise<{ canceled: boolean; filePaths: string[] }>
        showSaveDialog: (opts: unknown) => Promise<{ canceled: boolean; filePath?: string }>
        minimize: () => void
        quit: () => void
      }
      store: {
        set: (key: string, val: unknown) => Promise<void>
        get: (key: string) => Promise<unknown>
        delete: (key: string) => Promise<void>
        getMeta: (key: string) => Promise<string | null>
        backup: () => Promise<{ success: boolean; path?: string; error?: string }>
        listBackups: () => Promise<{ success: boolean; backups: BackupInfo[] }>
        deleteBackup: (path: string) => Promise<{ success: boolean; error?: string }>
        restoreBackup: (path: string) => Promise<{ success: boolean; error?: string }>
        importBackup: () => Promise<{ canceled?: boolean; success?: boolean; error?: string }>
      }
      log: {
        debug: (...args: unknown[]) => void
        info: (...args: unknown[]) => void
        warn: (...args: unknown[]) => void
        error: (...args: unknown[]) => void
        getLogDir: () => Promise<string>
        getFiles: () => Promise<{ name: string; date: string; size: number; isToday: boolean }[]>
        readFile: (name: string, maxLines: number) => Promise<{ lines: string[]; total: number }>
        deleteFile: (name: string) => Promise<{ success: boolean; error?: string }>
        clearAll: () => Promise<{ success: boolean; deleted: number; error?: string }>
      }
      updater: {
        check: () => Promise<{ hasUpdate: boolean; version?: string }>
        download: () => Promise<void>
        install: () => Promise<void>
        getStatus: () => Promise<string>
        rollback: () => Promise<boolean>
        onStatus: (cb: (data: { status: string; info?: unknown }) => void) => () => void
        onProgress: (cb: (data: { percent: number }) => void) => () => void
        onError: (cb: (err: unknown) => void) => () => void
      }
      httpServer: {
        start: () => Promise<{ success: boolean; port?: number; error?: string }>
        stop: () => Promise<{ success: boolean; error?: string }>
        status: () => Promise<{ running: boolean; port: number; lanUrl?: string }>
      }
    }
  }
}

export {}
