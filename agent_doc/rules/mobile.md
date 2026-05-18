# 移动端（dream-mobile-base）开发规范

> 来源：`dream-mobile-base/AGENTS.md`  
> 最后更新：2026-05-18

---

## 项目定位

Android 原生壳应用，职责单一：用 WebView 加载远程 Web 应用 URL。  
**不包含任何业务逻辑**，所有功能均由 dream-web 层实现。

---

## MainActivity 实现规范

`MainActivity.kt` 是应用唯一的 Activity，负责：

1. **锁定竖屏**：`requestedOrientation = SCREEN_ORIENTATION_PORTRAIT`
2. **初始化 WebView**：开启 JS、DOM Storage，禁用缩放
3. **加载远程应用**：调用 `webView.loadUrl(appUrl)`
4. **返回键处理**：WebView 有历史时回退页面，否则退出
5. **SSL 放行**：重写 `onReceivedSslError`，对所有证书错误直接 `proceed()`（用于兼容内网自签名证书）

**修改应用 URL：**

```kotlin
// MainActivity.kt 第 18 行
private val appUrl = "https://your-new-url.com/#/"
```

---

## 网络安全配置（`network_security_config.xml`）

- `cleartextTrafficPermitted="true"`：允许全局 HTTP 明文请求
- 信任锚包含 `system` + `user`：兼容系统证书与用户安装的自签名证书

---

## 注意事项

- SSL 证书校验已全局关闭（`onReceivedSslError` 无条件 proceed），仅适用于内网/开发环境，**上线公网时应收紧**
- Debug 包 applicationId 后缀为 `.debug`，可与 release 包共存于同一设备
- Chrome DevTools 远程调试仅在 Debug 构建中启用
