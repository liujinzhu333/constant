# Dream（PC 端）— AI Agent 协作指南

> 最后更新：2026-05-18

## 项目概述

基于 **Electron 29 + Vue 3 + Vite + TypeScript** 的 PC 端主应用。  
内置 SQLite 数据库和 HTTP Server，是整个系统的数据中枢。

- 平台：macOS 10.12+（arm64）、Windows 10+
- 当前版本：1.0.4
- userData 目录：macOS 生产 `~/Library/Application Support/dream/`，开发 `~/Library/Application Support/dream-dev/`

**功能模块文档** → 见 [`../agent_doc/`](../agent_doc/)

---

## 目录结构

```
dream/
├── electron/
│   ├── main/index.ts             # 主进程入口：userData 隔离、禁用 GPU
│   ├── preload/index.ts          # contextBridge → window.dreamAPI
│   └── modules/
│       ├── storage/index.ts      # SQLite 建表、迁移守卫、AES 加密
│       ├── business/index.ts     # 所有业务 IPC 处理器
│       ├── http-server/index.ts  # HTTP REST Server（45678/45679）
│       ├── startup/index.ts      # 单例锁、窗口创建
│       ├── logger/index.ts       # 日志（按天轮转，保留 30 天）
│       ├── updater/index.ts      # 整包更新（electron-updater）
│       ├── system/index.ts       # 窗口/托盘/快捷键/系统通知
│       └── ipc/index.ts          # IPC 注册中心
├── src/
│   ├── stores/                   # Pinia Store（todo/study/note/schedule/account/favorite/member）
│   ├── views/                    # 各模块 View 组件
│   ├── utils/relationDict.ts     # 人员关联关系字典
│   └── assets/main.css           # 全局 CSS Token（暗色模式）
└── dist-web/                     # dream-web 构建产物（sync-web 脚本同步）
```

---

## 常用命令

```bash
npm run electron:dev   # 开发模式（需先在 dream-web/ 执行 npm run dev）
npm run build:mac      # 生产打包 macOS（自动先构建 dream-web）
npm run build:win      # 生产打包 Windows
npm run rebuild        # 手动重编译 better-sqlite3
npm run lint           # ESLint 自动修复
npx tsc --noEmit       # TypeScript 类型检查
```

---

## 架构要点

### IPC 通信

- 渲染进程通过 `window.dreamAPI.xxx` 调用，不能直接 `require('electron')`
- Channel 命名：`模块:操作`，如 `todo:list`、`member:add`
- **IPC 序列化**：传入 IPC 的对象必须解除 Vue 响应式，用 `JSON.parse(JSON.stringify(data))` 或展开运算符

### HTTP Server

- 端口：生产 `45678`，开发 `45679`
- 开发模式随 Electron 自动启动；生产需在设置页手动启动
- 路由层已去掉查询参数（`url.split('?')[0]`），**取查询参数必须用 `query` 对象**，不能用 `new URL()` 重新解析
- PATCH 路由：`Object.values` 前须将 `undefined` 转为 `null`，否则 better-sqlite3 报 `ERR_INVALID_ARG_TYPE`

### 数据库迁移守卫

- 新增字段在 `storage/index.ts` 的 `initDatabase()` 里用 `PRAGMA table_info` 检测后 `ALTER TABLE ADD COLUMN`
- **迁移只在重启时执行**，改完代码必须重启才生效

### 开发/生产隔离

```ts
// main/index.ts 最顶部
const isDev = !!process.env.VITE_DEV_SERVER_URL
if (isDev) app.setPath('userData', path.join(app.getPath('appData'), 'dream-dev'))
```

### 输入框性能规范

- 弹窗表单（提交时调 IPC）可直接用 `v-model`
- 实时保存场景（如笔记）必须用本地 ref + 防抖，**不能** `v-model` 绑 store
- 防抖在 view 层用 `useDebounce.ts`，不在 store action 内加

### SQLite 存储

- 单例：`StorageManager.getInstance()`，WAL 模式
- 加密密钥：`userData/.dream_key`（mode 0o600）
- restoreBackup：必须先 `close()` → `fs.copyFileSync` → `initDatabase()` 重新连接

### 其他陷阱

- `app:openExternal` 只放行 `https://`，打开本地目录用 `app:showInFolder`
- `.el-button + .el-button` 有默认 `margin-left: 12px`，多按钮容器用 `:deep(.el-button + .el-button) { margin-left: 0 }` 覆盖

---

## 设置页功能

| 功能区 | 说明 |
|---|---|
| 关于 | 版本、平台信息 |
| 更新 | 检查/下载/安装/回滚（GitHub Releases） |
| 数据 | 数据目录、备份/恢复/导入 |
| 服务地址 | HTTP Server 手动启停（端口 45678） |
| 日志 | 内嵌日志查看器（文件标签/级别着色/删除） |

---

## 更新机制

```
检查更新 → 拉取 latest-mac.yml → semver 比较
→ 下载 Dream-{version}-arm64-mac.zip
→ 确认后 quitAndInstall() 重启安装
```

发版：修改 `package.json` 版本号 → `npm run build:mac` → 上传 `release/` 全部文件到 GitHub Release（tag: vx.x.x）

首次安装（无签名）：`xattr -cr /Applications/Dream.app`

---

## 已知问题

- Electron 29 + macOS GPU 崩溃：已加 `--disable-gpu` 规避
- `SELECT mr.id as rel_id, m.*` 中 `m.*` 会覆盖别名，需显式列出字段
