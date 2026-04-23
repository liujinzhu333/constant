# Dream — AI Agent 协作指南

## 项目概述

Dream 是一个基于 **Electron + Vue 3 + Vite + TypeScript** 的跨端个人助手系统（PC 端）。  
采用「**基座层固定 + 业务包热更新**」架构：基座提供运行环境、存储、日志、热更新等基础能力，业务功能层可通过热更新独立迭代。

- **平台支持**：macOS 10.12+（arm64/x64）、Windows 10+
- **Electron 版本**：29.x
- **数据目录**：
  - macOS：`~/Library/Application Support/dream/`
  - Windows：`%APPDATA%\dream\`

---

## 目录结构

```
dream/
├── electron/                     # 主进程（Node.js 环境）
│   ├── main/index.ts             # 主进程入口，禁用 GPU，启动基座
│   ├── preload/index.ts          # contextBridge 安全暴露所有 API
│   ├── types/electron.d.ts       # App.isQuitting 类型扩展
│   └── modules/
│       ├── startup/index.ts      # 启动模块：单例锁、窗口创建、业务包加载
│       ├── logger/index.ts       # 日志模块：按天轮转，保留 30 天
│       ├── storage/index.ts      # SQLite3 存储：AES-256 加密，10 张业务表
│       ├── updater/index.ts      # 热更新：electron-updater，MD5 校验，回滚
│       ├── system/index.ts       # 系统适配：窗口/托盘/快捷键/系统通知
│       ├── ipc/index.ts          # IPC 通信中心（注册所有处理器）
│       └── business/index.ts     # 所有业务 IPC 处理器（Todo/Plan/Note/Schedule/Reminder）
├── src/                          # 渲染进程（浏览器环境）
│   ├── main.ts                   # Vue 入口，注册 dayjs 插件
│   ├── App.vue
│   ├── assets/main.css           # 全局 CSS Token（支持自动暗色模式）
│   ├── router/index.ts
│   ├── composables/
│   │   └── useDebounce.ts        # 防抖工具
│   ├── stores/
│   │   ├── todo.ts               # 待办 Store（Pinia）
│   │   ├── study.ts              # 计划 Store（PLAN_CATEGORIES 5 种类型）
│   │   ├── note.ts               # 笔记 Store（saveNote，防抖在 view 层）
│   │   └── schedule.ts           # 日程 Store（dayjs 月历）
│   └── views/
│       ├── HomeView.vue          # 主视图，侧边导航，KeepAlive 缓存各模块
│       ├── SettingsView.vue      # 设置页
│       ├── todo/TodoView.vue     # 待办任务视图
│       ├── study/StudyView.vue   # 计划视图（5 种类型筛选）
│       ├── note/NoteView.vue     # 笔记视图
│       ├── schedule/ScheduleView.vue  # 日程视图（月历 + 日程列表）
│       └── reminder/ReminderView.vue  # 提醒中心视图
├── public/favicon.svg
├── vite.config.ts                # vite-plugin-electron 配置
├── package.json
├── tsconfig.json
└── tsconfig.node.json
```

---

## 常用命令

```bash
# 安装依赖（自动触发 better-sqlite3 针对 Electron 的重编译）
npm install

# 开发模式（启动 Vite，vite-plugin-electron 自动拉起 Electron）
npm run electron:dev

# 仅 Vite 构建预览
npm run dev

# 生产打包（全平台）
npm run build

# 生产打包（仅 macOS）
npm run build:mac

# 生产打包（仅 Windows）
npm run build:win

# 手动重编译 better-sqlite3
npm run rebuild

# ESLint 自动修复
npm run lint

# TypeScript 类型检查（无输出 = 通过）
npx tsc --noEmit
```

---

## 架构要点

### 主进程 / 渲染进程通信
- 所有 API 通过 `electron/preload/index.ts` 用 `contextBridge` 暴露为 `window.dreamAPI`
- 渲染进程**不能**直接 `require('electron')`，必须通过 `window.dreamAPI.xxx` 调用
- IPC channel 命名规范：`模块:操作`，例如 `todo:list`、`note:save`

### 输入框性能规范
弹窗/编辑区输入框**必须**使用独立 `ref` + `:value` + `@input` 原生事件，**禁止**在频繁触发 IPC 的场景下使用 `v-model="reactive对象.属性"`：

```vue
<!-- 正确 -->
const formTitle = ref('')
<input :value="formTitle" @input="formTitle = ($event.target as HTMLInputElement).value" />

<!-- 错误（会导致输入卡顿）-->
const form = reactive({ title: '' })
<input v-model="form.title" />
```

需要防抖的场景（如笔记内容自动保存），在 view 层用 `useDebounce.ts` 包裹，**不在** store action 内加防抖。

### SQLite 存储
- 单例：`StorageManager.getInstance()`
- WAL 模式开启，支持并发读
- 加密密钥存于 `userData/.dream_key`（mode 0o600），AES-256 加密敏感字段
- 数据库文件：`userData/dream.db`

### macOS 已知问题
- Electron 29 + macOS GPU 进程崩溃：已在主进程添加 `app.commandLine.appendSwitch('--disable-gpu')` 规避
- 启动耗时参考值：~1000ms

### 开发模式判断
```ts
// 正确
const isDev = !!process.env.VITE_DEV_SERVER_URL

// 不可靠（不要单独依赖）
const isDev = process.env.NODE_ENV === 'development'
```

### 笔记 Store 特殊规则
`note.ts` 中 `saveNote` 回写 store 时**不能**回写 `content` 字段，否则会触发 `watch` 导致编辑器光标跳位。

---

## 业务模块说明

| 模块 | Store | View | 说明 |
|---|---|---|---|
| 待办 | `stores/todo.ts` | `views/todo/TodoView.vue` | 优先级/截止日期/筛选 |
| 计划 | `stores/study.ts` | `views/study/StudyView.vue` | 5 种类型：学习/工作/生活/健身/财务 |
| 笔记 | `stores/note.ts` | `views/note/NoteView.vue` | 搜索防抖 400ms，保存防抖 800ms |
| 日程 | `stores/schedule.ts` | `views/schedule/ScheduleView.vue` | 月历视图，dayjs 计算 |
| 提醒 | 无独立 Store | `views/reminder/ReminderView.vue` | 推迟/完成/系统通知 |

---

## 打包产物

构建产物输出至 `release/` 目录：

| 文件 | 说明 |
|---|---|
| `Dream-{version}-arm64.dmg` | macOS 安装包（Apple Silicon）|
| `Dream-{version}-arm64-mac.zip` | macOS zip（热更新分发用）|
| `Dream-{version}-arm64.dmg.blockmap` | 增量更新 blockmap |

> **注意**：本地构建无 Apple Developer ID 签名，安装后需在「系统设置 → 隐私与安全性」手动允许，或执行 `xattr -cr /Applications/Dream.app`

---

## 依赖说明

| 依赖 | 用途 |
|---|---|
| `better-sqlite3` | SQLite3 本地存储（需针对 Electron 重编译） |
| `crypto-js` | AES-256 加密 |
| `dayjs` | 日期处理（需注册 `isSameOrBefore`/`isToday`/`isTomorrow` 等插件） |
| `electron-log` | 日志（按天轮转） |
| `electron-updater` | 热更新 |
| `pinia` | 状态管理 |
| `vue-router` | 路由 |
| `vite-plugin-electron` | Vite 集成 Electron 开发/构建 |
