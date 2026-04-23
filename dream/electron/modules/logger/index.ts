/**
 * 基座：日志模块
 * 负责PC端基座运行日志的记录、存储与管理
 * 按天轮转，保留30天
 */
import log from 'electron-log'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

export class Logger {
  private static instance: Logger
  private logDir: string

  private constructor() {
    this.logDir = path.join(app.getPath('userData'), 'logs')
    this.init()
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  private init() {
    // 确保日志目录存在
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }

    // 配置 electron-log
    log.transports.file.resolvePathFn = () => {
      const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
      return path.join(this.logDir, `dream-${today}.log`)
    }

    log.transports.file.level = 'info'
    log.transports.console.level = (process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === 'development') ? 'debug' : 'warn'

    // 格式化日志
    log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'

    // 启动时清理30天前的旧日志
    this.cleanOldLogs()

    this.info('Logger', '日志模块初始化完成', { logDir: this.logDir })
  }

  private cleanOldLogs() {
    try {
      const files = fs.readdirSync(this.logDir)
      const now = Date.now()
      const maxAge = 30 * 24 * 60 * 60 * 1000 // 30天

      files.forEach(file => {
        if (!file.startsWith('dream-') || !file.endsWith('.log')) return
        const filePath = path.join(this.logDir, file)
        const stat = fs.statSync(filePath)
        if (now - stat.mtimeMs > maxAge) {
          fs.unlinkSync(filePath)
          log.info(`[Logger] 已清理过期日志: ${file}`)
        }
      })
    } catch (err) {
      log.error('[Logger] 清理旧日志失败:', err)
    }
  }

  debug(module: string, message: string, data?: unknown) {
    log.debug(`[${module}] ${message}`, data ?? '')
  }

  info(module: string, message: string, data?: unknown) {
    log.info(`[${module}] ${message}`, data ?? '')
  }

  warn(module: string, message: string, data?: unknown) {
    log.warn(`[${module}] ${message}`, data ?? '')
  }

  error(module: string, message: string, error?: unknown) {
    log.error(`[${module}] ${message}`, error ?? '')
  }

  getLogDir(): string {
    return this.logDir
  }
}

export const logger = Logger.getInstance
