# Dream Web（Web 前端）— AI Agent 协作指南

> 最后更新：2026-05-18

## 项目概述

基于 **Vue 3 + Vite + TypeScript + Element Plus** 的 Web 前端，PC 端（Electron 内嵌）和手机端（局域网浏览器）共用。  
数据全部通过 PC 端 HTTP Server 读写本地 SQLite，支持离线模式。

- HTTP Server 端口：生产 `45678`，开发 `45679`（vite proxy 转发）
- Dev server：`localhost:5174`

**功能模块文档** → 见 [`../agent_doc/`](../agent_doc/)

---

## 目录结构

```
dream-web/src/
├── App.vue                    # 全局入口（连接检测、store 初始化）
├── stores/
│   ├── connection.ts          # 连接状态（在线/离线/重连/同步）
│   ├── todo / study / note / schedule / account / favorite / member
│   └── member.ts              # 人员 Store
├── utils/
│   ├── api.ts                 # HTTP API 层（axios、缓存、离线感知写操作）
│   ├── offline-queue.ts       # 离线队列（持久化、回放、tempId 替换）
│   └── relationDict.ts        # 人员关联关系字典
└── views/                     # 各模块 View 组件
```

---

## 常用命令

```bash
npm run dev          # Vite dev server（localhost:5174）
npm run build        # 生产构建（产物 → dist/，由 dream/sync-web 同步到 dream/dist-web/）
npm run type-check   # TypeScript 类型检查
```

---

## 架构要点

### 数据层规范

- 所有请求通过 `utils/api.ts` 的 API 对象（`todoApi` / `memberApi` 等），**禁止**在 store 或 view 里直接调 axios
- GET 请求在线写 localStorage 缓存，离线读缓存

### 离线感知写操作

| 函数 | 在线 | 离线 |
|---|---|---|
| `offlinePost<T>` | POST 请求 | 入队 + 返回含 tempId 占位对象 |
| `offlinePatch<T>` | PATCH 请求 | 入队 + 返回本地合并结果 |
| `offlineDelete` | DELETE 请求 | 入队 + 返回 `{ ok: true }` |

- `offlinePost` 要求泛型含 `id` 字段；返回 `{ ok: true }` 的接口（如关联添加）须直接调 API，不能用 `offlinePost`
- 连接管理统一由 `ConnectionStore` 负责，各业务 store 不直接操作 `_offline` 标志

### 缓存 Key 规则

缓存 key = 请求路径含查询参数，例如：
```
/api/study/tasks?plan_id=<id>     ← 任务列表缓存 key
/api/study/plans?parent_id=null   ← 顶层计划列表
```

`offlinePatch` 内部 `listPathOf` 截取的是路径部分（无查询参数），与缓存 key 不一致。  
`toggleTask` 等操作后需手动用正确 key 更新缓存：
```ts
writeCache(`/api/study/tasks?plan_id=${planId}`, ...)
```

### 打卡模块（Study）

- 全自动打卡：当日任务全部完成 → 自动打卡；有任务未完成 → 自动撤销
- **离线时**前端本地判断，直接操作 `checkins.value`，重连后被服务端记录覆盖
- `syncProgress('top')` 会整体替换 `currentPlan.value`，之后读取其字段可能拿到旧值，需提前存入局部变量

### 笔记编辑规范

View 层必须用本地 ref + 防抖，**不能** `v-model` 直接绑 store：
```vue
const localContent = ref('')
<textarea :value="localContent" @input="onContentInput" @blur="flushSave" />
```
`saveNote` store action 不回写 `content` 字段，防止 watch 触发导致光标跳位。

### 移动端适配

- 全局弹窗在窄屏（≤768px）改为底部 sheet 样式
- 收藏/账号等卡片列表在移动端调整为单列或紧凑布局

---

## 已知问题

1. `NoteView.vue` 和 `SettingsView.vue` 存在预先存在的 TS 类型错误（待修复）
2. 离线队列回放时 tempId 替换仅覆盖 path 和 body 字符串，复杂嵌套场景可能遗漏
3. 离线打卡记录使用本地临时 id（`local_YYYY-MM-DD`），重连后被服务端真实记录覆盖
