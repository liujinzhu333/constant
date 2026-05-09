# Dream Mobile 项目开发上下文

> 最后更新：2026-05-06（移动端核心基础与整体架构版 V1.0）

---

## 项目目标

开发一个名为 **Dream** 的跨端个人助手系统（移动端业务包），基于 UniApp + Vue3 + Vite + TypeScript 架构，采用「基座 + 业务包热更新」设计，适配 Android 9+ / iOS 13+，兼容 H5（Web）与微信小程序。

对应 PC 端项目：`../dream/`（Electron + Vue3）

---

## 技术栈

| 层级 | 技术 |
|---|---|
| 跨端框架 | UniApp 3.x + Vue3 + Vite 5 |
| 语言 | TypeScript |
| UI 组件库 | uview-plus 3.x |
| 状态管理 | Pinia 3.x |
| 本地存储 | SQLite（App 端：plus.sqlite；H5 端：localStorage 模拟） |
| 加密 | crypto-js AES-256 |
| 日志 | 自研（App 端写沙盒文件，按天轮转，保留30天） |
| 热更新 | plus.runtime.install()（wgt 包） |
| 日期 | dayjs + isToday/isYesterday/isTomorrow/relativeTime 插件 |
| 平台支持 | Android 9+（minSdkVersion 28）/ iOS 13+ / H5 / 微信小程序 |

---

## 架构设计

### 基座层（dream-mobile-base/，规划中）
固定不变，负责底层运行环境、热更新引擎、SQLite 初始化、权限管理、系统适配。

### 业务包层（dream-mobile/，本项目）
所有业务功能，可通过 wgt 热更新独立升级。

---

## 目录结构

```
dream-mobile/
├── src/
│   ├── App.vue               # 全局入口（DB初始化、权限申请、启动热更新检测）
│   ├── main.ts               # Vue 入口：注册 Pinia、dayjs、uview-plus
│   ├── uni.scss              # 全局 CSS Token（对标 PC 端 main.css）
│   ├── manifest.json         # 应用配置（权限、版本、appid）
│   ├── pages.json            # 路由 + TabBar 配置
│   ├── env.d.ts              # 全局类型声明（__APP_VERSION__、plus API 类型）
│   ├── pages/
│   │   ├── todo/index.vue    # 待办（优先级、截止日期、手势操作）
│   │   ├── study/
│   │   │   ├── index.vue     # 计划列表（分类横滑、进度条）
│   │   │   └── detail.vue    # 计划详情（任务列表、子计划）
│   │   ├── note/
│   │   │   ├── index.vue     # 笔记列表（搜索防抖400ms）
│   │   │   └── edit.vue      # 笔记编辑（防抖800ms，失焦立即保存）
│   │   ├── schedule/index.vue # 日程（月历视图，日期标记点）
│   │   ├── reminder/index.vue # 提醒中心（Tab切换，推迟10分钟）
│   │   ├── account/
│   │   │   ├── index.vue     # 账号管理（锁屏/生物识别/AES加密）
│   │   │   └── unlock.vue    # 解锁页（规划）
│   │   ├── favorite/index.vue # 收藏（链接/名言，置顶，标签）
│   │   └── settings/index.vue # 设置（热更新/日志/关于）
│   ├── stores/
│   │   ├── todo.ts           # 待办 Store（复用 PC 端逻辑）
│   │   ├── study.ts          # 计划 Store（PLAN_CATEGORIES 5种类型）
│   │   ├── note.ts           # 笔记 Store（saveNote 不回写 content）
│   │   ├── schedule.ts       # 日程 Store（dayjs 月历）
│   │   ├── account.ts        # 账号 Store（密钥内存持有，AES加解密，生物识别）
│   │   └── favorite.ts       # 收藏 Store（链接/名言，置顶排序）
│   ├── utils/
│   │   ├── db.ts             # SQLite 封装（三端条件编译 + 所有 DAO）
│   │   ├── crypto.ts         # AES-256 加解密（复用 PC 端）
│   │   ├── logger.ts         # 移动端日志（App 端按天轮转）
│   │   ├── notification.ts   # 多端通知封装（App/H5/MP）
│   │   └── update.ts         # wgt 热更新（检测/下载/校验/安装/回滚）
│   ├── composables/
│   │   └── useDebounce.ts    # 防抖工具（复用 PC 端）
│   └── static/tabbar/        # TabBar 图标资源（待替换）
├── vite.config.ts            # 路径别名 + __APP_VERSION__ 注入
├── tsconfig.json
├── package.json
├── CONTEXT.md                # 本文件
└── AGENTS.md                 # AI Agent 协作指南
```

---

## 常用命令

```bash
# H5 开发调试（推荐，浏览器直接调试）
npm run dev:h5

# 微信小程序开发
npm run dev:mp-weixin

# 构建 H5 生产版本
npm run build:h5

# 构建微信小程序
npm run build:mp-weixin

# TypeScript 类型检查（无输出 = 通过）
npm run type-check
```

> App（Android/iOS）打包需要 HBuilderX，导入 dream-mobile/ 目录后选择「运行到手机或模拟器」。

---

## 关键架构决策与踩坑记录

### 1. 三端数据层适配
- **APP-PLUS**：`plus.sqlite` 原生 SQLite，完整 SQL 支持
- **H5**：`localStorage` 模拟，仅供开发调试，不做持久化生产使用
- **MP-WEIXIN**：降级到 KV 存储 + 云开发（待实现）

### 2. 笔记编辑防抖（复用 PC 端踩坑记录）
`saveNote` 回写 store 时**不能**回写 `content` 字段，否则触发 Vue 响应式更新导致 textarea 光标跳位。
`edit.vue` 中 `localTitle` / `localContent` 绑定本地 ref，与 store 解耦。

### 3. 账号密码加密（对标 PC 端策略）
- 密钥仅保存在内存（`cryptoUtil.setKey(key)`），不持久化
- 解锁验证：取首条有密码的记录尝试解密，空字符串结果视为密钥错误
- 移动端增强：支持指纹/面容 ID biometrics 解锁（`uni.startSoterAuthentication`）

### 4. 热更新流程
```
版本检测（GET /api/version）
  → Wi-Fi 优先判断
  → 下载 wgt（uni.downloadFile，断点续传，onProgressUpdate 监听）
  → MD5 完整性校验（crypto-js MD5）
  → plus.runtime.install()
  → restart()
  → 失败则删临时文件，自动回滚
```

### 5. App.vue 启动逻辑
```
onLaunch →
  logger.init() → db.init() → notification.requestPermission()
  → setTimeout 5s → updater.check(false)  // 静默检测，不干扰启动
```

### 6. vite.config.ts 的 SCSS additionalData
全局注入 `@import "@/uni.scss"` 仅注入变量（无实际 CSS 输出），各组件内可直接使用 `$color-primary` 等变量，无需手动 import。

### 7. 条件编译注意事项
UniApp 条件编译指令 `// #ifdef APP-PLUS` 必须在注释中，不能有额外空格。编译器在对应平台会保留/删除对应代码块。

---

## 业务模块说明

| 模块 | Store | View | 与 PC 端差异 |
|---|---|---|---|
| 待办 | `stores/todo.ts` | `pages/todo/index.vue` | 手势操作优化，无 v-model IPC |
| 计划 | `stores/study.ts` | `pages/study/` | 两级导航（列表→详情），非 PC 三栏 |
| 笔记 | `stores/note.ts` | `pages/note/` | 原生 textarea，防抖 800ms |
| 日程 | `stores/schedule.ts` | `pages/schedule/index.vue` | 自绘月历，非 Element Plus Calendar |
| 提醒 | 无独立 Store | `pages/reminder/index.vue` | 直接用 reminderDao |
| 账号 | `stores/account.ts` | `pages/account/index.vue` | 增加生物识别解锁 |
| 收藏 | `stores/favorite.ts` | `pages/favorite/index.vue` | 搜索本地过滤（非 IPC） |
| 设置 | 无 Store | `pages/settings/index.vue` | 热更新控制 + 日志查看 |

---

## 计划分类常量（`stores/study.ts`）

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

## 热更新服务端接口约定

```
GET /api/version
Request: { version: string, platform: string }
Response: {
  version: string,       // 新版本号，如 "1.0.1"
  versionCode: number,
  wgtUrl: string,        // wgt 文件下载地址
  md5: string,           // wgt 文件 MD5
  changelog: string,     // 更新日志
  forceUpdate: boolean,  // 是否强制更新
  isIncremental: boolean // 是否为增量包
}
```

> 修改 `utils/update.ts` 中的 `UPDATE_SERVER` 常量指向实际服务端。

---

## 关联项目

- `../dream/` — PC 端（Electron + Vue3 + TypeScript）
- `../dream-chrome-extension/` — Chrome 插件
- `../dream-mobile-base/` — 移动端基座（规划中）
