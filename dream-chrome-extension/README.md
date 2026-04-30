# Dream 收藏 Chrome 插件

一键将当前页面收藏到 Dream 应用的「收藏」模块。

## 工作原理

- Dream 运行时会在本地启动一个 HTTP 服务（`http://127.0.0.1:45678`）
- 插件点击图标时，通过 `POST /favorite` 将当前页面的标题和 URL 发送给 Dream
- Dream 直接写入 SQLite 数据库，下次打开收藏页即可看到

## 安装方式

1. 打开 Chrome，进入 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」，选择本目录（`dream-chrome-extension/`）

## 使用方式

1. 先启动 Dream 应用（确保本地 HTTP 服务已启动）
2. 在任意网页点击工具栏的插件图标
3. 图标上出现绿色 `✓` = 收藏成功，橙色 `!` = Dream 未运行，红色 `✗` = 收藏失败

## Badge 说明

| Badge | 颜色 | 含义 |
|---|---|---|
| ✓ | 绿色 | 收藏成功 |
| ✓ | 绿色 | 已存在（同 URL 自动去重） |
| ! | 橙色 | Dream 未运行，请先启动 Dream |
| ✗ | 红色 | 页面不可收藏（新标签页等）或服务出错 |

## API 端点

| 端点 | 方法 | 说明 |
|---|---|---|
| `/ping` | GET | 心跳检测，返回 `{ ok: true, app: "Dream" }` |
| `/favorite` | POST | 新增收藏，Body: `{ type, title, url }` |
