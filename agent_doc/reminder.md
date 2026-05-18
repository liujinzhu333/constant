# 提醒模块（Reminder）

> 最后更新：2026-05-18

## 功能概述

管理待处理提醒事项，支持推迟、系统通知。

## 数据结构

### 表：`reminders`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT | UUID，主键 |
| `title` | TEXT | 标题 |
| `remind_at` | INTEGER | 提醒时间（Unix 时间戳） |
| `status` | TEXT | `pending`（待处理）/ `done`（已完成） |
| `note` | TEXT | 备注 |
| `created_at` | INTEGER | Unix 时间戳 |
| `updated_at` | INTEGER | Unix 时间戳 |

## 功能特性

- **两 Tab**：待处理 / 已完成
- **推迟**：延后 10 分钟
- **完成**：标记为已完成，移入已完成 Tab
- **系统通知**：到达提醒时间时触发系统通知（依赖 `window.dreamAPI.notification.send`）
- **限制**：目前无定时自动触发机制，需手动进入提醒页查看；到时通知需应用在运行中

## 相关文件

| 端 | 文件 |
|---|---|
| PC View | `dream/src/views/reminder/ReminderView.vue` |
| Web View | `dream-web/src/views/reminder/ReminderView.vue` |
| 主进程 IPC | `dream/electron/modules/business/index.ts`（`registerReminder`） |
| HTTP 路由 | `dream/electron/modules/http-server/index.ts` |

> 提醒模块无独立 Pinia Store，数据直接在 View 内管理。

## IPC / HTTP API

**PC 端 IPC**
```ts
window.dreamAPI.reminder.list()
window.dreamAPI.reminder.add(data)
window.dreamAPI.reminder.dismiss(id)    // 标记完成
window.dreamAPI.reminder.snooze(id)    // 推迟 10 分钟
window.dreamAPI.reminder.delete(id)
```

**HTTP API**（dream-web 访问）
```
GET    /api/reminders
POST   /api/reminders
PATCH  /api/reminders/:id/dismiss
PATCH  /api/reminders/:id/snooze
DELETE /api/reminders/:id
```
