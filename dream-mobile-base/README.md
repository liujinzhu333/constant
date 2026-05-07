# dream-mobile-base — Dream 移动端原生基座

Android 原生壳（Kotlin），内嵌 WebView，通过 JSBridge 向 H5 业务包暴露原生能力。

## 架构

```
WebView (H5 业务包)
      ↕ JSBridge (window.DreamBridge.call)
BridgeDispatcher
  ├── SQLiteBridge     → 原生 SQLite 读写
  ├── NotificationBridge → 本地通知 / 精确闹钟
  ├── BiometricBridge  → 指纹 / 面容 ID
  ├── FileBridge       → 沙盒文件读写
  └── UpdateBridge     → H5 热更新（下载 zip / 解压 / 重载）
```

## 项目结构

```
app/src/main/
├── java/com/dream/mobile/
│   ├── DreamApplication.kt      # Application，初始化通知 Channel
│   ├── MainActivity.kt          # 主界面，WebView 全屏 + 边到边
│   ├── bridge/
│   │   ├── BridgeDispatcher.kt  # JSBridge 调度中心
│   │   └── BaseBridge.kt        # 所有 Bridge 基类
│   ├── db/
│   │   └── SQLiteBridge.kt      # SQLite + DreamDBHelper（建表 DDL）
│   ├── notification/
│   │   ├── NotificationBridge.kt
│   │   ├── AlarmReceiver.kt     # 闹钟触发接收器
│   │   └── BootReceiver.kt      # 开机恢复闹钟
│   ├── biometric/
│   │   └── BiometricBridge.kt
│   ├── file/
│   │   └── FileBridge.kt
│   └── update/
│       ├── UpdateBridge.kt      # 热更新逻辑
│       └── UpdateService.kt     # 前台服务（下载进度通知）
├── assets/www/
│   ├── index.html               # 内置 H5 占位页（含 Bridge 测试）
│   └── version.json             # 内置版本号
├── res/
│   ├── layout/activity_main.xml
│   ├── values/{strings,themes}.xml
│   └── xml/network_security_config.xml
└── AndroidManifest.xml
```

## JSBridge 调用协议

### H5 → 原生

```js
window.DreamBridge.call(JSON.stringify({
  id: 'unique-id',      // 请求 ID
  module: 'sqlite',     // 模块：sqlite / notification / biometric / file / update
  method: 'query',      // 方法名
  params: { ... }       // 参数
}))
```

### 原生 → H5（回调）

```js
window.__dreamBridgeCallback__({
  id: 'unique-id',
  ok: true,
  data: { ... },   // 成功数据
  error: ''        // 失败信息
})
```

### 原生 → H5（事件推送）

```js
window.addEventListener('dream:ready', e => { /* 平台就绪 */ })
window.addEventListener('dream:insets', e => { /* 安全区域 insets */ })
window.addEventListener('update:progress', e => { /* 下载进度 */ })
```

## 开发

1. 用 Android Studio 打开本目录
2. 连接设备或启动模拟器（API 28+）
3. Run → app
4. 启动后 WebView 加载 `assets/www/index.html`，点击「测试 Bridge」验证 SQLite 可用

## H5 开发调试

在 `MainActivity.kt` 中将 `loadH5()` 改为加载本地开发服务器：

```kotlin
// 开发时临时替换
webView.loadUrl("http://10.0.2.2:5173/")  // 模拟器访问宿主机
// webView.loadUrl("http://192.168.x.x:5173/")  // 真机访问同局域网
```

Chrome DevTools 远程调试：`chrome://inspect`

## 热更新流程

```
H5 检测新版本（GET /api/version）
  → bridge.call('update', 'download', { url, md5 })   // 下载 zip，上报进度
  → bridge.call('update', 'apply', {})                // 解压到 h5_update/
  → bridge.call('update', 'reload', {})               // WebView 重载新包
```
