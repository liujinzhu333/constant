package com.dream.mobile.update

import android.content.Context
import android.content.Intent
import android.webkit.WebView
import com.dream.mobile.bridge.BaseBridge
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * UpdateBridge — H5 热更新
 *
 * 更新流程：
 *   1. H5 检测新版本（自行请求版本接口）
 *   2. 调用 bridge 'download' 下载 zip 包到沙盒临时目录
 *   3. 调用 bridge 'apply' 解压并替换 h5_update/ 目录
 *   4. 调用 bridge 'reload' 重启 WebView 加载新包
 *
 * H5 调用：
 * ```js
 * // 下载更新包（带进度回调）
 * bridge.call('update', 'download', {
 *   url: 'https://cdn.example.com/h5-1.0.1.zip',
 *   md5: 'abc123...',
 *   callbackEvent: 'update:progress'  // WebView 事件名，用于进度上报
 * })
 *
 * // 应用更新（解压替换）
 * bridge.call('update', 'apply', { tempPath: '__update_tmp__/h5.zip' })
 *
 * // 重载 WebView
 * bridge.call('update', 'reload', {})
 *
 * // 获取当前 H5 版本（从 assets/www/version.json 或更新目录读取）
 * bridge.call('update', 'getVersion', {})
 * // → data: { version: '1.0.1', source: 'update|bundle' }
 * ```
 */
class UpdateBridge(
    private val context: Context,
    private val webView: WebView,
    callback: (id: String, ok: Boolean, data: Any?, error: String) -> Unit
) : BaseBridge(callback) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val updateDir  = context.getDir("h5_update", Context.MODE_PRIVATE)
    private val tempDir    = File(context.cacheDir, "__update_tmp__").also { it.mkdirs() }

    override fun handle(id: String, method: String, params: JSONObject) {
        scope.launch {
            try {
                when (method) {
                    "download"   -> download(id, params)
                    "apply"      -> apply(id, params)
                    "reload"     -> reload(id)
                    "getVersion" -> getVersion(id)
                    "clean"      -> clean(id)
                    else         -> fail(id, "Unknown update method: $method")
                }
            } catch (e: Exception) {
                fail(id, e.message ?: "Update error")
            }
        }
    }

    private fun download(id: String, params: JSONObject) {
        val urlStr        = params.getString("url")
        val expectedMd5   = params.optString("md5", "")
        val callbackEvent = params.optString("callbackEvent", "")

        val outFile = File(tempDir, "h5_update.zip")
        outFile.parentFile?.mkdirs()

        val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout    = 60_000
            requestMethod  = "GET"
        }

        val totalBytes = conn.contentLengthLong.coerceAtLeast(1)
        var downloaded  = 0L

        conn.inputStream.use { input ->
            FileOutputStream(outFile).use { output ->
                val buf = ByteArray(8192)
                var n: Int
                while (input.read(buf).also { n = it } != -1) {
                    output.write(buf, 0, n)
                    downloaded += n
                    // 上报进度
                    if (callbackEvent.isNotEmpty()) {
                        val progress = (downloaded * 100 / totalBytes).toInt()
                        val js = "window.dispatchEvent(new CustomEvent('$callbackEvent', { detail: { progress: $progress, downloaded: $downloaded, total: $totalBytes } }));"
                        webView.post { webView.evaluateJavascript(js, null) }
                    }
                }
            }
        }

        // MD5 校验
        if (expectedMd5.isNotEmpty()) {
            val actualMd5 = outFile.md5()
            if (!actualMd5.equals(expectedMd5, ignoreCase = true)) {
                outFile.delete()
                fail(id, "MD5 mismatch: expected $expectedMd5, got $actualMd5"); return
            }
        }

        ok(id, JSONObject()
            .put("tempPath", outFile.absolutePath)
            .put("size", outFile.length())
        )
    }

    private fun apply(id: String, params: JSONObject) {
        val zipPath = params.optString("tempPath", File(tempDir, "h5_update.zip").absolutePath)
        val zipFile = File(zipPath)
        if (!zipFile.exists()) { fail(id, "Zip not found: $zipPath"); return }

        // 清空旧更新目录
        updateDir.deleteRecursively()
        updateDir.mkdirs()

        // 解压
        java.util.zip.ZipInputStream(zipFile.inputStream()).use { zis ->
            var entry = zis.nextEntry
            while (entry != null) {
                val outFile = File(updateDir, entry.name)
                if (entry.isDirectory) {
                    outFile.mkdirs()
                } else {
                    outFile.parentFile?.mkdirs()
                    FileOutputStream(outFile).use { zis.copyTo(it) }
                }
                zis.closeEntry()
                entry = zis.nextEntry
            }
        }

        zipFile.delete()
        ok(id, JSONObject().put("applied", true).put("dir", updateDir.absolutePath))
    }

    private fun reload(id: String) {
        ok(id)
        webView.post {
            val indexFile = File(updateDir, "index.html")
            if (indexFile.exists()) {
                webView.loadUrl("file://${indexFile.absolutePath}")
            } else {
                webView.loadUrl("file:///android_asset/www/index.html")
            }
        }
    }

    private fun getVersion(id: String) {
        // 先查更新目录，再查内置 assets
        val updateVersion = File(updateDir, "version.json").let {
            if (it.exists()) runCatching { JSONObject(it.readText()) }.getOrNull() else null
        }
        if (updateVersion != null) {
            ok(id, JSONObject()
                .put("version", updateVersion.optString("version", "unknown"))
                .put("source", "update"))
            return
        }
        // assets 中的版本
        runCatching {
            val versionJson = context.assets.open("www/version.json")
                .bufferedReader().readText()
            val obj = JSONObject(versionJson)
            ok(id, JSONObject().put("version", obj.optString("version", "1.0.0")).put("source", "bundle"))
        }.onFailure {
            ok(id, JSONObject().put("version", "1.0.0").put("source", "bundle"))
        }
    }

    private fun clean(id: String) {
        updateDir.deleteRecursively()
        updateDir.mkdirs()
        ok(id, JSONObject().put("cleaned", true))
    }

    override fun destroy() { scope.cancel() }

    // ---- Extensions ----
    private fun File.md5(): String {
        val md = MessageDigest.getInstance("MD5")
        inputStream().use { stream ->
            val buf = ByteArray(8192)
            var n: Int
            while (stream.read(buf).also { n = it } != -1) md.update(buf, 0, n)
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }
}
