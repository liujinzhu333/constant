# Dream 跨端个人助手系统 — 总览

> 最后更新：2026-05-18

## 系统定位

Dream 是一个运行在本地的跨端个人助手系统，数据存储在 PC 本地 SQLite，手机/浏览器通过局域网访问 PC 的 HTTP Server 实现多端同步，无需云服务。

## 子项目

| 目录 | 技术栈 | 说明 |
|---|---|---|
| `dream/` | Electron 29 + Vue 3 + Vite + TypeScript | PC 端主应用，含 SQLite 存储和 HTTP Server |
| `dream-web/` | Vue 3 + Vite + TypeScript + Element Plus | Web 前端，PC 内嵌 & 手机浏览器共用 |
| `dream-mobile-base/` | Android WebView | 移动端壳，加载 dream-web |
| `dream-chrome-extension/` | Chrome Extension | 一键收藏当前页面到 Dream |

## 数据流

```
dream-web（浏览器/手机）
dream-mobile-base（Android WebView）
dream-chrome-extension（Chrome 插件）
        │  HTTP REST（局域网）
        ▼
dream（Electron 主进程 HTTP Server）
        │  IPC（contextBridge）
        ▼
SQLite（userData/dream.db）
```

PC 端渲染进程（Vue）通过 `window.dreamAPI`（contextBridge）调用主进程 IPC，主进程直接读写 SQLite。

## 端口约定

| 端口 | 用途 |
|---|---|
| `45678` | HTTP Server（生产） |
| `45679` | HTTP Server（开发，dream-web vite proxy 指向此端口） |
| `5174` | dream-web Vite dev server |

## 数据库

- 文件：`userData/dream.db`（SQLite）
- WAL 模式，支持并发读
- 加密密钥：`userData/.dream_key`（mode 0o600），AES-256 加密敏感字段
- macOS 生产路径：`~/Library/Application Support/dream/`
- macOS 开发路径：`~/Library/Application Support/dream-dev/`（与生产隔离）

### 数据表

| 表名 | 模块 |
|---|---|
| `todos` | 待办 |
| `study_plans` | 计划（含子计划） |
| `study_tasks` | 计划任务 |
| `study_checkins` | 打卡记录 |
| `notes` | 笔记 |
| `schedules` | 日程 |
| `reminders` | 提醒 |
| `accounts` | 账号 |
| `favorites` | 收藏 |
| `members` | 人员 |
| `member_events` | 人员经历 |
| `member_relations` | 人员关联 |

## PC 端 IPC API（window.dreamAPI）

```ts
window.dreamAPI = {
  app:      { getVersion, getPlatform, getPath, openExternal, showInFolder, showOpenDialog, showSaveDialog, minimize, quit },
  store:    { set, get, delete, backup, getMeta, listBackups, deleteBackup, restoreBackup, importBackup },
  log:      { debug, info, warn, error, getLogDir, getFiles, readFile, deleteFile, clearAll },
  updater:  { check, download, install, getStatus, rollback, onStatus, onProgress, onError },
  notification: { send },
  todo:     { list, add, update, done, undone, delete },
  study:    { planList, planAdd, planUpdate, planDelete, subPlanList,
              taskList, taskAdd, taskDone, taskUndone, taskDelete,
              checkinList },
  note:     { list, get, add, update, delete },
  schedule: { list, add, update, delete },
  reminder: { list, add, dismiss, snooze, delete },
  account:  { list, add, update, delete },
  favorite: { list, add, update, pin, delete },
  member:   { list, get, add, update, delete,
              eventList, eventAdd, eventDelete,
              relationList, relationAdd, relationDelete },
  httpServer: { start, stop, status },
}
```

## HTTP REST API（dream-web / 手机端 / 插件访问）

```
GET    /ping

GET    /api/todos
POST   /api/todos
PATCH  /api/todos/:id
DELETE /api/todos/:id

GET    /api/study/plans?parent_id=null[&category=xxx]
POST   /api/study/plans
PATCH  /api/study/plans/:id
DELETE /api/study/plans/:id

GET    /api/study/tasks?plan_id=xxx
POST   /api/study/tasks
PATCH  /api/study/tasks/:id
DELETE /api/study/tasks/:id

GET    /api/study/checkins?plan_id=xxx[&months=3]

GET    /api/notes[?keyword=xxx]
GET    /api/notes/:id
POST   /api/notes
PATCH  /api/notes/:id
DELETE /api/notes/:id

GET    /api/schedules?start=xxx&end=xxx
POST   /api/schedules
PATCH  /api/schedules/:id
DELETE /api/schedules/:id

GET    /api/accounts
POST   /api/accounts
PATCH  /api/accounts/:id
DELETE /api/accounts/:id

GET    /api/favorites[?type=xxx&keyword=xxx]
POST   /api/favorites
PATCH  /api/favorites/:id
PATCH  /api/favorites/:id/pin
DELETE /api/favorites/:id

GET    /api/members[?relation=xxx&tag=xxx&keyword=xxx]
GET    /api/members/:id
POST   /api/members
PATCH  /api/members/:id
DELETE /api/members/:id

GET    /api/members/:id/events
POST   /api/members/:id/events
DELETE /api/members/events/:id

GET    /api/members/:id/relations
POST   /api/members/relations
DELETE /api/members/relations/:from_id/:to_id
```

## 版本与发布

- 当前版本：`1.0.4`
- 打包命令：`cd dream && npm run build:mac`（自动先构建 dream-web）
- 产物目录：`dream/release/`
- 更新源：GitHub Releases（`https://github.com/liujinzhu333/constant/releases`）
- 整包更新，semver 比较，下载后 `quitAndInstall()` 重启安装

## Web 端离线机制

dream-web 支持离线运行，写操作通过队列持久化，重连后自动回放：

| 函数 | 在线 | 离线 |
|---|---|---|
| `offlinePost<T>` | POST 请求 | 入队 + 返回含 tempId 的占位对象 |
| `offlinePatch<T>` | PATCH 请求 | 入队 + 返回本地合并结果 |
| `offlineDelete` | DELETE 请求 | 入队 + 返回 `{ ok: true }` |

连接管理由 `stores/connection.ts`（ConnectionStore）统一负责。
