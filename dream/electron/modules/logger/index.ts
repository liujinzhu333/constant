/**
 * 基座：日志模块
 * 负责PC端基座运行日志的记录、存储与管理
 * 按天轮转，保留30天
 */
import log from 'electron-log'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

export interface LogFileInfo {
  name: string        // 文件名，如 dream-2026-04-29.log
  date: string        // 日期字符串，如 2026-04-29
  size: number        // 字节数
  isToday: boolean
}

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
    fs.mkdirSync(this.logDir, { recursive: true })

    // 配置 electron-log
    log.transports.file.resolvePathFn = () => {
      const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
      return path.join(this.logDir, `dream-${today}.log`)
    }

    log.transports.file.level = 'info'
    log.transports.console.level = (process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === 'development') ? 'debug' : 'warn'

    // 格式化日志
    log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'

    // 启动时自动清理 30 天前的旧日志
    this.cleanOldLogs(30)

    this.info('Logger', '日志模块初始化完成', { logDir: this.logDir })
  }

  // ==================== 自动清理（按日期判断） ====================

  private cleanOldLogs(keepDays: number) {
    try {
      const files = fs.readdirSync(this.logDir)
      const now = Date.now()
      const maxAge = keepDays * 24 * 60 * 60 * 1000

      files.forEach(file => {
        if (!file.startsWith('dream-') || !file.endsWith('.log')) return
        // 从文件名提取日期，避免 mtimeMs 因追加写入而永远更新
        const dateStr = file.replace('dream-', '').replace('.log', '') // YYYY-MM-DD
        const fileDate = new Date(dateStr).getTime()
        if (!isNaN(fileDate) && now - fileDate > maxAge) {
          fs.unlinkSync(path.join(this.logDir, file))
          log.info(`[Logger] 已清理过期日志: ${file}`)
        }
      })
    } catch (err) {
      log.error('[Logger] 清理旧日志失败:', err)
    }
  }

  // ==================== 读取接口（供 IPC 调用） ====================

  /**
   * 获取所有日志文件列表，按日期倒序
   */
  getLogFiles(): LogFileInfo[] {
    try {
      const today = new Date().toISOString().slice(0, 10)
      return fs.readdirSync(this.logDir)
        .filter(f => f.startsWith('dream-') && f.endsWith('.log'))
        .map(f => {
          const filePath = path.join(this.logDir, f)
          const date = f.replace('dream-', '').replace('.log', '')
          const size = fs.statSync(filePath).size
          return { name: f, date, size, isToday: date === today }
        })
        .sort((a, b) => b.date.localeCompare(a.date))
    } catch {
      return []
    }
  }

  /**
   * 读取指定日志文件内容
   * @param filename  文件名（如 dream-2026-04-29.log）
   * @param maxLines  最多返回末尾 N 行，默认 500
   */
  readLogFile(filename: string, maxLines = 500): { lines: string[]; total: number } {
    // 安全校验：只允许读取 dream-YYYY-MM-DD.log 格式的文件
    if (!/^dream-\d{4}-\d{2}-\d{2}\.log$/.test(filename)) {
      return { lines: [], total: 0 }
    }
    const filePath = path.join(this.logDir, filename)
    if (!fs.existsSync(filePath)) return { lines: [], total: 0 }

    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const all = content.split('\n').filter(l => l.trim())
      const total = all.length
      const lines = total > maxLines ? all.slice(total - maxLines) : all
      return { lines, total }
    } catch {
      return { lines: [], total: 0 }
    }
  }

  /**
   * 删除指定日志文件（不允许删除今天的日志）
   */
  deleteLogFile(filename: string): { success: boolean; error?: string } {
    if (!/^dream-\d{4}-\d{2}-\d{2}\.log$/.test(filename)) {
      return { success: false, error: '非法文件名' }
    }
    const today = new Date().toISOString().slice(0, 10)
    const date = filename.replace('dream-', '').replace('.log', '')
    if (date === today) {
      return { success: false, error: '不能删除今天的日志' }
    }
    const filePath = path.join(this.logDir, filename)
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' }
    }
    try {
      fs.unlinkSync(filePath)
      this.info('Logger', `手动删除日志文件: ${filename}`)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }

  /**
   * 删除所有历史日志（保留今天）
   */
  clearAllLogs(): { success: boolean; deleted: number; error?: string } {
    const today = new Date().toISOString().slice(0, 10)
    let deleted = 0
    try {
      const files = fs.readdirSync(this.logDir)
        .filter(f => f.startsWith('dream-') && f.endsWith('.log'))
      for (const file of files) {
        const date = file.replace('dream-', '').replace('.log', '')
        if (date === today) continue
        fs.unlinkSync(path.join(this.logDir, file))
        deleted++
      }
      this.info('Logger', `手动清理日志完成，共删除 ${deleted} 个文件`)
      return { success: true, deleted }
    } catch (err) {
      return { success: false, deleted, error: (err as Error).message }
    }
  }

  // ==================== 日志写入 ====================

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
