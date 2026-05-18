# constant — AGENTS.md

> 最后更新：2026-05-18

## 仓库概述

**Dream 跨端个人助手系统** monorepo，包含四个子项目，共享同一个本地 SQLite 数据库（通过 PC 端 HTTP Server 提供 REST API 访问）。

## 子项目

| 目录 | 说明 | 详细文档 |
|---|---|---|
| `dream/` | PC 端：Electron + Vue 3 | [AGENTS.md](dream/AGENTS.md) |
| `dream-web/` | Web 前端：Vue 3 + Vite，PC 内嵌 & 手机浏览器共用 | [AGENTS.md](dream-web/AGENTS.md) |
| `dream-mobile-base/` | 移动端：Android WebView 壳 | [AGENTS.md](dream-mobile-base/AGENTS.md) |
| `dream-chrome-extension/` | Chrome 插件：一键收藏当前页面 | — |

## 功能模块文档

各业务模块的数据结构、功能说明、API 列表见 [`agent_doc/`](agent_doc/)：

| 文件 | 内容 |
|---|---|
| [agent_doc/overview.md](agent_doc/overview.md) | 系统总览、架构、数据流、完整 IPC & HTTP API |
| [agent_doc/todo.md](agent_doc/todo.md) | 待办模块 |
| [agent_doc/study.md](agent_doc/study.md) | 计划 + 打卡模块 |
| [agent_doc/note.md](agent_doc/note.md) | 笔记模块 |
| [agent_doc/schedule.md](agent_doc/schedule.md) | 日程模块 |
| [agent_doc/reminder.md](agent_doc/reminder.md) | 提醒模块 |
| [agent_doc/account.md](agent_doc/account.md) | 账号管理模块 |
| [agent_doc/favorite.md](agent_doc/favorite.md) | 收藏模块 |
| [agent_doc/member.md](agent_doc/member.md) | 人员管理模块 |

## 数据流

```
dream-web / dream-mobile-base / dream-chrome-extension
        │  HTTP REST
        ▼
dream（Electron 主进程 HTTP Server，port 45678）
        │
        ▼
SQLite（userData/dream.db）
```

## 端口约定

| 端口 | 用途 |
|---|---|
| `45678` | dream HTTP Server（生产） |
| `45679` | dream HTTP Server（开发） |
| `5174` | dream-web Vite dev server |
