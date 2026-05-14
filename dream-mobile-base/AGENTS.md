# dream-mobile-base — AGENTS.md

## 项目概述

Android 原生壳应用，职责单一：用 WebView 加载指定的远程 Web 应用 URL，作为跨平台个人助手系统的移动端载体。不包含任何业务逻辑，所有功能均由 Web 层实现。

---

## 技术栈

| 项目 | 版本/说明 |
|------|-----------|
| 语言 | Kotlin |
| 最低 SDK | 28（Android 9） |
| 目标 SDK | 35（Android 15） |
| 编译 SDK | 35 |
| JVM 目标 | 17 |
| 构建工具 | Gradle + Kotlin DSL |

---

## 目录结构

```
dream-mobile-base/
├── app/
│   ├── build.gradle.kts                        # 模块构建配置
│   ├── proguard-rules.pro                      # 混淆规则
│   └── src/main/
│       ├── AndroidManifest.xml                 # 权限声明、组件注册
│       ├── java/com/dream/mobile/
│       │   ├── DreamApplication.kt             # Application 入口（空壳）
│       │   └── MainActivity.kt                 # 主 Activity，WebView 宿主
│       └── res/
│           ├── layout/activity_main.xml        # 布局：全屏 WebView
│           ├── values/
│           │   ├── strings.xml                 # 应用名称
│           │   └── themes.xml                  # 无 ActionBar 主题
│           └── xml/
│               └── network_security_config.xml # 网络安全配置
├── build.gradle.kts                            # 根构建配置
├── settings.gradle.kts                         # 项目设置
└── gradle.properties                           # JVM 参数等
```

---

## 核心文件说明

### `MainActivity.kt`

应用唯一的 Activity，负责：

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

### `network_security_config.xml`

- `cleartextTrafficPermitted="true"`：允许全局 HTTP 明文请求
- 信任锚包含 `system` + `user`：兼容系统证书与用户安装的自签名证书

### `themes.xml`

使用 `Theme.MaterialComponents.DayNight.NoActionBar`，状态栏/导航栏设为白色，WebView 从状态栏下方开始渲染（`fitsSystemWindows="true"`）。

---

## 权限清单

| 权限 | 用途 |
|------|------|
| `INTERNET` | 加载远程 Web 应用 |
| `ACCESS_NETWORK_STATE` | 检测网络状态 |

---

## 构建命令

```bash
# Debug 包（默认）
./gradlew assembleDebug

# Release 包（需配置签名）
./gradlew assembleRelease
```

输出路径：`app/build/outputs/apk/debug/app-debug.apk`

**环境要求：**
- Android SDK 已安装，`ANDROID_HOME` 已设置
- JDK 17+

---

## 依赖项

```
androidx.core:core-ktx
androidx.appcompat:appcompat
com.google.android.material:material
androidx.activity:activity
```

---

## 注意事项

- SSL 证书校验已全局关闭（`onReceivedSslError` 无条件 proceed），仅适用于内网/开发环境，上线公网时应收紧
- Debug 包 applicationId 后缀为 `.debug`，可与 release 包共存于同一设备
- Chrome DevTools 远程调试仅在 Debug 构建中启用
