# 人员管理模块（Member）

> 最后更新：2026-05-18

## 功能概述

管理人际关系网络，记录联系人基本信息、经历时间线、双向关联关系（含正反向称谓）。

## 数据结构

### 表：`members`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT | UUID，主键 |
| `name` | TEXT | 姓名 |
| `nickname` | TEXT | 昵称，可为空 |
| `gender` | TEXT | `male` / `female` / `unknown` |
| `relation` | TEXT | 关系分类（见下方枚举） |
| `relation_title` | TEXT | 具体称谓，如"外婆"，可为空 |
| `birth_date` | TEXT | 公历生日（YYYY-MM-DD），可为空 |
| `birth_lunar` | TEXT | 农历生日（如"正月初一"），可为空 |
| `phone` | TEXT | 电话，可为空 |
| `email` | TEXT | 邮箱，可为空 |
| `tags` | TEXT | JSON 数组字符串 |
| `note` | TEXT | 备注 |
| `avatar_color` | TEXT | 头像背景色（十六进制） |
| `created_at` | INTEGER | Unix 时间戳 |
| `updated_at` | INTEGER | Unix 时间戳 |

### 表：`member_events`（经历时间线）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT | UUID，主键 |
| `member_id` | TEXT | 所属人员 ID |
| `event_date` | TEXT | 日期（YYYY-MM-DD 或自由描述） |
| `title` | TEXT | 事件标题 |
| `content` | TEXT | 详情，可为空 |
| `created_at` | INTEGER | Unix 时间戳 |

### 表：`member_relations`（双向关联）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT | UUID，主键 |
| `from_id` | TEXT | 发起方人员 ID |
| `to_id` | TEXT | 目标方人员 ID |
| `label` | TEXT | 发起方叫目标方的称谓（如"父亲"） |
| `reverse_label` | TEXT | 目标方叫发起方的称谓（如"儿子"） |
| `created_at` | INTEGER | Unix 时间戳 |

约束：`UNIQUE(from_id, to_id)`，`INSERT OR IGNORE` 保证幂等。

## 关系分类（relation）

| 值 | 显示名 |
|---|---|
| `family` | 直系 |
| `relative` | 亲戚 |
| `friend` | 朋友 |
| `colleague` | 同事 |
| `other` | 其他 |

## 功能特性

### 三栏布局

- **左栏**：关系分类筛选 + 标签筛选 + 搜索（姓名/称谓）
- **中栏**：人员卡片列表（头像、姓名、昵称、关系标签、称谓、标签）
- **右栏**：人员详情（基本信息 + 关联人员 + 经历时间线）

### 全局标签

标签通过聚合所有人员的 `tags` 字段去重得到，用于左栏标签筛选。

### 关联人员（双向）

- 添加关联时，服务端用 `db.transaction()` 同时插入 A→B 和 B→A 两条记录（`label` / `reverse_label` 互换）
- 前端只发一次 POST，服务端保证双向同步
- 删除关联同样双向删除

### 关联弹窗交互

1. **选择人员**：下拉搜索
2. **关系大类**：胶囊 Tab 选择（直系亲属 / 旁系亲属 / 姻亲 / 社交 / 职场）
3. **选择关系**：大类下的关系组下拉（如"父母/子女"、"兄弟"）
4. **我叫 TA**：该关系组所有 label 下拉，选中后自动填入反向称谓
5. **TA 叫我**：`el-select filterable allow-create`，候选项为该关系组所有 label 去重，可手动输入自定义称谓
6. 未选关系组时退化为文本输入兜底（TA 叫我同样提供全字典候选下拉）

### 关系字典

文件：`dream-web/src/utils/relationDict.ts` / `dream/src/utils/relationDict.ts`（双端内容相同）

- 5 大类，约 20 个关系组，每组若干称谓对（`label` + `reverse`）
- 每个概念只保留一个代表称谓（已去除同义重复项）
- 导出：`RELATION_DICT`、`RELATION_CATEGORIES`、`RELATION_DICT_BY_CATEGORY`、`ALL_REVERSE_LABELS`、`inferReverseLabel()`

### 经历时间线

- 独立子表 `member_events`
- 支持新增（日期 + 标题 + 详情）、删除
- 按时间线展示，日期支持自由描述（如"2020年春"）

## 相关文件

| 端 | 文件 |
|---|---|
| PC Store | `dream/src/stores/member.ts` |
| PC View | `dream/src/views/member/MemberView.vue` |
| PC 关系字典 | `dream/src/utils/relationDict.ts` |
| Web Store | `dream-web/src/stores/member.ts` |
| Web View | `dream-web/src/views/member/MemberView.vue` |
| Web 关系字典 | `dream-web/src/utils/relationDict.ts` |
| Web API | `dream-web/src/utils/api.ts`（`memberApi` / `memberEventApi` / `memberRelationApi`） |
| 主进程存储 | `dream/electron/modules/storage/index.ts`（建表） |
| 主进程 IPC | `dream/electron/modules/business/index.ts`（`registerMember`） |
| HTTP 路由 | `dream/electron/modules/http-server/index.ts` |
| PC preload | `dream/electron/preload/index.ts`（contextBridge member 部分） |

## IPC / HTTP API

**PC 端 IPC**
```ts
window.dreamAPI.member.list(filter?)
window.dreamAPI.member.get(id)
window.dreamAPI.member.add(data)
window.dreamAPI.member.update(id, patch)
window.dreamAPI.member.delete(id)

window.dreamAPI.member.eventList(memberId)
window.dreamAPI.member.eventAdd(data)
window.dreamAPI.member.eventDelete(id)

window.dreamAPI.member.relationList(memberId)
window.dreamAPI.member.relationAdd({ from_id, to_id, label, reverse_label })  // 服务端双向写入
window.dreamAPI.member.relationDelete(fromId, toId)                            // 双向删除
```

**HTTP API**
```
GET    /api/members[?relation=xxx&tag=xxx&keyword=xxx]
GET    /api/members/:id
POST   /api/members
PATCH  /api/members/:id
DELETE /api/members/:id

GET    /api/members/:id/events
POST   /api/members/:id/events
DELETE /api/members/events/:id

GET    /api/members/:id/relations
POST   /api/members/relations          ← 服务端 transaction 双向写入
DELETE /api/members/relations/:from_id/:to_id   ← 双向删除
```

## 已知问题 & 注意事项

- 建表语句在 `storage/index.ts` 的 `initDatabase()` 中，**需重启 Electron 才能生效**
- HTTP Server 路由中查询参数须从 `query` 对象取，不能用 `new URL()` 重新解析（路由层已去掉查询参数）
- `SELECT mr.id as rel_id, m.*` 中 `m.*` 会覆盖 `rel_id` 别名，应显式列出字段
- `memberRelationApi.add()` 返回 `{ ok: true }`，不含 `id` 字段，不能使用 `offlinePost`（要求泛型含 `id`）
