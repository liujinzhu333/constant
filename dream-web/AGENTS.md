# Dream Web — AI Agent 协作指南

> 最后更新：2026-05-13（离线支持、连接管理、打卡模块、离线同步修复）

## 项目概述

Dream Web 是 **Dream 跨端个人助手系统的 Web 前端**，基于 **Vue 3 + Vite + TypeScript + Element Plus** 构建。  
PC 端（Electron 内嵌）和手机端（局域网浏览器）共用本项目，数据全部通过 PC 端 HTTP Server 读写本地 SQLite。

- **平台支持**：PC（Electron 渲染进程加载 `http://localhost:5174`）/ 手机浏览器（局域网 `IP:45678`）
- **HTTP Server 端口**：生产 `45678`，开发 `45679`（开发时 vite proxy 指向 `45679`）
- **当前版本**：1.0.0
- **数据源**：PC 端 SQLite（`dream.db`），通过 REST API 访问

---

## 目录结构

```
dream-web/
├── src/
│   ├── App.vue                    # 全局入口（连接检测、store 初始化）
│   ├── main.ts                    # Vue 入口（Pinia + Element Plus + dayjs）
│   ├── router/index.ts            # 路由配置
│   ├── stores/
│   │   ├── connection.ts          # 连接状态 Store（在线/离线/重连/同步）
│   │   ├── todo.ts                # 待办 Store
│   │   ├── study.ts               # 计划 Store（含子计划、打卡）
│   │   ├── note.ts                # 笔记 Store
│   │   ├── schedule.ts            # 日程 Store
│   │   ├── account.ts             # 账号 Store（AES 加解密）
│   │   └── favorite.ts            # 收藏 Store
│   ├── utils/
│   │   ├── api.ts                 # HTTP API 层（axios、缓存、离线感知写操作）
│   │   └── offline-queue.ts       # 离线操作队列（持久化、回放、tempId 替换）
│   └── views/
│       ├── HomeView.vue           # 主视图（侧边导航 + 连接状态栏）
│       ├── SettingsView.vue       # 设置页（服务地址、离线同步、日志、数据备份）
│       ├── todo/TodoView.vue
│       ├── study/StudyView.vue    # 计划视图（打卡区 + 任务清单 + 子计划）
│       ├── note/NoteView.vue
│       ├── schedule/ScheduleView.vue
│       ├── reminder/ReminderView.vue
│       ├── account/AccountView.vue
│       └── favorite/FavoriteView.vue
├── vite.config.mts                # proxy 配置（开发指向 45679）
├── tsconfig.json
└── package.json
```

---

## 常用命令

```bash
# 开发模式（浏览器/Electron 内嵌）
npm run dev          # Vite dev server，默认 localhost:5174

# 生产构建（产物输出到 dist/，由 dream/sync-web 脚本同步到 dream/dist-web/）
npm run build

# TypeScript 类型检查
npm run type-check
```

---

## 架构要点

### 数据层（HTTP API + 离线缓存）

所有数据操作通过 `utils/api.ts`，内部统一走 axios 请求 PC 端 HTTP Server：

```ts
// 在线：axios 请求 → 写 localStorage 缓存
// 离线：GET 读缓存，写操作入队 offline-queue
```

**禁止**在 store 或 view 中直接调用 axios，统一通过 `studyApi / todoApi / ...` 等 API 对象。

### 离线感知写操作

`api.ts` 提供三个离线感知工具函数，store 的写操作统一使用：

| 函数 | 在线行为 | 离线行为 |
|---|---|---|
| `offlinePost<T>` | POST 请求 | 入队 + 返回含 tempId 的占位对象 |
| `offlinePatch<T>` | PATCH 请求 | 入队 + 返回本地合并结果 |
| `offlineDelete` | DELETE 请求 | 入队 + 返回 `{ ok: true }` |

离线时同步更新 localStorage 缓存（`readCache` / `writeCache`），刷新页面后 load() 仍能读到最新数据。

### 离线状态标志

```ts
import { isApiOffline, setApiOffline } from '../utils/api'

isApiOffline()        // 当前是否离线
setApiOffline(true)   // 手动切换离线
```

连接管理统一由 `stores/connection.ts` 的 `ConnectionStore` 负责，各业务 store **不直接操作** `_offline` 标志。

### 缓存 Key 规则

`readCache` / `writeCache` 的 key 对应请求路径（含查询参数）：

```
/api/study/plans?parent_id=null        → 顶层计划列表
/api/study/plans?parent_id=<id>        → 子计划列表
/api/study/tasks?plan_id=<id>          → 某计划的任务列表
/api/study/checkins?plan_id=<id>&...   → 打卡记录
```

`offlinePatch` 内部的 `listPathOf` 只截取路径部分（去掉尾段 id），如 `/api/study/tasks/xxx` → `/api/study/tasks`，**与带查询参数的缓存 key 不一致**。因此 `toggleTask` 等操作后需手动用正确 key 更新缓存：

```ts
const taskCachePath = `/api/study/tasks?plan_id=${planId}`
writeCache(taskCachePath, cached.map(t => t.id === task.id ? { ...t, ...patch } : t))
```

### syncProgress 与 currentPlan 替换陷阱

`syncProgress('top')` 会整体替换 `currentPlan.value = plans.value[idx]`。  
如果后续逻辑需要读取 `currentPlan.value` 的某个字段（如 `checkin_enabled`），  
**必须在 `syncProgress` 调用前把该值存入局部变量**，否则可能读到被替换后的旧值：

```ts
const checkinEnabled = !!currentPlan.value.checkin_enabled  // 先存
syncProgress('top')                                          // 可能替换 currentPlan
if (checkinEnabled) { ... }                                  // 用局部变量
```

### 打卡模块（Study）

- 打卡为**全自动**，无手动按钮：当日任务全部完成 → 自动打卡；有任务未完成 → 自动撤销
- **在线时**：`offlinePatch` 发 PATCH 请求，后端 `tryAutoCheckin` 写入打卡记录，前端异步刷新 `checkinApi.list`
- **离线时**：后端不可达，前端 `toggleTask` 里本地判断并直接操作 `checkins.value`：
  ```ts
  if (checkinEnabled) {
    const today = new Date().toISOString().slice(0, 10)
    const allDone = tasks.value.length > 0 && tasks.value.every(t => t.status === 'done')
    const alreadyChecked = checkins.value.some(c => c.date === today)
    if (allDone && !alreadyChecked) {
      checkins.value = [...checkins.value, { id: `local_${today}`, plan_id: planId, date: today, note: '', created_at: Math.floor(Date.now() / 1000) }]
    } else if (!allDone && alreadyChecked) {
      checkins.value = checkins.value.filter(c => c.date !== today)
    }
    // 只在在线时做 server sync，避免空数组覆盖本地记录
    if (!isApiOffline()) {
      checkinApi.list(planId, 3).then(list => { checkins.value = list }).catch(() => {})
    }
  }
  ```

### 连接管理（ConnectionStore）

- `status`: `'online' | 'offline' | 'checking'`
- `disconnect()`: 手动切换离线
- `reconnect(baseUrl)`: ping 服务端，成功则恢复 online
- `sync()`: 回放离线队列 → 刷新所有注册的业务 store
- 业务 store 通过 `registerRefresh(cb)` 注册重连后的刷新回调
- `SyncResult.errors` 是 `string[]`，格式为 `"METHOD /path: error message"`

### 笔记编辑规范

`NoteView.vue` 中必须用本地 ref 绑 textarea，不能直接绑 store：

```vue
<!-- 正确 -->
const localContent = ref('')
<textarea :value="localContent" @input="onContentInput" @blur="flushSave" />

<!-- 错误：store 回写会导致光标跳位 -->
<textarea v-model="noteStore.current.content" />
```

`saveNote` Store action 不回写 `content` 字段。

---

## 业务模块说明

### 待办（Todo）
- **Store**：`stores/todo.ts` | **View**：`views/todo/TodoView.vue`
- 优先级（高/中/低）、截止日期、状态筛选

### 计划（Study）
- **Store**：`stores/study.ts` | **View**：`views/study/StudyView.vue`
- 5 种类型：学习/工作/生活/健身/财务（`PLAN_CATEGORIES`）
- 支持子计划（`parent_id` 字段）
- **打卡**：每个计划独立开关，全自动打卡，热力图 + 连续天数展示

### 笔记（Note）
- **Store**：`stores/note.ts` | **View**：`views/note/NoteView.vue`
- 搜索防抖 400ms，编辑防抖 800ms，失焦立即保存
- `saveNote` 不回写 `content`（防光标跳位）

### 日程（Schedule）
- **Store**：`stores/schedule.ts` | **View**：`views/schedule/ScheduleView.vue`
- 月历视图，点击日期查看当日日程

### 提醒（Reminder）
- 无独立 Store | **View**：`views/reminder/ReminderView.vue`
- 待处理/已完成 Tab，推迟 10 分钟，系统通知

### 账号管理（Account）
- **Store**：`stores/account.ts` | **View**：`views/account/AccountView.vue`
- 密码 AES-256 加密，密钥内存持有

### 收藏（Favorite）
- **Store**：`stores/favorite.ts` | **View**：`views/favorite/FavoriteView.vue`
- `type` 区分 `link` / `quote`，置顶排序

### 设置（Settings）
- **View**：`views/SettingsView.vue`
- 服务地址配置（自定义 IP:PORT）、连接/断开/重连
- 离线同步：查看待同步队列数量、手动触发同步、丢弃离线数据
- 同步结果展示：`lastSyncResult.errors` 为 `string[]`，直接渲染字符串

---

## HTTP API 列表

```
GET    /api/study/plans?parent_id=null[&category=xxx]
POST   /api/study/plans
PATCH  /api/study/plans/:id
DELETE /api/study/plans/:id

GET    /api/study/tasks?plan_id=xxx
POST   /api/study/tasks
PATCH  /api/study/tasks/:id          ← 状态变更时触发 tryAutoCheckin
DELETE /api/study/tasks/:id

GET    /api/study/checkins?plan_id=xxx[&months=3]

GET    /api/todos
POST   /api/todos
PATCH  /api/todos/:id
DELETE /api/todos/:id

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

GET    /ping
```

---

## 已知问题 & 待办

1. `NoteView.vue` 和 `SettingsView.vue` 存在预先存在的 TS 类型错误（与打卡模块无关，待修复）
2. 离线队列回放时 tempId 替换仅覆盖 path 和 body 字符串，复杂嵌套场景可能有遗漏
3. 离线时打卡记录使用本地临时 id（`local_YYYY-MM-DD`），重连同步后会被服务端真实记录覆盖
