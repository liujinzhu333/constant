/**
 * 基座：应用启动模块
 * 负责PC端应用启动初始化、基座核心组件加载、业务包精准加载
 * 确保PC端应用启动时间控制在3秒内
 * 适配Windows与macOS启动规范
 */
import { app, BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { Logger } from '../logger'
import { StorageManager } from '../storage'
import { SystemAdapter } from '../system'
import { UpdaterModule } from '../updater'
import { LocalHttpServer } from '../http-server'

// vite-plugin-electron 开发时注入 VITE_DEV_SERVER_URL，以此判断是否开发模式
const isDev = !!process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === 'development'

export class StartupManager {
  private static instance: StartupManager
  private startTime: number = Date.now()

  private constructor() {}

  static getInstance(): StartupManager {
    if (!StartupManager.instance) {
      StartupManager.instance = new StartupManager()
    }
    return StartupManager.instance
  }

  /**
   * 主启动流程
   */
  async bootstrap() {
    this.startTime = Date.now()
    console.log('[Startup] 基座启动中...')

    // 1. 单例锁，防止多开
    if (!app.requestSingleInstanceLock()) {
      console.log('[Startup] 已有实例在运行，退出')
      app.quit()
      return
    }

    // 2. 初始化日志（最先初始化）
    const logger = Logger.getInstance()
    logger.info('Startup', '========== Dream 基座启动 ==========')
    logger.info('Startup', `版本: 1.0.0 | 平台: ${process.platform} | Arch: ${process.arch}`)
    logger.info('Startup', `isDev: ${isDev}`)

    // 3. 初始化本地存储
    logger.info('Startup', '初始化本地存储...')
    const storage = StorageManager.getInstance()
    logger.info('Startup', `数据目录: ${storage.getUserDataPath()}`)

    // 4. 初始化系统适配
    const system = SystemAdapter.getInstance()
    system.init(logger)

    // 5. 等待 Electron 就绪
    await app.whenReady()

    // 6. 创建主窗口
    logger.info('Startup', '创建主窗口...')
    const preloadPath = path.join(__dirname, '../preload/index.js')
    const mainWindow = system.createMainWindow({
      title: 'Dream',
      preloadPath
    })

    // 7. 加载页面
    await this.loadApp(mainWindow, logger)

    // 8. 系统托盘
    const iconPath = this.resolveTrayIcon()
    system.createTray(iconPath)

    // 9. 注册全局快捷键
    system.registerShortcuts()

    // 10. 初始化热更新模块
    const updater = UpdaterModule.getInstance()
    updater.init(mainWindow)

    // 11. 启动本地 HTTP 服务（供 Chrome 插件调用）
    LocalHttpServer.getInstance().start()

    // 12. 二次激活时聚焦窗口
    app.on('second-instance', () => {
      system.showMainWindow()
    })

    // 13. macOS: dock 点击重新显示窗口
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        system.createMainWindow({ preloadPath })
      } else {
        system.showMainWindow()
      }
    })

    // 14. 退出清理
    app.on('before-quit', () => {
      app.isQuitting = true
    })
    app.on('will-quit', () => {
      LocalHttpServer.getInstance().stop()
      system.destroy()
      storage.close()
      logger.info('Startup', '基座已退出')
    })

    const elapsed = Date.now() - this.startTime
    logger.info('Startup', `基座启动完成，耗时: ${elapsed}ms`)

    // 生产环境：启动 5 秒后静默检查更新（失败不影响 UI）
    if (!isDev) {
      setTimeout(() => {
        updater.checkForUpdates(false).catch(() => {
          // 彻底吞掉，防止 unhandledRejection 导致白屏
        })
      }, 5000)
    }
  }

  /**
   * 加载渲染进程页面
   */
  private async loadApp(win: BrowserWindow, logger: Logger) {
    if (isDev) {
      // 开发模式：加载 Vite Dev Server
      const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
      await win.loadURL(devUrl)
      win.webContents.openDevTools()
      logger.info('Startup', `开发模式加载: ${devUrl}`)
    } else {
      // 生产模式：先尝试加载业务包，否则加载基座内置页
      const storage = StorageManager.getInstance()
      const activePackage = storage.getActivePackage()

      if (activePackage && fs.existsSync(path.join(activePackage.path, 'index.html'))) {
        const pkgIndexPath = path.join(activePackage.path, 'index.html')
        await win.loadFile(pkgIndexPath)
        logger.info('Startup', `已加载业务包: v${activePackage.version}`)
      } else {
        // 回退到基座内置静态页
        const fallbackPath = path.join(__dirname, '../../dist/index.html')
        await win.loadFile(fallbackPath)
        logger.info('Startup', '加载基座内置页面（尚无业务包）')
      }
    }
  }

  /**
   * 解析托盘图标路径（适配双系统）
   */
  private resolveTrayIcon(): string {
    const iconName = process.platform === 'darwin' ? 'tray-icon-mac.png' : 'tray-icon.ico'
    const candidates = [
      path.join(__dirname, '../../public', iconName),
      path.join(__dirname, '../../dist', iconName),
      path.join(app.getAppPath(), 'public', iconName)
    ]
    return candidates.find(p => fs.existsSync(p)) ?? candidates[0]
  }
}
