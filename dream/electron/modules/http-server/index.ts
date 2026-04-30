/**
 * 本地 HTTP 服务
 * 供 Chrome 插件等本地客户端调用，将数据写入 Dream 数据库
 * 监听 localhost:45678，仅接受本机请求
 */
import * as http from 'http'
import { randomUUID } from 'crypto'
import { StorageManager } from '../storage'
import { Logger } from '../logger'

const PORT = 45678

export class LocalHttpServer {
  private static instance: LocalHttpServer
  private server: http.Server | null = null

  private constructor() {}

  static getInstance(): LocalHttpServer {
    if (!LocalHttpServer.instance) {
      LocalHttpServer.instance = new LocalHttpServer()
    }
    return LocalHttpServer.instance
  }

  start() {
    const logger = Logger.getInstance()

    this.server = http.createServer((req, res) => {
      // 只接受本机请求
      const remoteAddr = req.socket.remoteAddress || ''
      if (remoteAddr !== '127.0.0.1' && remoteAddr !== '::1' && remoteAddr !== '::ffff:127.0.0.1') {
        res.writeHead(403)
        res.end(JSON.stringify({ error: 'Forbidden' }))
        return
      }

      // CORS 头（Chrome 扩展的 fetch 需要）
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

      // 预检请求
      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      // POST /favorite — 新增收藏
      if (req.method === 'POST' && req.url === '/favorite') {
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          try {
            const data = JSON.parse(body) as {
              type?: string
              title?: string
              url?: string
              content?: string
              author?: string
              tags?: string[]
            }

            if (!data.type) data.type = 'link'
            if (!data.url && data.type === 'link') {
              res.writeHead(400)
              res.end(JSON.stringify({ error: 'url is required for type=link' }))
              return
            }

            const db = StorageManager.getInstance().getDb()
            const id = randomUUID()
            const ts = Math.floor(Date.now() / 1000)

            // 检查是否已存在相同 URL（去重）
            if (data.url) {
              const existing = db.prepare('SELECT id FROM favorites WHERE url = ?').get(data.url)
              if (existing) {
                res.writeHead(200)
                res.end(JSON.stringify({ success: true, duplicate: true, id: (existing as { id: string }).id }))
                logger.info('HttpServer', `收藏已存在，跳过: ${data.url}`)
                return
              }
            }

            db.prepare(`
              INSERT INTO favorites (id, type, title, url, content, author, tags, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              id,
              data.type,
              data.title ?? '',
              data.url ?? '',
              data.content ?? '',
              data.author ?? '',
              JSON.stringify(data.tags ?? []),
              ts,
              ts
            )

            logger.info('HttpServer', `新增收藏: [${data.type}] ${data.title || data.url}`)
            res.writeHead(200)
            res.end(JSON.stringify({ success: true, id }))
          } catch (e) {
            logger.error('HttpServer', '处理 /favorite 请求失败', e)
            res.writeHead(500)
            res.end(JSON.stringify({ error: 'Internal error' }))
          }
        })
        return
      }

      // GET /ping — 心跳检测（插件可用来判断 Dream 是否运行）
      if (req.method === 'GET' && req.url === '/ping') {
        res.writeHead(200)
        res.end(JSON.stringify({ ok: true, app: 'Dream' }))
        return
      }

      res.writeHead(404)
      res.end(JSON.stringify({ error: 'Not found' }))
    })

    this.server.listen(PORT, '127.0.0.1', () => {
      logger.info('HttpServer', `本地 HTTP 服务已启动: http://127.0.0.1:${PORT}`)
    })

    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        logger.warn('HttpServer', `端口 ${PORT} 已被占用，本地 HTTP 服务启动失败`)
      } else {
        logger.error('HttpServer', '本地 HTTP 服务错误', err)
      }
    })
  }

  stop() {
    if (this.server) {
      this.server.close()
      this.server = null
    }
  }
}
