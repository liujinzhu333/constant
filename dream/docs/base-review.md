# Dream 基座代码 Review 报告

> 日期：2026-04-29  
> 范围：`electron/` 目录下所有基座模块  
> 状态：个人使用阶段，问题已记录，待后续迭代修复

---

## 汇总

| 级别 | 数量 |
|------|------|
| 🔴 严重 | 7 |
| 🟡 警告 | 12 |
| 🔵 建议 | 4 |

**优先修复顺序**（供后续参考）：
1. `business/index.ts` update handler 加字段白名单（SQL 注入）
2. `business/index.ts` 所有 handler 加统一 try/catch
3. `system:log` IPC 加 level 白名单 + 长度截断
4. `backup()` 加 await
5. `activate` 事件修复空窗口
6. N+1 查询优化
7. 日志清理逻辑修复

---

## 🔴 严重问题

### S-1｜SQL 注入风险

- **文件**：`electron/modules/business/index.ts`
- **行号**：62–65、114–121、195–200、231–236
- **涉及 handler**：`todo:update`、`study:planUpdate`、`note:update`、`schedule:update`

**问题**：四处 update handler 使用 `Object.keys(data)` 直接拼接 SQL 字段名，无白名单校验。虽然当前为个人使用风险低，但一旦扩展多用户场景，攻击者可通过精心构造的字段名执行任意 SQL。

```ts
// 当前写法（有风险）
const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
this.db.prepare(`UPDATE todos SET ${fields} ...`).run(...)
```

**修复方案**：
```ts
const TODO_UPDATABLE_FIELDS = new Set(['title', 'note', 'priority', 'due_at', 'remind_at', 'tags', 'status'])
const safeData = Object.fromEntries(
  Object.entries(data).filter(([k]) => TODO_UPDATABLE_FIELDS.has(k))
)
```

---

### S-2｜所有业务 IPC handler 无错误处理

- **文件**：`electron/modules/business/index.ts`
- **行号**：全文（37–297）

**问题**：`business/index.ts` 中所有 `ipcMain.handle` 回调均直接操作数据库，没有 try/catch。`better-sqlite3` 是同步 API，数据库异常（磁盘满、文件损坏、参数类型错误）会直接抛出，可能导致主进程崩溃。对比 `ipc/index.ts` 中的 handler 均有 try/catch，`business/index.ts` 是明显遗漏。

**修复方案**：封装统一的 `safeHandle` 工具函数包裹所有 handler：
```ts
function safeHandle(channel: string, handler: (...args: unknown[]) => unknown, logger: Logger) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await handler(...args)
    } catch (err) {
      logger.error('Business', `${channel} 处理失败`, err)
      throw err
    }
  })
}
```

---

### S-3｜`system:log` IPC 无输入校验，可被原型链污染及日志注入

- **文件**：`electron/modules/ipc/index.ts`
- **行号**：139–141

**问题**：`level` 参数直接用于索引对象属性（`this.logger[level]`），TypeScript 类型在运行时不存在保护。传入 `__proto__`、`constructor` 等特殊值可造成原型链污染；`message` 无长度限制，可写入超长内容打满磁盘。

```ts
// 当前写法（有风险）
ipcMain.handle('system:log', (_event, level, module, message) => {
  this.logger[level](module, `[Renderer] ${message}`)
})
```

**修复方案**：
```ts
const VALID_LEVELS = new Set(['debug', 'info', 'warn', 'error'])
ipcMain.handle('system:log', (_event, level: string, module: string, message: string) => {
  if (!VALID_LEVELS.has(level)) return
  this.logger[level as 'debug'](String(module).slice(0, 64), `[Renderer] ${String(message).slice(0, 2048)}`)
})
```

---

### S-4｜`app:getPath` 暴露所有系统路径

- **文件**：`electron/modules/ipc/index.ts`
- **行号**：41–43

**问题**：渲染进程可通过 `window.dreamAPI.app.getPath('home')` 等枚举用户所有敏感系统路径（家目录、桌面、文档等），扩大潜在攻击面。

**修复方案**：
```ts
const ALLOWED_PATHS = new Set(['userData', 'logs', 'downloads'])
ipcMain.handle('app:getPath', (_event, name: string) => {
  if (!ALLOWED_PATHS.has(name)) return null
  return app.getPath(name as Parameters<typeof app.getPath>[0])
})
```

---

### S-5｜`backup()` 未 await，备份文件可能不完整

- **文件**：`electron/modules/storage/index.ts`
- **行号**：293–300

**问题**：`better-sqlite3` 的 `Database.backup()` 返回 Promise，当前代码直接 `return backupPath` 不等待完成。调用方拿到路径时文件可能仍在写入或未创建，备份文件不完整。

```ts
// 当前写法（有 bug）
backup(): string {
  this.db!.backup(backupPath)  // 返回 Promise，但未 await
  return backupPath
}
```

**修复方案**：
```ts
async backup(): Promise<string> {
  await this.db!.backup(backupPath)
  return backupPath
}
```

---

### S-6｜macOS `activate` 事件创建的是空白窗口

- **文件**：`electron/modules/startup/index.ts`
- **行号**：91–96

**问题**：macOS 点击 Dock 图标时，若所有窗口都已关闭，触发 `activate` 事件会调用 `createMainWindow()` 但不调用 `loadApp()`，用户看到空白窗口。

```ts
// 当前写法（有 bug）
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    system.createMainWindow({ preloadPath })  // 只创建，未加载页面
  }
})
```

**修复方案**：提取 `createAndLoadWindow()` 私有方法，`activate` 时调用完整的创建+加载流程。

---

### S-7｜N+1 查询问题

- **文件**：`electron/modules/business/index.ts`
- **行号**：93–99、109–118（`study:planList`、`study:subPlanList`）

**问题**：每个计划执行 3 次独立 COUNT 查询（taskCount、doneCount、subPlanCount），100 个计划 = 300 次 SQL，且不在同一事务内，存在数据不一致风险。

**修复方案**：改用 JOIN + GROUP BY 一次查询：
```sql
SELECT p.*,
  COUNT(t.id) as taskCount,
  SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as doneCount,
  (SELECT COUNT(*) FROM study_plans sp WHERE sp.parent_id = p.id) as subPlanCount
FROM study_plans p
LEFT JOIN study_tasks t ON t.plan_id = p.id
WHERE p.parent_id IS NULL
GROUP BY p.id
ORDER BY p.created_at DESC
```

---

## 🟡 警告

### W-1｜加密密钥明文存储，Windows 下无权限保护

- **文件**：`electron/modules/storage/index.ts:43–51`
- **问题**：密钥以明文写入 `userData/.dream_key`，`mode: 0o600` 在 Windows（NTFS）无效，任何可读 `%APPDATA%` 的进程均可获取密钥。
- **修复**：macOS 用 Keychain、Windows 用 DPAPI（`keytar` 库）。

---

### W-2｜日志清理逻辑错误，日志永不被清理

- **文件**：`electron/modules/logger/index.ts:60–62`
- **问题**：用 `mtimeMs`（文件最后修改时间）判断是否过期，而日志文件每次追加写入都会更新 `mtimeMs`，导致日志文件永远不会被清理。
- **修复**：从文件名（`dream-YYYY-MM-DD.log`）中提取日期字符串与当前日期对比。

---

### W-3｜版本比较用字符串 `!==`，可能误触降级

- **文件**：`electron/modules/updater/index.ts:140–144`
- **问题**：`result.updateInfo.version !== autoUpdater.currentVersion.version` 是字符串比较，配合 `allowDowngrade: true`，旧版本也会被识别为"有更新"。
- **修复**：使用 `semver` 库进行语义化版本比较。

---

### W-4｜`updater:rollback` handler 注册位置与其他 updater handler 分离

- **文件**：`electron/modules/ipc/index.ts:147–149`；`electron/modules/updater/index.ts:112–132`
- **问题**：`updater:check`/`download`/`install`/`getStatus` 在 `UpdaterModule.registerIPC()` 注册，`updater:rollback` 却在 `IpcManager.registerSystemHandlers()` 注册，职责割裂。
- **修复**：将 `updater:rollback` 迁移到 `UpdaterModule.registerIPC()` 中。

---

### W-5｜`@ts-ignore` 绕过私有属性访问

- **文件**：`electron/modules/ipc/index.ts:63–65`
- **问题**：`app:minimize` handler 通过 `@ts-ignore` 强行访问 `SystemAdapter` 的私有 `mainWindow` 属性，是反模式。
- **修复**：给 `SystemAdapter` 添加公开的 `minimize()` 方法。

---

### W-6｜`logger` 导出缺少调用括号，导出的是函数而非实例

- **文件**：`electron/modules/logger/index.ts:92`
- **问题**：`export const logger = Logger.getInstance` 少了 `()`，导出的是方法引用（函数），而非 Logger 实例。虽然各模块目前都直接调用 `Logger.getInstance()`，这个导出是无效的。
- **修复**：`export const logger = Logger.getInstance()`

---

### W-7｜版本号硬编码，不随 package.json 更新

- **文件**：`electron/modules/startup/index.ts:48`
- **问题**：日志中打印 `版本: 1.0.0` 为硬编码字符串，版本升级后日志仍显示旧版本。
- **修复**：改为 `app.getVersion()`。

---

### W-8｜IPC 注册时机早于模块初始化，存在竞态隐患

- **文件**：`electron/main/index.ts:22`
- **问题**：`IpcManager.register()` 在 `bootstrap()` 之前执行，此时 `Logger`/`StorageManager` 等均未初始化，内部调用 `app.getPath()` 在 `app.isReady` 前可能不稳定。
- **修复**：将 IPC 注册移入 `bootstrap()` 内 `app.whenReady()` 之后。

---

### W-9｜`openExternal` URL 校验可被任意 HTTPS 域名绕过

- **文件**：`electron/modules/ipc/index.ts:45–52`
- **问题**：仅校验 `startsWith('https://')` 无法防止打开恶意 HTTPS 页面，无长度限制。
- **修复**：维护允许域名白名单，或用 `URL` 对象解析后校验 hostname。

---

### W-10｜`store:set` 无 namespace/key 长度限制

- **文件**：`electron/modules/ipc/index.ts:78–86`
- **问题**：渲染进程可传入超长字符串持续写入加密存储，导致数据库膨胀。
- **修复**：对 namespace/key 加长度截断（如各 128 字符上限）。

---

### W-11｜`resolveTrayIcon` 找不到图标时静默返回不存在路径

- **文件**：`electron/modules/startup/index.ts:156`
- **问题**：所有候选路径都不存在时，返回 `candidates[0]`（不存在的路径），托盘图标显示为空，问题被静默吞掉。
- **修复**：找不到时记录 error 日志，并提供内置默认图标兜底。

---

### W-12｜`reminder:snooze` 未校验时间是否为未来

- **文件**：`electron/modules/business/index.ts:288–290`
- **问题**：传入过去的时间戳会导致提醒立即触发，逻辑上不合理。
- **修复**：校验 `newRemindAt > now()`，否则返回错误。

---

## 🔵 建议

### B-1｜Statement 每次调用重新 prepare，未复用

- **文件**：`electron/modules/business/index.ts`（全文）
- **问题**：`better-sqlite3` 的 Statement 可复用，当前每次 IPC 调用都重新 `prepare()`，高频调用（如笔记保存防抖）有额外开销。
- **修复**：在 `register()` 时预编译常用 Statement 缓存为类属性。

---

### B-2｜`ensureDirectories` 中 `existsSync` 检查冗余

- **文件**：`electron/modules/storage/index.ts:64–68`
- **问题**：`fs.mkdirSync(dir, { recursive: true })` 已具有幂等性（目录存在时不报错），`existsSync` 检查是多余的，且存在 TOCTOU 竞态。
- **修复**：直接调用 `fs.mkdirSync(dir, { recursive: true })`，去掉 `existsSync` 判断。

---

### B-3｜笔记全文搜索无法利用索引

- **文件**：`electron/modules/business/index.ts:191–194`
- **问题**：`content LIKE '%keyword%'` 无法使用 B-Tree 索引，数据量大时全表扫描。
- **修复**：为 `notes` 表启用 SQLite FTS5 全文搜索，或至少为 `title` 字段加索引。

---

### B-4｜`getDb()` 直接暴露底层数据库实例，破坏封装

- **文件**：`electron/modules/storage/index.ts:305–307`
- **问题**：`business/index.ts` 和 `updater/index.ts` 均通过 `storage.getDb()` 直接操作数据库，存储层无法统一管理事务、日志和错误处理。
- **修复**：将业务表操作封装为 StorageManager 方法，或设计独立的 Repository 层，避免直接暴露 `db` 实例。
