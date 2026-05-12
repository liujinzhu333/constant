# Dream Web — AI Agent 协作指南

> 最后更新：2026-05-08（重命名 dream-mobile → dream-web，架构升级为单一 Web App）

## 项目概述

Dream Web 是 **Dream 跨端个人助手系统的唯一前端 UI**，基于 **Vue 3 + Vite + TypeScript + Vant** 构建。  
PC 端（Electron）和手机端共用本项目，数据全部通过 PC 端 HTTP Server 读写本地 SQLite。

- **平台支持**：PC（Electron 渲染进程加载 localhost:45678）/ 手机浏览器（局域网 IP:45678）
- **HTTP Server 端口**：生产 `45678`，开发 `45679`（开发时 vite proxy 指向 45679）
- **当前版本**：1.0.0
- **数据源**：PC 端 SQLite（`dream.db`），通过 REST API 访问

---

## 目录结构

```
dream-web/
├── src/
│   ├── App.vue               # 全局入口（DB/日志/通知/热更新初始化）
│   ├── main.ts               # Vue 入口（Pinia + dayjs + uview-plus）
│   ├── uni.scss              # 全局 CSS Token + uview-plus 主题变量
│   ├── manifest.json         # App 权限配置
│   ├── pages.json            # 路由 + TabBar（5 主Tab）
│   ├── env.d.ts              # 全局类型（__APP_VERSION__、plus API）
│   ├── pages/                # 业务页面
│   ├── stores/               # Pinia Store（6 个）
│   ├── utils/                # 基础能力层
│   │   ├── db.ts             # SQLite DAO（三端适配）
│   │   ├── crypto.ts         # AES-256
│   │   ├── logger.ts         # 日志（App 按天轮转）
│   │   ├── notification.ts   # 多端通知
│   │   └── update.ts         # wgt 热更新
│   └── composables/
│       └── useDebounce.ts    # 防抖
├── vite.config.ts            # 路径别名 + __APP_VERSION__
├── tsconfig.json
└── package.json
```

---

## 常用命令

```bash
# H5 开发（浏览器调试）
npm run dev:h5

# 微信小程序开发
npm run dev:mp-weixin

# 生产构建 H5
npm run build:h5

# 生产构建微信小程序
npm run build:mp-weixin

# App 打包：需 HBuilderX 导入本目录

# TypeScript 类型检查
npm run type-check
```

---

## 架构要点

### 数据层（三端适配）

所有数据操作通过 `utils/db.ts` 中的 DAO 函数，内部按条件编译适配：

```ts
// APP-PLUS → plus.sqlite（原生 SQLite）
// H5       → localStorage 模拟（调试用）
// MP-WEIXIN→ KV 存储降级
```

不要在 store 或页面中直接调用 `plus.sqlite`，统一通过 DAO 层：
```ts
import { todoDao } from '../utils/db'
const todos = await todoDao.list()
```

### 页面与 Store 通信

- Store 调用 DAO，页面调用 Store action
- 严禁页面直接调用 DAO（除 `reminder/index.vue` 等轻量页面）
- uni-popup 弹窗内的表单用 `v-model` 绑本地 ref，提交时才调 Store

### 笔记编辑规范（重要）

`edit.vue` 中必须用本地 ref 绑 textarea，不能直接绑 store：

```vue
<!-- 正确 -->
const localContent = ref('')
<textarea :value="localContent" @input="onContentInput" @blur="flushSave" />

<!-- 错误：store 回写会导致光标跳位 -->
<textarea v-model="noteStore.currentNote.content" />
```

`saveNote` Store action 不回写 `content` 字段（PC 端踩坑记录 #4）。

### 条件编译规范

```ts
// #ifdef APP-PLUS
// App 端专有代码
// #endif

// #ifndef APP-PLUS
// 非 App 端代码（H5 + 小程序）
// #endif

// #ifdef H5
// H5 专有
// #endif

// #ifdef MP-WEIXIN
// 微信小程序专有
// #endif
```

### CSS / SCSS 规范

- 全局 `uni.scss` 变量自动注入（vite.config.ts additionalData），无需手动 import
- 所有尺寸用 `rpx`（适配多机型），字号参考 `$font-sm` / `$font-md` 等变量
- 组件 `<style lang="scss" scoped>`
- 间距优先使用 `$spacing-*` 变量

### 安全规范

- SQL 字段更新必须走白名单过滤（见 `db.ts` 各 DAO update 方法中的 `ALLOWED` Set）
- 账号密码必须通过 `cryptoUtil.encrypt()` 加密后再存入数据库
- 密钥不持久化，仅保存在内存（`cryptoUtil.setKey(key)`）

---

## 业务模块说明

### 待办（Todo）
- **Store**：`stores/todo.ts` | **View**：`pages/todo/index.vue`
- 优先级（高/中/低）、截止日期、状态筛选（全部/待完成/已完成）

### 计划（Study）
- **Store**：`stores/study.ts` | **View**：`pages/study/index.vue` + `detail.vue`
- 5 种类型：学习/工作/生活/健身/财务（`PLAN_CATEGORIES`）
- 支持子计划（parent_id 字段）

### 笔记（Note）
- **Store**：`stores/note.ts` | **View**：`pages/note/index.vue` + `edit.vue`
- 搜索防抖 400ms，编辑防抖 800ms，失焦立即保存（flushSave）
- saveNote 不回写 content（防光标跳位）

### 日程（Schedule）
- **Store**：`stores/schedule.ts` | **View**：`pages/schedule/index.vue`
- 自绘月历（42格），markedDates 标记有日程的日期

### 提醒（Reminder）
- 无独立 Store | **View**：`pages/reminder/index.vue`
- 待处理/已完成 Tab，推迟10分钟，系统通知

### 账号管理（Account）
- **Store**：`stores/account.ts` | **View**：`pages/account/index.vue`
- 锁屏界面 → 密钥验证（+ 生物识别）→ 账号列表
- 密码 AES-256 加密，密钥内存持有

### 收藏（Favorite）
- **Store**：`stores/favorite.ts` | **View**：`pages/favorite/index.vue`
- type 区分 link / quote，置顶排序

### 设置
- 无 Store | **View**：`pages/settings/index.vue`
- 热更新控制（Wi-Fi 优先、检测、下载、安装）
- 日志查看（最后50行）
- 各功能快捷导航

---

## 已知问题 & 待办

1. App 端打包依赖 HBuilderX（命令行工具支持有限）
2. H5 端 localStorage 模拟仅供调试，SQL 解析为简化实现
3. 微信小程序端数据层需接入云开发（当前仅 stub）
4. TabBar 图标 `static/tabbar/` 需替换为真实 PNG 图标
5. 账号页 `unlock.vue` 待实现（目前直接在 index.vue 处理）
6. `update.ts` 的 `UPDATE_SERVER` 需替换为真实服务端地址
