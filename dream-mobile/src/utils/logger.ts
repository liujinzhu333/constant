/**
 * Dream Mobile — 移动端日志模块
 *
 * 对标 PC 端 electron/modules/logger/index.ts
 * 三端适配：
 *   - APP-PLUS  → 写入沙盒文件（按天轮转，保留 30 天）
 *   - H5        → console（开发调试）
 *   - MP-WEIXIN → console（小程序无文件写权限）
 *
 * 日志格式：[YYYY-MM-DD HH:mm:ss] [LEVEL] [Module] message
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_RETAIN_DAYS = 30
const LOG_DIR = '_doc/logs/'  // App 端沙盒路径

function formatDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function formatTime(d = new Date()): string {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
}

function formatMsg(level: LogLevel, module: string, message: string): string {
  const d = new Date()
  return `[${formatDate(d)} ${formatTime(d)}] [${level.toUpperCase().padEnd(5)}] [${module.slice(0,32)}] ${String(message).slice(0, 2048)}\n`
}

// ==================== App 端实现 ====================
// #ifdef APP-PLUS
class AppLogger {
  private ensureDir(): void {
    try {
      const fs = plus.io.resolveLocalFileSystemURL('_doc/')
      // 目录存在则直接返回
    } catch {}
    try {
      plus.io.requestFileSystem(plus.io.PRIVATE_DOC, (fs) => {
        fs.root.getDirectory('logs', { create: true }, () => {}, () => {})
      }, () => {})
    } catch (e) {
      console.warn('[Logger] ensureDir failed', e)
    }
  }

  private write(text: string): void {
    const date = formatDate()
    const path = `_doc/logs/dream-${date}.log`
    try {
      // #ifdef APP-PLUS
      plus.io.resolveLocalFileSystemURL(path, (entry) => {
        entry.createWriter((writer) => {
          writer.seek(writer.length)
          writer.write(text)
        }, () => {})
      }, () => {
        // 文件不存在，新建
        plus.io.requestFileSystem(plus.io.PRIVATE_DOC, (rootFS) => {
          rootFS.root.getDirectory('logs', { create: true }, (logDir) => {
            logDir.getFile(`dream-${date}.log`, { create: true }, (fileEntry) => {
              fileEntry.createWriter((writer) => { writer.write(text) }, () => {})
            }, () => {})
          }, () => {})
        }, () => {})
      })
      // #endif
    } catch (e) {
      console.warn('[Logger] write failed', e)
    }
  }

  private cleanup(): void {
    // 从文件名提取日期，删除超过 30 天的日志（对标 PC 端修复 W-2）
    try {
      const cutoff = Date.now() - LOG_RETAIN_DAYS * 24 * 60 * 60 * 1000
      plus.io.resolveLocalFileSystemURL('_doc/logs/', (dirEntry: any) => {
        const reader = dirEntry.createReader()
        reader.readEntries((entries: any[]) => {
          entries.forEach((entry: any) => {
            const match = entry.name.match(/dream-(\d{4}-\d{2}-\d{2})\.log/)
            if (match) {
              const fileDate = new Date(match[1]).getTime()
              if (fileDate < cutoff) entry.remove(() => {}, () => {})
            }
          })
        }, () => {})
      }, () => {})
    } catch {}
  }

  log(level: LogLevel, module: string, message: string): void {
    const text = formatMsg(level, module, message)
    console[level === 'debug' ? 'log' : level](`[${module}] ${message}`)
    this.write(text)
  }

  async getFiles(): Promise<string[]> {
    return new Promise((resolve) => {
      const files: string[] = []
      plus.io.resolveLocalFileSystemURL('_doc/logs/', (dirEntry: any) => {
        const reader = dirEntry.createReader()
        reader.readEntries((entries: any[]) => {
          entries.filter((e: any) => e.name.endsWith('.log')).forEach((e: any) => files.push(e.name))
          resolve(files.sort().reverse())
        }, () => resolve([]))
      }, () => resolve([]))
    })
  }

  async readFile(filename: string): Promise<string> {
    return new Promise((resolve, reject) => {
      plus.io.resolveLocalFileSystemURL(`_doc/logs/${filename}`, (entry: any) => {
        entry.file((file: any) => {
          const reader = new plus.io.FileReader()
          reader.onloadend = (e: any) => resolve(e.target.result || '')
          reader.readAsText(file, 'utf-8')
        }, reject)
      }, reject)
    })
  }

  init(): void {
    this.ensureDir()
    this.cleanup()
  }
}

const _appLogger = new AppLogger()
// #endif

// ==================== 统一 Logger ====================
class Logger {
  init(): void {
    // #ifdef APP-PLUS
    _appLogger.init()
    // #endif
  }

  debug(module: string, message: string): void {
    // #ifdef APP-PLUS
    _appLogger.log('debug', module, message)
    // #endif
    // #ifndef APP-PLUS
    console.debug(`[${module}] ${message}`)
    // #endif
  }

  info(module: string, message: string): void {
    // #ifdef APP-PLUS
    _appLogger.log('info', module, message)
    // #endif
    // #ifndef APP-PLUS
    console.info(`[${module}] ${message}`)
    // #endif
  }

  warn(module: string, message: string): void {
    // #ifdef APP-PLUS
    _appLogger.log('warn', module, message)
    // #endif
    // #ifndef APP-PLUS
    console.warn(`[${module}] ${message}`)
    // #endif
  }

  error(module: string, message: string, err?: any): void {
    const full = err ? `${message} | ${String(err)}` : message
    // #ifdef APP-PLUS
    _appLogger.log('error', module, full)
    // #endif
    // #ifndef APP-PLUS
    console.error(`[${module}] ${full}`)
    // #endif
  }

  async getFiles(): Promise<string[]> {
    // #ifdef APP-PLUS
    return _appLogger.getFiles()
    // #endif
    // #ifndef APP-PLUS
    return []
    // #endif
  }

  async readFile(filename: string): Promise<string> {
    // #ifdef APP-PLUS
    return _appLogger.readFile(filename)
    // #endif
    // #ifndef APP-PLUS
    return ''
    // #endif
  }
}

export const logger = new Logger()
