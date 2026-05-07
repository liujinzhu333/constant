package com.dream.mobile.bridge

import org.json.JSONObject

/**
 * 所有 Bridge 模块的基类。
 * 子类实现 [handle] 方法，处理来自 H5 的调用。
 */
abstract class BaseBridge(
    protected val callback: (id: String, ok: Boolean, data: Any?, error: String) -> Unit
) {
    /** 分发 H5 请求到具体方法 */
    abstract fun handle(id: String, method: String, params: JSONObject)

    /** 资源释放 */
    open fun destroy() {}

    /** 快捷：成功回调 */
    protected fun ok(id: String, data: Any? = null) = callback(id, true, data, "")

    /** 快捷：失败回调 */
    protected fun fail(id: String, error: String) = callback(id, false, null, error)
}
