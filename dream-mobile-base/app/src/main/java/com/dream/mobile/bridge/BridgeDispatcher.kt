package com.dream.mobile.bridge

import android.webkit.WebView
import androidx.fragment.app.FragmentActivity
import com.dream.mobile.db.SQLiteBridge
import com.dream.mobile.file.FileBridge
import com.dream.mobile.notification.NotificationBridge
import com.dream.mobile.biometric.BiometricBridge
import com.dream.mobile.update.UpdateBridge
import org.json.JSONObject

/**
 * JSBridge 调度中心
 *
 * H5 调用约定（window.DreamBridge.call）：
 * ```js
 * window.DreamBridge.call(
 *   JSON.stringify({
 *     id: 'uuid',          // 请求 ID，原样回调
 *     module: 'sqlite',    // 模块名
 *     method: 'exec',      // 方法名
 *     params: { ... }      // 参数
 *   })
 * )
 * ```
 *
 * 原生回调约定（evaluateJavascript）：
 * ```js
 * window.__dreamBridgeCallback__(JSON.stringify({
 *   id: 'uuid',
 *   ok: true,
 *   data: { ... },   // 成功数据
 *   error: ''        // 失败信息
 * }))
 * ```
 */
class BridgeDispatcher(
    private val activity: FragmentActivity,
    private val webView: WebView
) {
    private val modules = mutableMapOf<String, BaseBridge>()

    fun register() {
        // 注册所有子模块
        modules["sqlite"]       = SQLiteBridge(activity, ::sendCallback)
        modules["notification"] = NotificationBridge(activity, ::sendCallback)
        modules["biometric"]    = BiometricBridge(activity, ::sendCallback)
        modules["file"]         = FileBridge(activity, ::sendCallback)
        modules["update"]       = UpdateBridge(activity, webView, ::sendCallback)

        // 注入统一 Java 对象到 WebView（名称：DreamBridge）
        webView.addJavascriptInterface(BridgeInterface(), "DreamBridge")
    }

    /** 页面加载完成后，向 H5 推送平台信息 */
    fun onPageReady() {
        val info = JSONObject().apply {
            put("platform", "android")
            put("version", activity.packageManager
                .getPackageInfo(activity.packageName, 0).versionName)
            put("bridgeVersion", "1.0.0")
        }
        val js = "window.dispatchEvent(new CustomEvent('dream:ready', { detail: ${info} }));"
        webView.post { webView.evaluateJavascript(js, null) }
    }

    /** 向 H5 发送回调 */
    fun sendCallback(id: String, ok: Boolean, data: Any? = null, error: String = "") {
        val payload = JSONObject().apply {
            put("id", id)
            put("ok", ok)
            if (data != null) put("data", data)
            if (error.isNotEmpty()) put("error", error)
        }
        val js = "window.__dreamBridgeCallback__(${payload});"
        webView.post { webView.evaluateJavascript(js, null) }
    }

    fun destroy() {
        modules.values.forEach { it.destroy() }
    }

    /** 暴露给 JS 的接口对象 */
    inner class BridgeInterface {
        @android.webkit.JavascriptInterface
        fun call(requestJson: String) {
            try {
                val req = JSONObject(requestJson)
                val id     = req.getString("id")
                val module = req.getString("module")
                val method = req.getString("method")
                val params = req.optJSONObject("params") ?: JSONObject()

                val bridge = modules[module]
                if (bridge == null) {
                    sendCallback(id, false, error = "Unknown module: $module")
                    return
                }
                // 在主线程/协程中分发（各 Bridge 自行决定线程）
                bridge.handle(id, method, params)
            } catch (e: Exception) {
                // 尝试从 JSON 中取 id 回调错误
                try {
                    val id = JSONObject(requestJson).optString("id", "unknown")
                    sendCallback(id, false, error = e.message ?: "Bridge error")
                } catch (_: Exception) {}
            }
        }

        /** H5 主动推送事件给原生（可选） */
        @android.webkit.JavascriptInterface
        fun emit(eventJson: String) {
            // 预留：处理 H5 → 原生的事件推送
        }
    }
}
