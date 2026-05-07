package com.dream.mobile.biometric

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.dream.mobile.bridge.BaseBridge
import org.json.JSONObject

/**
 * BiometricBridge — 指纹 / 面容 ID 认证
 *
 * H5 调用：
 * ```js
 * // 检查是否支持生物识别
 * bridge.call('biometric', 'isAvailable', {})
 * // → data: { available: true, type: 'fingerprint|face|iris|strong' }
 *
 * // 发起认证
 * bridge.call('biometric', 'authenticate', {
 *   title: '验证身份',
 *   subtitle: '使用指纹或面容解锁账号管理',
 *   cancelLabel: '取消'
 * })
 * // → ok: true / ok: false, error: '用户取消'
 * ```
 */
class BiometricBridge(
    private val activity: FragmentActivity,
    callback: (id: String, ok: Boolean, data: Any?, error: String) -> Unit
) : BaseBridge(callback) {

    override fun handle(id: String, method: String, params: JSONObject) {
        when (method) {
            "isAvailable"  -> isAvailable(id)
            "authenticate" -> authenticate(id, params)
            else           -> fail(id, "Unknown biometric method: $method")
        }
    }

    private fun isAvailable(id: String) {
        val manager = BiometricManager.from(activity)
        val result = manager.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG or
            BiometricManager.Authenticators.BIOMETRIC_WEAK
        )
        val available = result == BiometricManager.BIOMETRIC_SUCCESS
        val typeStr = when (result) {
            BiometricManager.BIOMETRIC_SUCCESS -> "strong"
            else -> "none"
        }
        ok(id, JSONObject().put("available", available).put("type", typeStr))
    }

    private fun authenticate(id: String, params: JSONObject) {
        val title       = params.optString("title", activity.getString(com.dream.mobile.R.string.biometric_prompt_title))
        val subtitle    = params.optString("subtitle", activity.getString(com.dream.mobile.R.string.biometric_prompt_subtitle))
        val cancelLabel = params.optString("cancelLabel", activity.getString(com.dream.mobile.R.string.biometric_prompt_cancel))

        val executor = ContextCompat.getMainExecutor(activity)

        val prompt = BiometricPrompt(activity, executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    ok(id, JSONObject().put("authenticated", true))
                }
                override fun onAuthenticationFailed() {
                    // 单次识别失败，不终止（系统会继续允许重试）
                }
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    fail(id, errString.toString())
                }
            }
        )

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setNegativeButtonText(cancelLabel)
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_STRONG or
                BiometricManager.Authenticators.BIOMETRIC_WEAK
            )
            .build()

        activity.runOnUiThread { prompt.authenticate(promptInfo) }
    }
}
