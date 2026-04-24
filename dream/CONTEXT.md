# Dream 项目开发上下文

> 最后更新：2026-04-24

---

## 项目目标

开发一个名为 **Dream** 的跨端个人助手系统（PC端），基于 Electron + Vue3 + Vite 架构，采用「基座 + 业务包热更新」设计。

---

## 技术栈

| 层级 | 技术 |
|---|---|
| 桌面壳 | Electron 29 |
| 前端框架 | Vue 3 + Vite + TypeScript |
| UI 组件库 | Element Plus 2.x（全量导入） + @element-plus/icons-vue |
| 状态管理 | Pinia |
| 路由 | Vue Router 5 |
| 本地存储 | better-sqlite3（需针对 Electron 重编译） |
| 加密 | crypto-js AES-256 |
| 日志 | electron-log（按天轮转，保留30天） |
| 热更新 | electron-updater |
| 日期 | dayjs + isToday/isYesterday/isTomorrow 插件 |
| 平台支持 | macOS 10.12+（arm64）、Windows 10+ |

---

## 架构设计

### 基座层（固定不变）
提供运行环境、热更新、存储、日志、系统适配，不随业务迭代。

### 业务包层（可热更新）
所有业务功能模块，可通过 OTA 独立升级。

---

## 目录结构

```
dream/
├── build/                        # 打包图标资源
│   ├── icon.icns                 # macOS 图标
│   ├── icon.ico                  # Windows 图标
│   ├── icon.png                  # 通用 PNG 图标
│   └── icon.iconset/             # macOS iconset 各尺寸
├── electron/
│   ├── main/index.ts             # 主进程入口（禁用 GPU、启动基座）
│   ├── preload/index.ts          # contextBridge 安全暴露所有 API
│   ├── types/electron.d.ts       # App.isQuitting 类型扩展
│   └── modules/
│       ├── startup/index.ts      # 单例锁、窗口创建、业务包加载（耗时~1000ms）
│       ├── logger/index.ts       # 按天轮转日志，保留30天
│       ├── storage/index.ts      # SQLite3 + AES-256 加密，10张业务表
│       ├── updater/index.ts      # electron-updater，MD5校验，支持回滚
│       ├── system/index.ts       # 窗口/托盘/快捷键 Cmd+Shift+D/系统通知
│       ├── ipc/index.ts          # IPC 通信中心
│       └── business/index.ts     # 所有业务 IPC 处理器
├── src/
│   ├── main.ts                   # Vue 入口：注册 dayjs 插件、全量导入 Element Plus
│   ├── App.vue
│   ├── assets/main.css           # 全局 CSS Token（支持自动暗色模式）
│   ├── router/index.ts
│   ├── composables/
│   │   └── useDebounce.ts        # 防抖工具（trigger/flush/cancel）
│   ├── stores/
│   │   ├── todo.ts               # 待办 Store
│   │   ├── study.ts              # 计划 Store（PLAN_CATEGORIES 5种类型）
│   │   ├── note.ts               # 笔记 Store（saveNote，不回写 content）
│   │   └── schedule.ts           # 日程 Store（dayjs 月历）
│   └── views/
│       ├── HomeView.vue          # 侧边导航（El 图标）+ KeepAlive
│       ├── SettingsView.vue      # 设置页（ElDescriptions/ElCard/ElMessage）
│       ├── todo/TodoView.vue     # 待办（ElDialog/ElRadioGroup/ElBadge）
│       ├── study/StudyView.vue   # 计划（ElProgress/ElMessageBox）
│       ├── note/NoteView.vue     # 笔记（搜索防抖400ms，保存防抖800ms）
│       ├── schedule/ScheduleView.vue  # 日程（月历 + ElDatePicker）
│       └── reminder/ReminderView.vue  # 提醒（ElTabs/ElTooltip）
├── public/
│   ├── favicon.svg
│   └── logo.png                  # 应用 logo（同时作为 favicon 和侧边栏图标）
├── index.html
├── vite.config.ts
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── AGENTS.md                     # AI Agent 协作指南
└── CONTEXT.md                    # 本文件
```

---

## 常用命令

```bash
# 开发启动（vite-plugin-electron 自动拉起 Electron）
npm run electron:dev

# 生产打包 macOS
npm run build:mac

# 生产打包 Windows
npm run build:win

# 重编译 better-sqlite3（native 模块）
npm run rebuild

# TypeScript 类型检查（无输出 = 通过）
npx tsc --noEmit
```

---

## 关键架构决策与踩坑记录

### 1. macOS GPU 进程崩溃
**问题**：Electron 29 + macOS 启动时 GPU 进程崩溃。  
**解决**：主进程添加 `app.commandLine.appendSwitch('--disable-gpu')`。

### 2. 开发模式判断
```ts
// 正确
const isDev = !!process.env.VITE_DEV_SERVER_URL
// 不可靠（不要单独依赖）
const isDev = process.env.NODE_ENV === 'development'
```

### 3. 输入框卡顿根因（已解决）
**根因**：不是 `v-model` 本身，而是「输入 → 实时触发 IPC」链路：
```
用户输入 → v-model 更新 store → watch 触发 → IPC 调用（跨进程阻塞）
```
**正确做法**：
- 弹窗表单（提交时才调 IPC）→ 直接用 `v-model`，没问题
- 实时保存（如笔记）→ `v-model` 绑**本地 ref** + 防抖，切断与 store/IPC 的直接联动

### 4. 笔记 Store 特殊规则
`saveNote` 回写 store 时**不能**回写 `content` 字段，否则触发 `watch` 导致编辑器光标跳位。

### 5. Element Plus 按需导入与 vite-plugin-electron 冲突
**问题**：`unplugin-auto-import` / `unplugin-vue-components` 是 ESM-only 包，`vite-plugin-electron` 用 CJS 加载 vite.config，导致 `require()` 报错。  
**解决**：改用**全量导入**，在 `main.ts` 直接 `app.use(ElementPlus)`，全局注册所有图标。

### 6. Element Plus 图标命名
图标名与 Material Design 不同，使用前需确认：
```ts
// 正确（@element-plus/icons-vue 的实际命名）
import { Checked, List, Notebook, Calendar, Bell, Setting, Close, Search, Plus, Star, StarFilled, Delete, Document } from '@element-plus/icons-vue'

// 错误（不存在）
import { CheckboxMultipleMarked, NotebookOutline, CalendarMonth, BellOutline } from '@element-plus/icons-vue'
```

### 7. SQLite 存储
- 单例：`StorageManager.getInstance()`
- WAL 模式，支持并发读
- 加密密钥存于 `userData/.dream_key`（mode 0o600）
- 数据库路径：`~/Library/Application Support/dream/dream.db`（macOS）

---

## 业务模块

| 模块 | Store | View | 核心功能 |
|---|---|---|---|
| 待办 | `stores/todo.ts` | `todo/TodoView.vue` | 优先级(高/中/低)、截止日期、全部/待完成/已完成筛选 |
| 计划 | `stores/study.ts` | `study/StudyView.vue` | 5种类型（学习/工作/生活/健身/财务）、进度环、任务列表 |
| 笔记 | `stores/note.ts` | `note/NoteView.vue` | 搜索防抖400ms，编辑防抖800ms，失焦立即保存，置顶 |
| 日程 | `stores/schedule.ts` | `schedule/ScheduleView.vue` | 月历视图，全天/时间段日程，颜色标记 |
| 提醒 | 无独立 Store | `reminder/ReminderView.vue` | 待处理/已完成 Tab，推迟10分钟，系统通知 |

### 计划类型常量（`stores/study.ts`）
```ts
export const PLAN_CATEGORIES = [
  { value: 'all',     label: '全部', icon: '🗂', color: '#8e8e93' },
  { value: 'study',   label: '学习', icon: '📚', color: '#0071e3' },
  { value: 'work',    label: '工作', icon: '💼', color: '#ff9f0a' },
  { value: 'life',    label: '生活', icon: '🌿', color: '#34c759' },
  { value: 'fitness', label: '健身', icon: '💪', color: '#ff3b30' },
  { value: 'finance', label: '财务', icon: '💰', color: '#af52de' },
]
```

---

## IPC API 结构（window.dreamAPI）

```ts
window.dreamAPI = {
  app:          { getPlatform, getPath, openExternal },
  log:          { getLogDir },
  store:        { getMeta, backup },
  updater:      { getStatus, check, download, rollback, onStatus, onProgress },
  notification: { send },
  todo:         { list, add, update, remove },
  plan:         { list, add, update, remove, listTasks, addTask, updateTask, deleteTask },
  note:         { list, get, add, save, remove, togglePin, search },
  schedule:     { listMonth, listDay, add, remove },
  reminder:     { list, add, snooze, dismiss, delete },
}
```

---

## 打包与图标

### 产物目录：`release/`
| 文件 | 说明 |
|---|---|
| `Dream-1.0.0-arm64.dmg` | macOS 安装包 |
| `Dream-1.0.0-arm64-mac.zip` | macOS zip（热更新分发） |
| `Dream-1.0.0-arm64.dmg.blockmap` | 增量更新 blockmap |

### 图标文件
| 文件 | 用途 |
|---|---|
| `build/icon.icns` | macOS 打包图标 |
| `build/icon.ico` | Windows 打包图标 |
| `public/logo.png` | favicon + 侧边栏 logo |

> 如需更换图标：将新 logo（建议 1024×1024 PNG 透明背景）放到 `/Users/liujinzhu/code/constant/logo.png`，然后重新执行图标生成脚本。

### 签名说明
本地构建无 Apple Developer ID 签名，首次打开需在「系统设置 → 隐私与安全性」手动允许，或执行：
```bash
xattr -cr /Applications/Dream.app
```

---

## Git 仓库

- **远程**：`https://github.com/liujinzhu333/constant`
- **分支**：`main`
- **本地路径**：`/Users/liujinzhu/code/constant`
- **数据目录**（运行时）：`~/Library/Application Support/dream/`
- **日志目录**（运行时）：`~/Library/Application Support/dream/logs/`
