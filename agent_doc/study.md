# 计划模块（Study）

> 最后更新：2026-05-18

## 功能概述

管理学习/工作/生活等各类计划，支持子计划、任务清单、自动打卡。

## 数据结构

### 表：`study_plans`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT | UUID，主键 |
| `title` | TEXT | 计划名称 |
| `category` | TEXT | 类型：`study` / `work` / `life` / `fitness` / `finance` |
| `parent_id` | TEXT | 父计划 ID，顶层计划为 NULL |
| `description` | TEXT | 描述 |
| `total_tasks` | INTEGER | 总任务数（自动同步） |
| `done_tasks` | INTEGER | 已完成任务数（自动同步） |
| `checkin_enabled` | INTEGER | 是否开启打卡（0/1） |
| `checkin_goal` | TEXT | 打卡目标文字描述 |
| `checkin_target_days` | INTEGER | 目标天数 |
| `created_at` | INTEGER | Unix 时间戳 |
| `updated_at` | INTEGER | Unix 时间戳 |

### 表：`study_tasks`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT | UUID，主键 |
| `plan_id` | TEXT | 所属计划 ID |
| `title` | TEXT | 任务名称 |
| `status` | TEXT | `todo` / `done` |
| `created_at` | INTEGER | Unix 时间戳 |
| `updated_at` | INTEGER | Unix 时间戳 |

### 表：`study_checkins`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT | UUID，主键 |
| `plan_id` | TEXT | 所属计划 ID |
| `date` | TEXT | 打卡日期（YYYY-MM-DD） |
| `note` | TEXT | 备注 |
| `created_at` | INTEGER | Unix 时间戳 |

## 计划类型

| 值 | 显示名 |
|---|---|
| `study` | 学习 |
| `work` | 工作 |
| `life` | 生活 |
| `fitness` | 健身 |
| `finance` | 财务 |

## 功能特性

### 三栏布局（PC 端）

- **左栏**：类型筛选 + 顶层计划列表
- **中栏**：计划详情 + 任务清单 + 子计划列表
- **右栏**：子计划任务详情

### 子计划

- 顶层计划 `parent_id = NULL`，子计划 `parent_id = 顶层计划 ID`
- 子计划与顶层计划共享相同数据结构
- 进度独立统计

### 任务清单

- 每个计划（含子计划）有独立任务列表
- 任务完成后自动同步计划进度（`total_tasks` / `done_tasks`）
- 支持新增、删除，不支持编辑标题

### 自动打卡

- 每个计划独立开关（`checkin_enabled`）
- **全自动**：当日任务全部完成 → 自动写入打卡记录；有任务恢复未完成 → 自动撤销当日打卡
- 无手动打卡按钮
- 展示：热力图（近 3 个月）+ 连续打卡天数 + 今日状态徽章
- **离线时**：前端本地判断并直接操作 `checkins.value`，重连后被服务端记录覆盖

## 相关文件

| 端 | 文件 |
|---|---|
| PC Store | `dream/src/stores/study.ts` |
| PC View | `dream/src/views/study/StudyView.vue` |
| Web Store | `dream-web/src/stores/study.ts` |
| Web View | `dream-web/src/views/study/StudyView.vue` |
| 主进程 IPC | `dream/electron/modules/business/index.ts`（`registerStudy`） |
| HTTP 路由 | `dream/electron/modules/http-server/index.ts` |

## IPC / HTTP API

**PC 端 IPC**
```ts
window.dreamAPI.study.planList(parentId?, category?)
window.dreamAPI.study.planAdd(data)
window.dreamAPI.study.planUpdate(id, patch)
window.dreamAPI.study.planDelete(id)
window.dreamAPI.study.subPlanList(parentId)
window.dreamAPI.study.taskList(planId)
window.dreamAPI.study.taskAdd(data)
window.dreamAPI.study.taskDone(id, planId)     // 触发 tryAutoCheckin
window.dreamAPI.study.taskUndone(id, planId)   // 触发 tryRemoveAutoCheckin
window.dreamAPI.study.taskDelete(id, planId)
window.dreamAPI.study.checkinList(planId, months)
```

**HTTP API**
```
GET    /api/study/plans?parent_id=null[&category=xxx]
POST   /api/study/plans
PATCH  /api/study/plans/:id
DELETE /api/study/plans/:id

GET    /api/study/tasks?plan_id=xxx
POST   /api/study/tasks
PATCH  /api/study/tasks/:id    ← 状态变更时触发 tryAutoCheckin
DELETE /api/study/tasks/:id

GET    /api/study/checkins?plan_id=xxx[&months=3]
```
