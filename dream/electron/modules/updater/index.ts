/**
 * 基座：热更新模块
 * 负责PC端业务包版本检测、更新包下载、完整性校验、旧包卸载、新包安装与加载
 * 支持自动与手动更新，不中断PC端应用运行
 * 采用增量更新（小版本）与全量更新（大版本）策略
 */
import { autoUpdater, UpdateInfo } from 'electron-updater'
import { BrowserWindow, ipcMain } from 'electron'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { Logger } from '../logger'
import { StorageManager } from '../storage'

export type UpdateStatus =
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'rollback'

export interface UpdateProgress {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

export class UpdaterModule {
  private static instance: UpdaterModule
  private logger!: Logger
  private storage!: StorageManager
  private mainWindow: BrowserWindow | null = null
  private currentStatus: UpdateStatus = 'not-available'

  private constructor() {}

  static getInstance(): UpdaterModule {
    if (!UpdaterModule.instance) {
      UpdaterModule.instance = new UpdaterModule()
    }
    return UpdaterModule.instance
  }

  init(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
    this.logger = Logger.getInstance()
    this.storage = StorageManager.getInstance()

    this.configureUpdater()
    this.registerEvents()
    this.registerIPC()

    this.logger.info('Updater', '热更新模块初始化完成')
  }

  private configureUpdater() {
    autoUpdater.logger = null // 使用自定义 logger
    autoUpdater.autoDownload = false    // 手动控制下载
    autoUpdater.autoInstallOnAppQuit = false

    // 允许降级（回滚时需要）
    autoUpdater.allowDowngrade = true
  }

  private registerEvents() {
    autoUpdater.on('checking-for-update', () => {
      this.setStatus('checking')
      this.logger.info('Updater', '正在检测更新...')
    })

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.setStatus('available')
      this.logger.info('Updater', '发现新版本', { version: info.version })
      this.sendToRenderer('updater:status', { status: 'available', info })
    })

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      this.setStatus('not-available')
      this.logger.info('Updater', '已是最新版本', { version: info.version })
      this.sendToRenderer('updater:status', { status: 'not-available', info })
    })

    autoUpdater.on('download-progress', (progress: UpdateProgress) => {
      this.setStatus('downloading')
      this.sendToRenderer('updater:progress', progress)
      this.logger.debug('Updater', `下载进度: ${progress.percent.toFixed(1)}%`)
    })

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.setStatus('downloaded')
      this.logger.info('Updater', '更新包下载完成', { version: info.version })
      this.sendToRenderer('updater:status', { status: 'downloaded', info })

      // 记录更新日志
      const activePackage = this.storage.getActivePackage()
      this.storage.getDb().prepare(`
        INSERT INTO update_logs (from_ver, to_ver, status, message)
        VALUES (?, ?, 'success', '更新包已下载，等待安装')
      `).run(activePackage?.version ?? 'unknown', info.version)
    })

    autoUpdater.on('error', (err) => {
      this.setStatus('error')
      this.logger.error('Updater', '热更新异常', err)
      this.sendToRenderer('updater:error', { message: err.message })
    })
  }

  private registerIPC() {
    // 检查更新
    ipcMain.handle('updater:check', async () => {
      return this.checkForUpdates()
    })

    // 开始下载
    ipcMain.handle('updater:download', async () => {
      return this.downloadUpdate()
    })

    // 安装更新（退出并安装）
    ipcMain.handle('updater:install', async () => {
      return this.installUpdate()
    })

    // 获取当前状态
    ipcMain.handle('updater:getStatus', () => {
      return this.currentStatus
    })
  }

  /**
   * 检测更新
   * 使用语义化版本比较（远端版本 > 本地版本才算有更新，避免误触降级）
   */
  async checkForUpdates(): Promise<{ hasUpdate: boolean; version?: string }> {
    try {
      const result = await autoUpdater.checkForUpdates()
      if (!result) return { hasUpdate: false }
      const remoteVer = result.updateInfo.version
      const localVer = autoUpdater.currentVersion.version
      const hasUpdate = this.semverGt(remoteVer, localVer)
      this.logger.info('Updater', `版本对比: local=${localVer} remote=${remoteVer} hasUpdate=${hasUpdate}`)
      return { hasUpdate, version: remoteVer }
    } catch (err) {
      this.logger.error('Updater', '检测更新失败', err)
      return { hasUpdate: false }
    }
  }

  /**
   * 简单 semver 比较：a > b 返回 true
   * 格式：MAJOR.MINOR.PATCH，不含预发布标签
   */
  private semverGt(a: string, b: string): boolean {
    const parse = (v: string) => v.split('.').map(n => parseInt(n, 10) || 0)
    const [aMaj, aMin, aPat] = parse(a)
    const [bMaj, bMin, bPat] = parse(b)
    if (aMaj !== bMaj) return aMaj > bMaj
    if (aMin !== bMin) return aMin > bMin
    return aPat > bPat
  }

  /**
   * 下载更新包
   */
  async downloadUpdate(): Promise<boolean> {
    try {
      await autoUpdater.downloadUpdate()
      return true
    } catch (err) {
      this.logger.error('Updater', '下载更新失败', err)
      return false
    }
  }

  /**
   * 安装更新（退出并重启）
   */
  installUpdate() {
    this.logger.info('Updater', '开始安装更新，应用即将重启')
    autoUpdater.quitAndInstall(false, true)
  }

  /**
   * 校验文件 MD5
   */
  verifyChecksum(filePath: string, expectedMd5: string): boolean {
    try {
      const fileBuffer = fs.readFileSync(filePath)
      const hash = crypto.createHash('md5').update(fileBuffer).digest('hex')
      const valid = hash === expectedMd5
      if (!valid) {
        this.logger.warn('Updater', `MD5校验失败: expected=${expectedMd5}, actual=${hash}`)
      }
      return valid
    } catch (err) {
      this.logger.error('Updater', '文件校验失败', err)
      return false
    }
  }

  /**
   * 回滚到上一个稳定版本
   */
  async rollback(): Promise<boolean> {
    try {
      this.setStatus('rollback')
      this.logger.warn('Updater', '开始执行版本回滚')

      const db = this.storage.getDb()
      const prevPackage = db.prepare(`
        SELECT version, path FROM business_packages
        WHERE status = 'inactive'
        ORDER BY installed_at DESC
        LIMIT 1
      `).get() as { version: string; path: string } | undefined

      if (!prevPackage) {
        this.logger.warn('Updater', '没有可回滚的版本')
        return false
      }

      // 检查包文件是否存在
      if (!fs.existsSync(prevPackage.path)) {
        this.logger.error('Updater', `回滚目标包文件不存在: ${prevPackage.path}`)
        return false
      }

      this.storage.activatePackage(prevPackage.version)
      db.prepare(`
        INSERT INTO update_logs (to_ver, status, message)
        VALUES (?, 'rollback', '手动回滚到该版本')
      `).run(prevPackage.version)

      this.logger.info('Updater', `回滚成功: ${prevPackage.version}`)
      this.sendToRenderer('updater:status', { status: 'rollback', version: prevPackage.version })
      return true
    } catch (err) {
      this.logger.error('Updater', '回滚失败', err)
      return false
    }
  }

  private setStatus(status: UpdateStatus) {
    this.currentStatus = status
  }

  private sendToRenderer(channel: string, data: unknown) {
    this.mainWindow?.webContents.send(channel, data)
  }
}
