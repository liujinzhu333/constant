# 收藏模块（Favorite）

> 最后更新：2026-05-18

## 功能概述

收藏网页链接和名人名言，支持置顶、标签、搜索，与 Chrome 插件联动。

## 数据结构

### 表：`favorites`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT | UUID，主键 |
| `type` | TEXT | `link`（链接）/ `quote`（名言） |
| `title` | TEXT | 标题（链接）/ 内容简介（名言） |
| `url` | TEXT | 网页 URL，仅 `link` 类型使用 |
| `content` | TEXT | 名言内容，仅 `quote` 类型使用 |
| `author` | TEXT | 作者 |
| `tags` | TEXT | JSON 数组字符串 |
| `is_pinned` | INTEGER | 是否置顶（0/1） |
| `created_at` | INTEGER | Unix 时间戳 |
| `updated_at` | INTEGER | Unix 时间戳 |

## 功能特性

### 布局

- **左侧导航**：全部 / 链接 / 名言 + 关键词搜索 + 刷新按钮 + 新增按钮
- **右侧内容**：Grid 卡片列表（auto-fill，minmax 260px 1fr）

### 链接卡片

- 标题（可点击跳转）、URL（可复制）
- 来源域名、标签
- 置顶、编辑、删除操作

### 名言卡片

- 橙色左边框引用样式
- 内容、作者、出处
- 置顶、编辑、删除操作

### 新增弹窗

- 类型切换显示对应字段（链接 / 名言）
- 链接失焦自动提取域名填充标题（若标题为空）

### 刷新按钮

侧边栏 header 右侧，点击重新拉取列表。Chrome 插件收藏后可手动刷新查看结果。

### 置顶

置顶收藏排在列表最前，星标区分。

### Chrome 插件联动

`dream-chrome-extension` 一键收藏当前页面，通过 HTTP POST 到 `dream` HTTP Server，在收藏列表中即可查看。

## 相关文件

| 端 | 文件 |
|---|---|
| PC Store | `dream/src/stores/favorite.ts` |
| PC View | `dream/src/views/favorite/FavoriteView.vue` |
| Web Store | `dream-web/src/stores/favorite.ts` |
| Web View | `dream-web/src/views/favorite/FavoriteView.vue` |
| Chrome 插件 | `dream-chrome-extension/` |
| 主进程 IPC | `dream/electron/modules/business/index.ts`（`registerFavorite`） |
| HTTP 路由 | `dream/electron/modules/http-server/index.ts` |

## IPC / HTTP API

**PC 端 IPC**
```ts
window.dreamAPI.favorite.list(type?, keyword?)
window.dreamAPI.favorite.add(data)
window.dreamAPI.favorite.update(id, patch)
window.dreamAPI.favorite.pin(id)
window.dreamAPI.favorite.delete(id)
```

> IPC 注意：store 的 `add` / `update` 方法内必须用 `JSON.parse(JSON.stringify(data))` 解除响应式。

**HTTP API**
```
GET    /api/favorites[?type=xxx&keyword=xxx]
POST   /api/favorites
PATCH  /api/favorites/:id
PATCH  /api/favorites/:id/pin
DELETE /api/favorites/:id
```
