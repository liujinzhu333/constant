# 待办模块（Todo）

> 最后更新：2026-05-18

## 功能概述

管理个人待办事项，支持优先级、截止日期、状态筛选。

## 数据结构

### 表：`todos`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT | UUID，主键 |
| `title` | TEXT | 标题 |
| `status` | TEXT | `todo`（待完成）/ `done`（已完成） |
| `priority` | TEXT | `high` / `medium` / `low` |
| `due_date` | TEXT | 截止日期（YYYY-MM-DD），可为空 |
| `tags` | TEXT | JSON 数组字符串，暂未在 UI 使用 |
| `created_at` | INTEGER | Unix 时间戳 |
| `updated_at` | INTEGER | Unix 时间戳 |

## 功能特性

- **优先级**：高 / 中 / 低，新建默认中
- **截止日期**：可选，支持按日期排序
- **状态**：待完成 / 已完成，支持一键切换
- **筛选**：全部 / 待完成 / 已完成
- **删除**：二次确认

## 相关文件

| 端 | 文件 |
|---|---|
| PC Store | `dream/src/stores/todo.ts` |
| PC View | `dream/src/views/todo/TodoView.vue` |
| Web Store | `dream-web/src/stores/todo.ts` |
| Web View | `dream-web/src/views/todo/TodoView.vue` |
| 主进程 IPC | `dream/electron/modules/business/index.ts`（`registerTodo`） |
| HTTP 路由 | `dream/electron/modules/http-server/index.ts` |

## IPC / HTTP API

**PC 端 IPC**
```ts
window.dreamAPI.todo.list()
window.dreamAPI.todo.add(data)
window.dreamAPI.todo.update(id, patch)
window.dreamAPI.todo.done(id)
window.dreamAPI.todo.undone(id)
window.dreamAPI.todo.delete(id)
```

**HTTP API**
```
GET    /api/todos
POST   /api/todos
PATCH  /api/todos/:id
DELETE /api/todos/:id
```
