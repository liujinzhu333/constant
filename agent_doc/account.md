# 账号管理模块（Account）

> 最后更新：2026-05-18

## 功能概述

安全管理各平台账号密码，密码本地 AES-256 加密存储，密钥仅存内存。

## 数据结构

### 表：`accounts`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT | UUID，主键 |
| `platform` | TEXT | 平台名称 |
| `category` | TEXT | 平台类型（见下方枚举） |
| `url` | TEXT | 平台链接，可为空 |
| `username` | TEXT | 账号名 |
| `phone` | TEXT | 手机号，可为空 |
| `email` | TEXT | 邮箱，可为空 |
| `password` | TEXT | AES-256 加密后的密文 |
| `note` | TEXT | 备注 |
| `created_at` | INTEGER | Unix 时间戳 |
| `updated_at` | INTEGER | Unix 时间戳 |

## 平台类型（category）

| 值 | 显示名 |
|---|---|
| `dev` | 开发工具 |
| `social` | 社交媒体 |
| `shopping` | 购物 |
| `finance` | 金融 |
| `game` | 游戏 |
| `work` | 工作 |
| `media` | 音视频 |
| `other` | 其他 |

## 功能特性

### 加密策略

- **密钥**：仅存在内存中，不持久化到磁盘
- **加密**：密码在渲染进程用 `CryptoJS.AES.encrypt()` 加密后存入数据库
- **解密**：读取时渲染进程用相同密钥解密
- **密钥验证**：取首条有密码的记录尝试解密，解密结果为空字符串视为密钥错误

### 布局

1. **锁屏界面**：首次进入输入主密钥验证（密钥不落盘）
2. **主界面**：左侧分类导航栏 + 右侧 Grid 卡片列表（auto-fill，最大 300px）

### 卡片信息

- 平台名、类型标签
- URL（可点击跳转 / 一键复制）
- 账号名、手机、邮箱
- 密码（默认隐藏，可显隐切换，一键复制）
- 备注

### 简洁 / 详细模式

PC 端支持一键切换：
- **详细模式**：显示所有字段
- **简洁模式**：仅显示平台名和类型标签，操作区保留复制密码按钮

## 相关文件

| 端 | 文件 |
|---|---|
| PC Store | `dream/src/stores/account.ts` |
| PC View | `dream/src/views/account/AccountView.vue` |
| Web Store | `dream-web/src/stores/account.ts` |
| Web View | `dream-web/src/views/account/AccountView.vue` |
| 主进程 IPC | `dream/electron/modules/business/index.ts`（`registerAccount`） |
| HTTP 路由 | `dream/electron/modules/http-server/index.ts` |

## IPC / HTTP API

**PC 端 IPC**
```ts
window.dreamAPI.account.list()
window.dreamAPI.account.add(data)
window.dreamAPI.account.update(id, patch)
window.dreamAPI.account.delete(id)
```

> IPC 注意：store 的 `add` / `update` 方法内必须用 `JSON.parse(JSON.stringify(data))` 解除 Vue 响应式，避免 "object could not be cloned" 错误。

**HTTP API**
```
GET    /api/accounts
POST   /api/accounts
PATCH  /api/accounts/:id
DELETE /api/accounts/:id
```
