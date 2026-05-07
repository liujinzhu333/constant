package com.dream.mobile.file

import android.content.Context
import com.dream.mobile.bridge.BaseBridge
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * FileBridge — 沙盒文件读写
 *
 * 所有路径均相对于 app 私有沙盒目录（getFilesDir()），
 * H5 无法访问沙盒外的系统文件（安全设计）。
 *
 * H5 调用：
 * ```js
 * // 写文件
 * bridge.call('file', 'write', { path: 'logs/app.log', content: '...', append: true })
 *
 * // 读文件
 * bridge.call('file', 'read', { path: 'logs/app.log' })
 * // → data: { content: '...' }
 *
 * // 列出目录
 * bridge.call('file', 'list', { path: 'logs' })
 * // → data: { files: ['app.log', 'app-2026-05-01.log'] }
 *
 * // 删除文件
 * bridge.call('file', 'delete', { path: 'logs/old.log' })
 *
 * // 获取文件大小
 * bridge.call('file', 'stat', { path: 'logs/app.log' })
 * // → data: { size: 1024, exists: true, lastModified: 1234567890000 }
 * ```
 */
class FileBridge(
    private val context: Context,
    callback: (id: String, ok: Boolean, data: Any?, error: String) -> Unit
) : BaseBridge(callback) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val rootDir = context.filesDir

    override fun handle(id: String, method: String, params: JSONObject) {
        scope.launch {
            try {
                when (method) {
                    "write"  -> write(id, params)
                    "read"   -> read(id, params)
                    "list"   -> list(id, params)
                    "delete" -> delete(id, params)
                    "stat"   -> stat(id, params)
                    else     -> fail(id, "Unknown file method: $method")
                }
            } catch (e: Exception) {
                fail(id, e.message ?: "File error")
            }
        }
    }

    private fun resolve(path: String): File {
        // 防路径穿越：确保解析后的路径在 rootDir 内
        val resolved = File(rootDir, path).canonicalFile
        if (!resolved.absolutePath.startsWith(rootDir.canonicalPath)) {
            throw SecurityException("Path traversal attempt: $path")
        }
        return resolved
    }

    private fun write(id: String, params: JSONObject) {
        val path    = params.getString("path")
        val content = params.getString("content")
        val append  = params.optBoolean("append", false)
        val file = resolve(path)
        file.parentFile?.mkdirs()
        if (append) file.appendText(content) else file.writeText(content)
        ok(id, JSONObject().put("written", content.length))
    }

    private fun read(id: String, params: JSONObject) {
        val file = resolve(params.getString("path"))
        if (!file.exists()) {
            fail(id, "File not found: ${params.getString("path")}"); return
        }
        ok(id, JSONObject().put("content", file.readText()))
    }

    private fun list(id: String, params: JSONObject) {
        val dir = resolve(params.optString("path", ""))
        val files = if (dir.isDirectory) {
            JSONArray(dir.list()?.toList() ?: emptyList<String>())
        } else {
            JSONArray()
        }
        ok(id, JSONObject().put("files", files))
    }

    private fun delete(id: String, params: JSONObject) {
        val file = resolve(params.getString("path"))
        val deleted = file.delete()
        ok(id, JSONObject().put("deleted", deleted))
    }

    private fun stat(id: String, params: JSONObject) {
        val file = resolve(params.getString("path"))
        ok(id, JSONObject()
            .put("exists", file.exists())
            .put("size", if (file.exists()) file.length() else 0)
            .put("lastModified", if (file.exists()) file.lastModified() else 0)
        )
    }

    override fun destroy() { scope.cancel() }
}
