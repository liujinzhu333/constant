# 日程模块（Schedule）

> 最后更新：2026-05-18

## 功能概述

月历视图管理日程安排，支持全天/时间段日程、颜色标记。

## 数据结构

### 表：`schedules`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT | UUID，主键 |
| `title` | TEXT | 标题 |
| `start_time` | TEXT | 开始时间（ISO 字符串） |
| `end_time` | TEXT | 结束时间（ISO 字符串） |
| `is_all_day` | INTEGER | 是否全天（0/1） |
| `color` | TEXT | 颜色标记（十六进制） |
| `note` | TEXT | 备注 |
| `created_at` | INTEGER | Unix 时间戳 |
| `updated_at` | INTEGER | Unix 时间戳 |

## 功能特性

- **月历视图**：展示当月所有日程，有日程的日期有标记点
- **日程列表**：点击日期，右侧显示当日日程详情
- **全天日程**：`is_all_day = 1`，不需要具体时间
- **颜色标记**：新建时可选颜色区分不同类型日程
- **操作**：新建、删除（二次确认），暂不支持编辑

## 相关文件

| 端 | 文件 |
|---|---|
| PC Store | `dream/src/stores/schedule.ts` |
| PC View | `dream/src/views/schedule/ScheduleView.vue` |
| Web Store | `dream-web/src/stores/schedule.ts` |
| Web View | `dream-web/src/views/schedule/ScheduleView.vue` |
| 主进程 IPC | `dream/electron/modules/business/index.ts`（`registerSchedule`） |
| HTTP 路由 | `dream/electron/modules/http-server/index.ts` |

## IPC / HTTP API

**PC 端 IPC**
```ts
window.dreamAPI.schedule.list(start, end)
window.dreamAPI.schedule.add(data)
window.dreamAPI.schedule.update(id, patch)
window.dreamAPI.schedule.delete(id)
```

**HTTP API**
```
GET    /api/schedules?start=xxx&end=xxx
POST   /api/schedules
PATCH  /api/schedules/:id
DELETE /api/schedules/:id
```
