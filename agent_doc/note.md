# 笔记模块（Note）

> 最后更新：2026-05-18

## 功能概述

纯文本笔记管理，支持搜索、置顶、防抖自动保存。

## 数据结构

### 表：`notes`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT | UUID，主键 |
| `title` | TEXT | 标题 |
| `content` | TEXT | 内容（纯文本） |
| `is_pinned` | INTEGER | 是否置顶（0/1） |
| `created_at` | INTEGER | Unix 时间戳 |
| `updated_at` | INTEGER | Unix 时间戳 |

## 功能特性

- **两栏布局**：左侧笔记列表（含搜索框）+ 右侧编辑区
- **搜索**：关键词搜索标题和内容，防抖 400ms
- **编辑**：纯文本，防抖 800ms 自动保存，失焦立即保存（`flushSave`）
- **置顶**：置顶笔记排在列表最前
- **删除**：二次确认

### 编辑器特殊规则

View 层必须用本地 ref 绑定 textarea，不能直接绑 store：
```vue
<!-- 正确 -->
const localContent = ref('')
<textarea :value="localContent" @input="onContentInput" @blur="flushSave" />
```
`saveNote` store action 不回写 `content` 字段，防止触发 watch 导致光标跳位。

## 相关文件

| 端 | 文件 |
|---|---|
| PC Store | `dream/src/stores/note.ts` |
| PC View | `dream/src/views/note/NoteView.vue` |
| Web Store | `dream-web/src/stores/note.ts` |
| Web View | `dream-web/src/views/note/NoteView.vue` |
| 主进程 IPC | `dream/electron/modules/business/index.ts`（`registerNote`） |
| HTTP 路由 | `dream/electron/modules/http-server/index.ts` |

## IPC / HTTP API

**PC 端 IPC**
```ts
window.dreamAPI.note.list(keyword?)
window.dreamAPI.note.get(id)
window.dreamAPI.note.add(data)
window.dreamAPI.note.update(id, patch)
window.dreamAPI.note.delete(id)
```

**HTTP API**
```
GET    /api/notes[?keyword=xxx]
GET    /api/notes/:id
POST   /api/notes
PATCH  /api/notes/:id
DELETE /api/notes/:id
```
