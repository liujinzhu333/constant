# Web 端（dream-web）开发规范

> 来源：`dream-web/AGENTS.md` 架构要点  
> 最后更新：2026-05-18

---

## 数据层规范

- 所有请求通过 `utils/api.ts` 的 API 对象（`todoApi` / `memberApi` 等），**禁止**在 store 或 view 里直接调 axios
- GET 请求在线写 localStorage 缓存，离线读缓存

---

## 离线感知写操作

| 函数 | 在线 | 离线 |
|---|---|---|
| `offlinePost<T>` | POST 请求 | 入队 + 返回含 tempId 占位对象 |
| `offlinePatch<T>` | PATCH 请求 | 入队 + 返回本地合并结果 |
| `offlineDelete` | DELETE 请求 | 入队 + 返回 `{ ok: true }` |

- `offlinePost` 要求泛型含 `id` 字段；返回 `{ ok: true }` 的接口（如关联添加）须直接调 API，**不能**用 `offlinePost`
- 连接管理统一由 `ConnectionStore` 负责，各业务 store 不直接操作 `_offline` 标志

---

## 缓存 Key 规则

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

---

## 打卡模块（Study）

- 全自动打卡：当日任务全部完成 → 自动打卡；有任务未完成 → 自动撤销
- **离线时**前端本地判断，直接操作 `checkins.value`，重连后被服务端记录覆盖
- `syncProgress('top')` 会整体替换 `currentPlan.value`，之后读取其字段可能拿到旧值，需提前存入局部变量

---

## 笔记编辑规范

View 层必须用本地 ref + 防抖，**不能** `v-model` 直接绑 store：

```vue
const localContent = ref('')
<textarea :value="localContent" @input="onContentInput" @blur="flushSave" />
```

`saveNote` store action 不回写 `content` 字段，防止 watch 触发导致光标跳位。

---

## 移动端适配

- 全局弹窗在窄屏（≤768px）改为底部 sheet 样式
- 收藏/账号等卡片列表在移动端调整为单列或紧凑布局

---

## 已知问题

1. `NoteView.vue` 和 `SettingsView.vue` 存在预先存在的 TS 类型错误（待修复）
2. 离线队列回放时 tempId 替换仅覆盖 path 和 body 字符串，复杂嵌套场景可能遗漏
3. 离线打卡记录使用本地临时 id（`local_YYYY-MM-DD`），重连后被服务端真实记录覆盖
