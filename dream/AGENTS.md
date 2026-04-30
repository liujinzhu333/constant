# Dream — AI Agent 协作指南

> 最后更新：2026-04-30

## 项目概述

Dream 是一个基于 **Electron + Vue 3 + Vite + TypeScript** 的跨端个人助手系统（PC 端）。  
架构设计为「**基座层固定 + 业务包热更新**」，但当前阶段基座与业务包一起打包发布，热更新为整包更新。

- **平台支持**：macOS 10.12+（arm64）、Windows 10+
- **Electron 版本**：29.x
- **数据目录**：
  - macOS 生产：`~/Library/Application Support/dream/`
  - macOS 开发：`~/Library/Application Support/dream-dev/`（与生产隔离，防止争抢单例锁）
  - Windows：`%APPDATA%\dream\`

---

## 目录结构

```
dream/
├── electron/                     # 主进程（Node.js 环境）
│   ├── main/index.ts             # 主进程入口：开发/生产 userData 隔离、禁用 GPU、启动基座
│   ├── preload/index.ts          # contextBridge 安全暴露所有 API（window.dreamAPI）
│   ├── types/electron.d.ts       # App.isQuitting 类型扩展
│   └── modules/
│       ├── startup/index.ts      # 启动模块：单例锁、窗口创建、业务包加载
│       ├── logger/index.ts       # 日志模块：按天轮转，保留 30 天，支持读取/删除接口
│       ├── storage/index.ts      # SQLite3 存储：AES-256 加密，WAL 模式
│       ├── updater/index.ts      # 整包更新：electron-updater + GitHub Releases，semver 比较
│       ├── system/index.ts       # 系统适配：窗口/托盘/快捷键/系统通知
│       ├── ipc/index.ts          # IPC 通信中心（注册所有处理器，含日志管理 handler）
│       └── business/index.ts     # 所有业务 IPC 处理器（Todo/Study/Note/Schedule/Reminder/Account）
├── src/                          # 渲染进程（浏览器环境）
│   ├── main.ts                   # Vue 入口，注册 dayjs 插件，全量导入 Element Plus
│   ├── App.vue
│   ├── assets/main.css           # 全局 CSS Token（支持自动暗色模式）
│   ├── router/index.ts
│   ├── composables/
│   │   └── useDebounce.ts        # 防抖工具（trigger/flush/cancel）
│   ├── stores/
│   │   ├── todo.ts               # 待办 Store（Pinia）
│   │   ├── study.ts              # 计划 Store（含子计划 state/actions）
│   │   ├── note.ts               # 笔记 Store（saveNote 不回写 content，防光标跳位）
│   │   ├── schedule.ts           # 日程 Store（dayjs 月历）
│   │   └── account.ts            # 账号 Store（密钥内存持有，AES 加解密）
│   └── views/
│       ├── HomeView.vue          # 主视图，侧边导航，KeepAlive 缓存各模块
│       ├── SettingsView.vue      # 设置页（含内嵌日志查看器）
│       ├── todo/TodoView.vue     # 待办任务视图
│       ├── study/StudyView.vue   # 计划视图（三栏：类型/计划列表/子计划详情）
│       ├── note/NoteView.vue     # 笔记视图
│       ├── schedule/ScheduleView.vue  # 日程视图（月历 + 日程列表）
│       ├── reminder/ReminderView.vue  # 提醒中心视图
│       └── account/AccountView.vue   # 账号管理视图（锁屏/分类导航/卡片列表）
├── docs/
│   ├── base-review.md            # 基座代码 Review 问题清单（待修复）
│   └── roadmap.md                # 业务包热更新规划
├── public/favicon.svg
├── vite.config.ts
├── package.json
├── tsconfig.json
└── tsconfig.node.json
```

---

## 常用命令

```bash
# 安装依赖（自动触发 better-sqlite3 针对 Electron 的重编译）
npm install

# 开发模式（vite-plugin-electron 自动拉起 Electron）
# userData 自动隔离到 dream-dev/，与线上版本互不干扰
npm run electron:dev

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
- IPC channel 命名规范：`模块:操作`，例如 `todo:list`、`log:readFile`

### 开发 / 生产环境隔离

```ts
// main/index.ts 最顶部（必须在所有逻辑之前）
const isDev = !!process.env.VITE_DEV_SERVER_URL
if (isDev) {
  app.setPath('userData', path.join(app.getPath('appData'), 'dream-dev'))
}
```

开发模式 userData 目录为 `dream-dev/`，与线上版本完全隔离（数据库、日志、单例锁均独立）。

### 开发模式判断

```ts
// 正确（两处均需判断，因环境变量注入时机不同）
const isDev = !!process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === 'development'

// 不可单独依赖
const isDev = process.env.NODE_ENV === 'development'
```

### 输入框性能规范

弹窗表单（提交时才调 IPC）可直接用 `v-model`。实时保存场景（如笔记）必须用本地 ref + 防抖：

```vue
<!-- 实时保存场景：正确 -->
const localContent = ref('')
<textarea :value="localContent" @input="onInput" @blur="flushSave" />

<!-- 实时保存场景：错误（输入 → store → watch → IPC，链路阻塞导致卡顿）-->
<textarea v-model="store.content" />
```

防抖在 view 层用 `useDebounce.ts` 包裹，**不在** store action 内加防抖。

### SQLite 存储

- 单例：`StorageManager.getInstance()`
- WAL 模式，支持并发读
- 加密密钥存于 `userData/.dream_key`（mode 0o600），AES-256 加密敏感字段
- 数据库文件：`userData/dream.db`

### 笔记 Store 特殊规则

`note.ts` 中 `saveNote` 回写 store 时**不能**回写 `content` 字段，否则触发 `watch` 导致编辑器光标跳位。

### macOS 已知问题

- Electron 29 + macOS GPU 进程崩溃：已在主进程添加 `app.commandLine.appendSwitch('--disable-gpu')` 规避
- 启动耗时参考值：~1500ms

---

## 业务模块说明

### 待办（Todo）

- **Store**：`stores/todo.ts` | **View**：`views/todo/TodoView.vue`
- 优先级（高/中/低）、截止日期、状态筛选（全部/待完成/已完成）
- tags 字段已存在于数据库，UI 层暂未使用

### 计划（Study）

- **Store**：`stores/study.ts` | **View**：`views/study/StudyView.vue`
- 5 种类型：学习/工作/生活/健身/财务（`PLAN_CATEGORIES` 常量）
- **三栏布局**：左栏（类型筛选+顶层计划列表）/ 中栏（计划详情+任务+子计划列表）/ 右栏（子计划任务详情）
- 支持**子计划**：`study_plans.parent_id` 字段，`study:subPlanList` IPC
- 支持**编辑**：新建/编辑/新建子计划/编辑子计划统一复用弹窗（`planDialogMode` 区分）
- 进度自动同步：任务完成后前端 `syncProgress()` 本地更新，主进程 `syncPlanProgress()` 写库

### 笔记（Note）

- **Store**：`stores/note.ts` | **View**：`views/note/NoteView.vue`
- 左右两栏：左侧笔记列表，右侧编辑区
- 搜索防抖 400ms，编辑防抖 800ms，失焦立即保存（`flushSave`）
- 置顶功能，纯文本编辑（无 Markdown 渲染）

### 日程（Schedule）

- **Store**：`stores/schedule.ts` | **View**：`views/schedule/ScheduleView.vue`
- 月历视图，点击日期查看当日日程
- 支持全天/时间段日程，颜色标记
- 只能新建和删除，暂不支持编辑

### 提醒（Reminder）

- 无独立 Store | **View**：`views/reminder/ReminderView.vue`
- 待处理/已完成 Tab
- 推迟 10 分钟、标记完成、系统通知
- 目前无定时自动触发机制（需手动进入提醒页查看）

### 账号管理（Account）

- **Store**：`stores/account.ts` | **View**：`views/account/AccountView.vue`
- **加密策略**：密钥仅保存在内存（不持久化），密码在渲染进程用 `CryptoJS.AES` 加密后存密文；读取时渲染进程解密
- 8 种平台类型：开发工具 / 社交媒体 / 购物 / 金融 / 游戏 / 工作 / 音视频 / 其他
- **布局**：锁屏界面（密钥验证）→ 左侧分类导航栏 + 右侧 Grid 卡片列表（auto-fill，最大 300px）
- 卡片字段：平台名、类型标签、链接图标（可跳转/复制）、账号名、手机、邮箱、密码（可显隐/复制）、备注
- 密钥验证：取首条有密码的记录尝试解密，空字符串结果视为密钥错误
- **注意**：`El-button + el-button` 默认 `margin-left: 12px`，各容器内用 `:deep(.el-button + .el-button) { margin-left: 0 }` 覆盖，不与 `gap` 混用

---

## 设置页功能

| 功能区 | 说明 |
|---|---|
| 关于 | 显示基座版本、运行平台 |
| 更新 | 检查更新（GitHub Releases）、下载、立即安装、回滚版本 |
| 数据 | 显示数据目录路径、备份数据、打开目录 |
| 日志 | 内嵌日志查看器：文件标签切换、级别着色、自动滚底、单文件删除、清空历史 |

---

## 更新机制

### 当前实现（整包更新）

```
用户点「检查更新」
  → 拉取 GitHub Release 的 latest-mac.yml
  → semver 比较（远端 > 本地才算有更新）
  → 下载 Dream-{version}-arm64-mac.zip
  → 下载完成弹窗确认
  → quitAndInstall() 退出重启安装
```

- 更新源：`https://github.com/liujinzhu333/constant/releases`
- 开发模式下 `electron-updater` 自动跳过，不影响开发

### 发版流程

```bash
# 1. 修改版本号
# dream/package.json → "version": "1.0.1"

# 2. 打包
npm run build:mac

# 3. 将 release/ 下所有文件上传到 GitHub Release（tag: v1.0.1）
# 必须包含：.dmg、-mac.zip、.dmg.blockmap、-mac.zip.blockmap、latest-mac.yml
```

### 签名说明

本地构建无 Apple Developer ID 签名，首次安装需：
```bash
xattr -cr /Applications/Dream.app
# 或在「系统设置 → 隐私与安全性」手动允许
```

### 业务包独立热更新（规划中）

见 `docs/roadmap.md`。目前基座与业务包一起打包，`business_packages` 表为预留结构。

---

## IPC API 完整列表（window.dreamAPI）

```ts
window.dreamAPI = {
  app:      { getVersion, getPlatform, getPath, openExternal, showOpenDialog, showSaveDialog, minimize, quit },
  store:    { set, get, delete, backup, getMeta },
  log:      { debug, info, warn, error, getLogDir, getFiles, readFile, deleteFile, clearAll },
  updater:  { check, download, install, getStatus, rollback, onStatus, onProgress, onError },
  notification: { send },
  todo:     { list, add, update, done, undone, delete },
  study:    { planList, planAdd, planUpdate, planDelete, subPlanList, taskList, taskAdd, taskDone, taskUndone, taskDelete },
  note:     { list, get, add, update, delete },
  schedule: { list, add, update, delete },
  reminder: { list, add, dismiss, snooze, delete },
  account:  { list, add, update, delete },
}
```

---

## 依赖说明

| 依赖 | 用途 |
|---|---|
| `better-sqlite3` | SQLite3 本地存储（需针对 Electron 重编译） |
| `crypto-js` | AES-256 加密 |
| `dayjs` | 日期处理（需注册 `isSameOrBefore`/`isToday`/`isTomorrow`/`isYesterday` 插件） |
| `electron-log` | 日志（按天轮转，支持文件读取） |
| `electron-updater` | 整包更新（GitHub Releases provider） |
| `pinia` | 状态管理 |
| `vue-router` | 路由 |
| `vite-plugin-electron` | Vite 集成 Electron 开发/构建 |

---

## 已知问题 & 待办

详见 `docs/base-review.md`（基座 Review 清单）和 `docs/roadmap.md`（功能规划）。
