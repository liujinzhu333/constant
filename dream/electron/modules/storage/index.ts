/**
 * 基座：本地存储基础模块
 * 负责PC端SQLite3数据库初始化、存储路径管理、权限控制
 * 支持本地数据 AES-256 加密存储
 * 适配 Windows 与 macOS 存储路径规范
 */
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import Database from 'better-sqlite3'
import CryptoJS from 'crypto-js'

export interface StorageOptions {
  encryptionKey?: string
}

export class StorageManager {
  private static instance: StorageManager
  private db: Database.Database | null = null
  private dbPath: string
  private userDataPath: string
  private encryptionKey: string

  private constructor(options: StorageOptions = {}) {
    this.userDataPath = app.getPath('userData')
    this.dbPath = path.join(this.userDataPath, 'dream.db')
    // 加密密钥：实际生产应从安全渠道获取，此处用固定值作为基础
    this.encryptionKey = options.encryptionKey || this.getOrCreateEncryptionKey()
    this.ensureDirectories()
    this.initDatabase()
  }

  static getInstance(options?: StorageOptions): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager(options)
    }
    return StorageManager.instance
  }

  /**
   * 获取或创建加密密钥（存储在 userData 目录下的隐藏文件）
   */
  private getOrCreateEncryptionKey(): string {
    const keyFile = path.join(this.userDataPath, '.dream_key')
    if (fs.existsSync(keyFile)) {
      return fs.readFileSync(keyFile, 'utf-8').trim()
    }
    // 生成随机密钥
    const key = CryptoJS.lib.WordArray.random(32).toString()
    fs.writeFileSync(keyFile, key, { mode: 0o600 }) // 仅所有者可读
    return key
  }

  /**
   * 确保必要目录存在
   */
  private ensureDirectories() {
    const dirs = [
      this.userDataPath,
      path.join(this.userDataPath, 'backups'),
      path.join(this.userDataPath, 'business-packages'),
      path.join(this.userDataPath, 'assets')
    ]
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    })
  }

  /**
   * 初始化数据库，创建基座所需的基础表
   */
  private initDatabase() {
    try {
      this.db = new Database(this.dbPath)

      // 开启 WAL 模式，提升并发读取性能
      this.db.pragma('journal_mode = WAL')
      this.db.pragma('foreign_keys = ON')

      // 创建基座基础表
      this.db.exec(`
        -- 基座元数据表
        CREATE TABLE IF NOT EXISTS base_meta (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        );

        -- 业务包版本记录表
        CREATE TABLE IF NOT EXISTS business_packages (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          version    TEXT NOT NULL UNIQUE,
          status     TEXT NOT NULL DEFAULT 'inactive', -- active | inactive | rollback
          path       TEXT NOT NULL,
          checksum   TEXT NOT NULL,
          installed_at INTEGER DEFAULT (strftime('%s', 'now')),
          notes      TEXT
        );

        -- 更新日志表
        CREATE TABLE IF NOT EXISTS update_logs (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          from_ver    TEXT,
          to_ver      TEXT NOT NULL,
          status      TEXT NOT NULL, -- success | failed | rollback
          message     TEXT,
          created_at  INTEGER DEFAULT (strftime('%s', 'now'))
        );

        -- 加密存储表（业务包数据加密存储）
        CREATE TABLE IF NOT EXISTS encrypted_store (
          namespace TEXT NOT NULL,
          key       TEXT NOT NULL,
          value     TEXT NOT NULL,
          updated_at INTEGER DEFAULT (strftime('%s', 'now')),
          PRIMARY KEY (namespace, key)
        );

        -- ===================== 业务包：待办任务 =====================
        CREATE TABLE IF NOT EXISTS todos (
          id          TEXT PRIMARY KEY,
          title       TEXT NOT NULL,
          note        TEXT DEFAULT '',
          status      TEXT NOT NULL DEFAULT 'todo', -- todo | done
          priority    INTEGER NOT NULL DEFAULT 2,   -- 1高 2中 3低
          due_at      INTEGER,
          remind_at   INTEGER,
          tags        TEXT DEFAULT '[]',
          created_at  INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at  INTEGER DEFAULT (strftime('%s', 'now')),
          done_at     INTEGER
        );

        -- ===================== 业务包：计划 =====================
        CREATE TABLE IF NOT EXISTS study_plans (
          id          TEXT PRIMARY KEY,
          title       TEXT NOT NULL,
          description TEXT DEFAULT '',
          goal        TEXT DEFAULT '',
          category    TEXT NOT NULL DEFAULT 'study', -- study|work|life|fitness|finance
          status      TEXT NOT NULL DEFAULT 'active', -- active | paused | done
          start_date  INTEGER,
          end_date    INTEGER,
          progress    INTEGER DEFAULT 0,
          color       TEXT DEFAULT '#0071e3',
          created_at  INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at  INTEGER DEFAULT (strftime('%s', 'now'))
        );

        CREATE TABLE IF NOT EXISTS study_tasks (
          id          TEXT PRIMARY KEY,
          plan_id     TEXT NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,
          title       TEXT NOT NULL,
          status      TEXT NOT NULL DEFAULT 'todo', -- todo | done
          due_at      INTEGER,
          sort_order  INTEGER DEFAULT 0,
          created_at  INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at  INTEGER DEFAULT (strftime('%s', 'now'))
        );

        -- ===================== 业务包：笔记 =====================
        CREATE TABLE IF NOT EXISTS notes (
          id          TEXT PRIMARY KEY,
          title       TEXT NOT NULL DEFAULT '无标题',
          content     TEXT DEFAULT '',
          tags        TEXT DEFAULT '[]',
          is_pinned   INTEGER DEFAULT 0,
          created_at  INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at  INTEGER DEFAULT (strftime('%s', 'now'))
        );

        -- ===================== 业务包：日程 =====================
        CREATE TABLE IF NOT EXISTS schedules (
          id          TEXT PRIMARY KEY,
          title       TEXT NOT NULL,
          note        TEXT DEFAULT '',
          start_at    INTEGER NOT NULL,
          end_at      INTEGER NOT NULL,
          all_day     INTEGER DEFAULT 0,
          color       TEXT DEFAULT '#0071e3',
          remind_at   INTEGER,
          repeat_rule TEXT DEFAULT '',
          created_at  INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at  INTEGER DEFAULT (strftime('%s', 'now'))
        );

        -- ===================== 业务包：提醒 =====================
        CREATE TABLE IF NOT EXISTS reminders (
          id          TEXT PRIMARY KEY,
          source_type TEXT NOT NULL, -- todo | study | schedule | custom
          source_id   TEXT,
          title       TEXT NOT NULL,
          body        TEXT DEFAULT '',
          remind_at   INTEGER NOT NULL,
          status      TEXT NOT NULL DEFAULT 'pending', -- pending | sent | snoozed | dismissed
          created_at  INTEGER DEFAULT (strftime('%s', 'now'))
        );

        -- ===================== 业务包：账号管理 =====================
        CREATE TABLE IF NOT EXISTS accounts (
          id           TEXT PRIMARY KEY,
          platform     TEXT NOT NULL DEFAULT '',   -- 平台名称（如 GitHub）
          platform_url TEXT NOT NULL DEFAULT '',   -- 平台链接
          account_name TEXT NOT NULL DEFAULT '',   -- 账号名称
          phone        TEXT NOT NULL DEFAULT '',   -- 手机号（明文）
          email        TEXT NOT NULL DEFAULT '',   -- 邮箱（明文）
          password_enc TEXT NOT NULL DEFAULT '',   -- 密码密文（AES-256，密钥由用户持有）
          note         TEXT NOT NULL DEFAULT '',   -- 备注
          category     TEXT NOT NULL DEFAULT 'other', -- 平台分类
          created_at   INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at   INTEGER DEFAULT (strftime('%s', 'now'))
        );
      `)

      // 数据迁移：兼容旧数据库
      const cols = (this.db!.prepare("PRAGMA table_info(study_plans)").all() as Array<{ name: string }>).map(c => c.name)
      if (!cols.includes('category')) {
        this.db!.exec("ALTER TABLE study_plans ADD COLUMN category TEXT NOT NULL DEFAULT 'study'")
      }
      // 子计划支持：parent_id 为空表示顶层计划
      if (!cols.includes('parent_id')) {
        this.db!.exec("ALTER TABLE study_plans ADD COLUMN parent_id TEXT REFERENCES study_plans(id) ON DELETE CASCADE")
      }

      // 数据迁移：accounts 表新增 category 字段
      const accountCols = (this.db!.prepare("PRAGMA table_info(accounts)").all() as Array<{ name: string }>).map(c => c.name)
      if (!accountCols.includes('category')) {
        this.db!.exec("ALTER TABLE accounts ADD COLUMN category TEXT NOT NULL DEFAULT 'other'")
      }

      // 记录基座版本
      this.setMeta('base_version', '1.0.0')
      this.setMeta('initialized_at', String(Date.now()))

    } catch (err) {
      console.error('[Storage] 数据库初始化失败:', err)
      throw err
    }
  }

  // ==================== 元数据操作 ====================

  setMeta(key: string, value: string) {
    this.db!.prepare(`
      INSERT INTO base_meta (key, value, updated_at)
      VALUES (?, ?, strftime('%s', 'now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value)
  }

  getMeta(key: string): string | null {
    const row = this.db!.prepare('SELECT value FROM base_meta WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? null
  }

  // ==================== 加密存储 ====================

  /**
   * 加密写入（AES-256）
   */
  encryptedSet(namespace: string, key: string, value: unknown) {
    const plaintext = JSON.stringify(value)
    const encrypted = CryptoJS.AES.encrypt(plaintext, this.encryptionKey).toString()
    this.db!.prepare(`
      INSERT INTO encrypted_store (namespace, key, value, updated_at)
      VALUES (?, ?, ?, strftime('%s', 'now'))
      ON CONFLICT(namespace, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(namespace, key, encrypted)
  }

  /**
   * 解密读取
   */
  encryptedGet<T = unknown>(namespace: string, key: string): T | null {
    const row = this.db!.prepare('SELECT value FROM encrypted_store WHERE namespace = ? AND key = ?').get(namespace, key) as { value: string } | undefined
    if (!row) return null
    try {
      const bytes = CryptoJS.AES.decrypt(row.value, this.encryptionKey)
      return JSON.parse(bytes.toString(CryptoJS.enc.Utf8)) as T
    } catch {
      return null
    }
  }

  encryptedDelete(namespace: string, key: string) {
    this.db!.prepare('DELETE FROM encrypted_store WHERE namespace = ? AND key = ?').run(namespace, key)
  }

  // ==================== 业务包记录 ====================

  registerPackage(version: string, pkgPath: string, checksum: string, notes?: string) {
    this.db!.prepare(`
      INSERT INTO business_packages (version, status, path, checksum, notes)
      VALUES (?, 'inactive', ?, ?, ?)
      ON CONFLICT(version) DO UPDATE SET path = excluded.path, checksum = excluded.checksum
    `).run(version, pkgPath, checksum, notes ?? null)
  }

  activatePackage(version: string) {
    this.db!.transaction(() => {
      this.db!.prepare("UPDATE business_packages SET status = 'inactive' WHERE status = 'active'").run()
      this.db!.prepare("UPDATE business_packages SET status = 'active' WHERE version = ?").run(version)
    })()
  }

  getActivePackage(): { version: string; path: string; checksum: string } | null {
    return this.db!.prepare("SELECT version, path, checksum FROM business_packages WHERE status = 'active' LIMIT 1").get() as { version: string; path: string; checksum: string } | null
  }

  // ==================== 备份 ====================

  backup(): string {
    const backupPath = path.join(
      this.userDataPath,
      'backups',
      `dream-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.db`
    )
    this.db!.backup(backupPath)
    return backupPath
  }

  /**
   * 列出所有历史备份文件（按时间降序）
   */
  listBackups(): Array<{ name: string; path: string; size: number; createdAt: number }> {
    const backupDir = path.join(this.userDataPath, 'backups')
    if (!fs.existsSync(backupDir)) return []
    return fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.db'))
      .map(f => {
        const fullPath = path.join(backupDir, f)
        const stat = fs.statSync(fullPath)
        return { name: f, path: fullPath, size: stat.size, createdAt: stat.birthtimeMs }
      })
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  /**
   * 删除指定备份文件
   */
  deleteBackup(backupPath: string): void {
    // 安全检查：只允许删除 backups 目录内的文件
    const backupDir = path.join(this.userDataPath, 'backups')
    if (!backupPath.startsWith(backupDir)) throw new Error('非法路径')
    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath)
  }

  /**
   * 从内部历史备份恢复数据库
   * 先关闭当前连接，覆盖 db 文件，再重新连接并迁移
   */
  restoreBackup(backupPath: string): void {
    // 安全检查：只允许从 backups 目录恢复
    const backupDir = path.join(this.userDataPath, 'backups')
    if (!backupPath.startsWith(backupDir)) throw new Error('非法路径')
    if (!fs.existsSync(backupPath)) throw new Error('备份文件不存在')

    // 先备份当前数据库（防止恢复失败造成数据丢失）
    const safetyPath = path.join(backupDir, `pre-restore-${Date.now()}.db`)
    this.db!.backup(safetyPath)

    // 关闭当前连接
    this.db!.close()
    this.db = null

    // 覆盖主数据库文件
    fs.copyFileSync(backupPath, this.dbPath)

    // 重新初始化（含迁移守卫）
    this.initDatabase()
  }

  /**
   * 导入外部备份文件（用户通过文件选择器选择任意 .db）
   */
  importBackup(srcPath: string): void {
    if (!fs.existsSync(srcPath)) throw new Error('文件不存在')

    // 验证是否为有效的 SQLite 文件（读取魔数）
    const magic = Buffer.alloc(16)
    const fd = fs.openSync(srcPath, 'r')
    fs.readSync(fd, magic, 0, 16, 0)
    fs.closeSync(fd)
    if (magic.toString('utf8', 0, 16) !== 'SQLite format 3\u0000') {
      throw new Error('不是有效的 SQLite 数据库文件')
    }

    // 先做安全备份
    const backupDir = path.join(this.userDataPath, 'backups')
    const safetyPath = path.join(backupDir, `pre-import-${Date.now()}.db`)
    this.db!.backup(safetyPath)

    this.db!.close()
    this.db = null

    fs.copyFileSync(srcPath, this.dbPath)
    this.initDatabase()
  }

  // ==================== 工具 ====================

  getDb(): Database.Database {
    return this.db!
  }

  getUserDataPath(): string {
    return this.userDataPath
  }

  close() {
    this.db?.close()
  }
}
