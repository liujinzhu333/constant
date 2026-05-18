# PC 端（dream）开发规范

> 来源：`dream/AGENTS.md` 架构要点  
> 最后更新：2026-05-18

---

## IPC 通信

- 渲染进程通过 `window.dreamAPI.xxx` 调用，**不能**直接 `require('electron')`
- Channel 命名：`模块:操作`，如 `todo:list`、`member:add`
- **IPC 序列化**：传入 IPC 的对象必须解除 Vue 响应式，用 `JSON.parse(JSON.stringify(data))` 或展开运算符

---

## HTTP Server

- 端口：生产 `45678`，开发 `45679`
- 开发模式随 Electron 自动启动；生产需在设置页手动启动
- 路由层已去掉查询参数（`url.split('?')[0]`），**取查询参数必须用 `query` 对象**，不能用 `new URL()` 重新解析
- PATCH 路由：`Object.values` 前须将 `undefined` 转为 `null`，否则 better-sqlite3 报 `ERR_INVALID_ARG_TYPE`

---

## 数据库迁移守卫

- 新增字段在 `storage/index.ts` 的 `initDatabase()` 里用 `PRAGMA table_info` 检测后 `ALTER TABLE ADD COLUMN`
- **迁移只在重启时执行**，改完代码必须重启才生效

---

## 开发/生产隔离

```ts
// main/index.ts 最顶部
const isDev = !!process.env.VITE_DEV_SERVER_URL
if (isDev) app.setPath('userData', path.join(app.getPath('appData'), 'dream-dev'))
```

- macOS 生产 userData：`~/Library/Application Support/dream/`
- macOS 开发 userData：`~/Library/Application Support/dream-dev/`

---

## 输入框性能规范

- 弹窗表单（提交时调 IPC）可直接用 `v-model`
- 实时保存场景（如笔记）必须用本地 ref + 防抖，**不能** `v-model` 绑 store
- 防抖在 view 层用 `useDebounce.ts`，不在 store action 内加

---

## SQLite 存储

- 单例：`StorageManager.getInstance()`，WAL 模式
- 加密密钥：`userData/.dream_key`（mode 0o600）
- restoreBackup 流程：必须先 `close()` → `fs.copyFileSync` → `initDatabase()` 重新连接

---

## 其他陷阱

- `app:openExternal` 只放行 `https://`，打开本地目录用 `app:showInFolder`
- `.el-button + .el-button` 有默认 `margin-left: 12px`，多按钮容器用 `:deep(.el-button + .el-button) { margin-left: 0 }` 覆盖

---

## 已知问题

- Electron 29 + macOS GPU 崩溃：已加 `--disable-gpu` 规避
- `SELECT mr.id as rel_id, m.*` 中 `m.*` 会覆盖别名，需显式列出字段
