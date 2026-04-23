/**
 * 基座：系统适配模块
 * 适配PC端双系统（Windows、macOS）
 * 负责窗口、屏幕、快捷键、系统通知等适配
 * 保障PC端基座稳定运行，兼容不同系统操作习惯
 */
import {
  BrowserWindow,
  screen,
  globalShortcut,
  Notification,
  Tray,
  Menu,
  nativeImage,
  app,
  shell
} from 'electron'
import * as path from 'path'
import { Logger } from '../logger'

export interface WindowOptions {
  width?: number
  height?: number
  minWidth?: number
  minHeight?: number
  title?: string
  preloadPath?: string
}

export interface NotificationOptions {
  title: string
  body: string
  icon?: string
  silent?: boolean
  urgency?: 'normal' | 'critical' | 'low'
}

export class SystemAdapter {
  private static instance: SystemAdapter
  private logger!: Logger
  private mainWindow: BrowserWindow | null = null
  private tray: Tray | null = null
  private platform: NodeJS.Platform

  private constructor() {
    this.platform = process.platform
  }

  static getInstance(): SystemAdapter {
    if (!SystemAdapter.instance) {
      SystemAdapter.instance = new SystemAdapter()
    }
    return SystemAdapter.instance
  }

  init(logger: Logger) {
    this.logger = logger
    this.logger.info('System', `系统适配模块初始化，平台: ${this.platform}`)
  }

  // ==================== 窗口管理 ====================

  createMainWindow(options: WindowOptions = {}): BrowserWindow {
    const { width = 1200, height = 800, minWidth = 900, minHeight = 600 } = options

    // 获取主显示器尺寸，居中显示
    const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize
    const x = Math.round((screenW - width) / 2)
    const y = Math.round((screenH - height) / 2)

    const win = new BrowserWindow({
      x,
      y,
      width,
      height,
      minWidth,
      minHeight,
      title: options.title || 'Dream',
      // macOS 原生风格
      titleBarStyle: this.platform === 'darwin' ? 'hiddenInset' : 'default',
      trafficLightPosition: { x: 16, y: 16 },
      // 毛玻璃效果（macOS）
      vibrancy: this.platform === 'darwin' ? 'under-window' : undefined,
      visualEffectState: this.platform === 'darwin' ? 'followWindow' : undefined,
      backgroundColor: '#00000000',
      transparent: this.platform === 'darwin',
      webPreferences: {
        preload: options.preloadPath || path.join(__dirname, '../../preload/index.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false
      },
      show: false // 等待 ready-to-show 再显示，避免白屏
    })

    // 就绪后显示，防止白屏
    win.once('ready-to-show', () => {
      win.show()
      this.logger.info('System', '主窗口已显示')
    })

    // 关闭按钮行为：最小化到托盘而非退出
    win.on('close', (event) => {
      if (!app.isQuitting) {
        event.preventDefault()
        win.hide()
        this.logger.info('System', '主窗口已最小化到托盘')
      }
    })

    this.mainWindow = win
    this.logger.info('System', '主窗口创建完成', { width, height })
    return win
  }

  // ==================== 系统托盘 ====================

  createTray(iconPath: string) {
    try {
      const icon = nativeImage.createFromPath(iconPath)
      this.tray = new Tray(this.platform === 'darwin' ? icon.resize({ width: 18, height: 18 }) : icon)
      this.tray.setToolTip('Dream - 个人助手')

      const contextMenu = Menu.buildFromTemplate([
        {
          label: '打开 Dream',
          click: () => this.showMainWindow()
        },
        { type: 'separator' },
        {
          label: '检查更新',
          click: () => this.mainWindow?.webContents.send('updater:check-request')
        },
        { type: 'separator' },
        {
          label: '退出',
          click: () => {
            app.isQuitting = true
            app.quit()
          }
        }
      ])

      this.tray.setContextMenu(contextMenu)
      this.tray.on('click', () => this.showMainWindow())

      this.logger.info('System', '系统托盘创建完成')
    } catch (err) {
      this.logger.warn('System', '创建托盘失败（可能图标文件不存在）', err)
    }
  }

  showMainWindow() {
    if (this.mainWindow) {
      this.mainWindow.show()
      this.mainWindow.focus()
    }
  }

  // ==================== 全局快捷键 ====================

  registerShortcuts() {
    // 唤醒/隐藏主窗口
    const toggleShortcut = this.platform === 'darwin' ? 'Command+Shift+D' : 'Ctrl+Shift+D'
    const registered = globalShortcut.register(toggleShortcut, () => {
      if (this.mainWindow?.isVisible()) {
        this.mainWindow.hide()
      } else {
        this.showMainWindow()
      }
    })

    if (registered) {
      this.logger.info('System', `全局快捷键已注册: ${toggleShortcut}`)
    } else {
      this.logger.warn('System', `全局快捷键注册失败: ${toggleShortcut}`)
    }
  }

  unregisterShortcuts() {
    globalShortcut.unregisterAll()
    this.logger.info('System', '全局快捷键已全部注销')
  }

  // ==================== 系统通知 ====================

  sendNotification(options: NotificationOptions) {
    if (!Notification.isSupported()) {
      this.logger.warn('System', '当前系统不支持通知')
      return
    }

    const notification = new Notification({
      title: options.title,
      body: options.body,
      silent: options.silent ?? false,
      // macOS 额外配置
      ...(this.platform === 'darwin' && {
        subtitle: 'Dream',
        urgency: options.urgency ?? 'normal'
      })
    })

    notification.on('click', () => {
      this.showMainWindow()
    })

    notification.show()
    this.logger.debug('System', '系统通知已发送', { title: options.title })
  }

  // ==================== 工具 ====================

  openInBrowser(url: string) {
    shell.openExternal(url)
  }

  getPlatform(): NodeJS.Platform {
    return this.platform
  }

  isMac(): boolean {
    return this.platform === 'darwin'
  }

  isWindows(): boolean {
    return this.platform === 'win32'
  }

  destroy() {
    this.tray?.destroy()
    this.unregisterShortcuts()
  }
}
