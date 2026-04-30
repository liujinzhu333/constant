/**
 * 基座：IPC 通信注册中心
 * 统一注册主进程与渲染进程间的通信处理器
 * 为业务包提供安全的系统能力调用接口
 */
import { ipcMain, shell, app, dialog } from 'electron'
import { Logger } from '../logger'
import { StorageManager } from '../storage'
import { SystemAdapter } from '../system'
import { UpdaterModule } from '../updater'
import { BusinessIpc } from '../business'

export class IpcManager {
  private static instance: IpcManager
  private logger!: Logger

  private constructor() {}

  static getInstance(): IpcManager {
    if (!IpcManager.instance) {
      IpcManager.instance = new IpcManager()
    }
    return IpcManager.instance
  }

  register() {
    this.logger = Logger.getInstance()
    this.registerAppHandlers()
    this.registerStorageHandlers()
    this.registerNotificationHandlers()
    this.registerSystemHandlers()
    // 注册业务模块 IPC
    BusinessIpc.getInstance().register()
    this.logger.info('IPC', 'IPC 通信处理器注册完成')
  }

  // ==================== 应用信息 ====================
  private registerAppHandlers() {
    ipcMain.handle('app:getVersion', () => app.getVersion())
    ipcMain.handle('app:getPlatform', () => process.platform)
    ipcMain.handle('app:getPath', (_event, name: Parameters<typeof app.getPath>[0]) => {
      return app.getPath(name)
    })

    ipcMain.handle('app:openExternal', async (_event, url: string) => {
      // 只允许 https 链接
      if (url.startsWith('https://')) {
        await shell.openExternal(url)
        return true
      }
      return false
    })

    // 在系统文件管理器中显示指定路径（文件则选中，目录则打开）
    ipcMain.handle('app:showInFolder', (_event, filePath: string) => {
      shell.showItemInFolder(filePath)
      return true
    })

    ipcMain.handle('app:showOpenDialog', async (_event, options: Electron.OpenDialogOptions) => {
      return dialog.showOpenDialog(options)
    })

    ipcMain.handle('app:showSaveDialog', async (_event, options: Electron.SaveDialogOptions) => {
      return dialog.showSaveDialog(options)
    })

    ipcMain.handle('app:minimize', (_event) => {
      const win = SystemAdapter.getInstance()
      // @ts-ignore
      win.mainWindow?.minimize()
    })

    ipcMain.handle('app:quit', () => {
      app.isQuitting = true
      app.quit()
    })
  }

  // ==================== 加密存储 ====================
  private registerStorageHandlers() {
    const storage = StorageManager.getInstance()

    ipcMain.handle('store:set', (_event, namespace: string, key: string, value: unknown) => {
      try {
        storage.encryptedSet(namespace, key, value)
        return { success: true }
      } catch (err) {
        this.logger.error('IPC', 'store:set 失败', err)
        return { success: false, error: (err as Error).message }
      }
    })

    ipcMain.handle('store:get', (_event, namespace: string, key: string) => {
      try {
        const value = storage.encryptedGet(namespace, key)
        return { success: true, value }
      } catch (err) {
        this.logger.error('IPC', 'store:get 失败', err)
        return { success: false, error: (err as Error).message }
      }
    })

    ipcMain.handle('store:delete', (_event, namespace: string, key: string) => {
      try {
        storage.encryptedDelete(namespace, key)
        return { success: true }
      } catch (err) {
        this.logger.error('IPC', 'store:delete 失败', err)
        return { success: false, error: (err as Error).message }
      }
    })

    ipcMain.handle('store:backup', async () => {
      try {
        const backupPath = storage.backup()
        return { success: true, path: backupPath }
      } catch (err) {
        this.logger.error('IPC', '备份失败', err)
        return { success: false, error: (err as Error).message }
      }
    })

    ipcMain.handle('store:listBackups', () => {
      try {
        return { success: true, backups: storage.listBackups() }
      } catch (err) {
        this.logger.error('IPC', 'listBackups 失败', err)
        return { success: false, error: (err as Error).message, backups: [] }
      }
    })

    ipcMain.handle('store:deleteBackup', (_event, backupPath: string) => {
      try {
        storage.deleteBackup(backupPath)
        return { success: true }
      } catch (err) {
        this.logger.error('IPC', 'deleteBackup 失败', err)
        return { success: false, error: (err as Error).message }
      }
    })

    ipcMain.handle('store:restoreBackup', (_event, backupPath: string) => {
      try {
        storage.restoreBackup(backupPath)
        this.logger.info('IPC', `数据库已从备份恢复: ${backupPath}`)
        return { success: true }
      } catch (err) {
        this.logger.error('IPC', 'restoreBackup 失败', err)
        return { success: false, error: (err as Error).message }
      }
    })

    ipcMain.handle('store:importBackup', async () => {
      try {
        // 弹出文件选择器让用户选择 .db 文件
        const { BrowserWindow } = await import('electron')
        const win = BrowserWindow.getFocusedWindow()
        const result = await dialog.showOpenDialog(win!, {
          title: '选择备份文件',
          filters: [{ name: 'Dream 备份', extensions: ['db'] }],
          properties: ['openFile']
        })
        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, canceled: true }
        }
        storage.importBackup(result.filePaths[0])
        this.logger.info('IPC', `数据库已从外部文件导入: ${result.filePaths[0]}`)
        return { success: true }
      } catch (err) {
        this.logger.error('IPC', 'importBackup 失败', err)
        return { success: false, error: (err as Error).message }
      }
    })

    ipcMain.handle('store:getMeta', (_event, key: string) => {
      return storage.getMeta(key)
    })
  }

  // ==================== 系统通知 ====================
  private registerNotificationHandlers() {
    const system = SystemAdapter.getInstance()

    ipcMain.handle('notification:send', (_event, options: {
      title: string
      body: string
      silent?: boolean
    }) => {
      system.sendNotification(options)
      return { success: true }
    })
  }

  // ==================== 系统信息 + 日志管理 ====================
  private registerSystemHandlers() {
    ipcMain.handle('system:log', (_event, level: 'debug' | 'info' | 'warn' | 'error', module: string, message: string) => {
      this.logger[level](module, `[Renderer] ${message}`)
    })

    ipcMain.handle('system:getLogDir', () => {
      return this.logger.getLogDir()
    })

    // 获取日志文件列表
    ipcMain.handle('log:getFiles', () => {
      return this.logger.getLogFiles()
    })

    // 读取指定日志文件内容
    ipcMain.handle('log:readFile', (_event, filename: string, maxLines?: number) => {
      return this.logger.readLogFile(filename, maxLines)
    })

    // 删除指定日志文件
    ipcMain.handle('log:deleteFile', (_event, filename: string) => {
      return this.logger.deleteLogFile(filename)
    })

    // 清空所有历史日志（保留今天）
    ipcMain.handle('log:clearAll', () => {
      return this.logger.clearAllLogs()
    })

    ipcMain.handle('updater:rollback', async () => {
      return UpdaterModule.getInstance().rollback()
    })
  }
}
