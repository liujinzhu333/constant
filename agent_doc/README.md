# Dream 跨端个人助手系统 — Agent 文档索引

> 最后更新：2026-05-18

## 系统定位

Dream 是一个运行在本地的跨端个人助手系统。数据存储在 PC 本地 SQLite，手机/浏览器通过局域网访问 PC 的 HTTP Server 实现多端同步，无需云服务。

## 子项目

| 目录 | 技术栈 | 说明 |
|---|---|---|
| `dream/` | Electron 29 + Vue 3 + Vite + TypeScript | PC 端主应用，含 SQLite 和 HTTP Server |
| `dream-web/` | Vue 3 + Vite + TypeScript + Element Plus | Web 前端，PC 内嵌 & 手机浏览器共用 |
| `dream-mobile-base/` | Android + Kotlin + WebView | 移动端壳，加载 dream-web |
| `dream-chrome-extension/` | Chrome Extension | 一键收藏当前页面 |

## 数据流

```
dream-web / dream-mobile-base / dream-chrome-extension
        │  HTTP REST（局域网，端口 45678）
        ▼
dream（Electron 主进程 HTTP Server）
        │  IPC（contextBridge → window.dreamAPI）
        ▼
SQLite（userData/dream.db）
```

## 端口约定

| 端口 | 用途 |
|---|---|
| `45678` | HTTP Server（生产） |
| `45679` | HTTP Server（开发） |
| `5174` | dream-web Vite dev server |

---

## 文档目录

### 功能模块

| 文档 | 内容 |
|---|---|
| [overview.md](overview.md) | 完整系统总览：数据库表、IPC API、HTTP API、发版流程 |
| [todo.md](todo.md) | 待办模块 |
| [study.md](study.md) | 计划 + 打卡模块 |
| [note.md](note.md) | 笔记模块 |
| [schedule.md](schedule.md) | 日程模块 |
| [reminder.md](reminder.md) | 提醒模块 |
| [account.md](account.md) | 账号管理模块 |
| [favorite.md](favorite.md) | 收藏模块 |
| [member.md](member.md) | 人员管理模块 |

### 开发规范

| 文档 | 内容 |
|---|---|
| [rules/pc.md](rules/pc.md) | PC 端（dream）开发规范、陷阱、注意事项 |
| [rules/web.md](rules/web.md) | Web 端（dream-web）开发规范、离线机制、缓存规则 |
| [rules/mobile.md](rules/mobile.md) | 移动端（dream-mobile-base）开发规范 |
