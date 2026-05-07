package com.dream.mobile.notification

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.dream.mobile.DreamApplication
import com.dream.mobile.MainActivity
import com.dream.mobile.R
import com.dream.mobile.bridge.BaseBridge
import kotlinx.coroutines.*
import org.json.JSONObject

/**
 * NotificationBridge — 本地通知能力
 *
 * H5 调用：
 * ```js
 * // 申请通知权限（Android 13+）
 * bridge.call('notification', 'requestPermission', {})
 * // → data: { granted: true }
 *
 * // 立即发送通知
 * bridge.call('notification', 'send', {
 *   id: 1, title: '提醒', content: '待办到期', delaySec: 0
 * })
 *
 * // 定时通知（delaySec 秒后触发）
 * bridge.call('notification', 'schedule', {
 *   id: 1, title: '提醒', content: '待办到期', delaySec: 600
 * })
 *
 * // 取消通知
 * bridge.call('notification', 'cancel', { id: 1 })
 * ```
 */
class NotificationBridge(
    private val context: Context,
    callback: (id: String, ok: Boolean, data: Any?, error: String) -> Unit
) : BaseBridge(callback) {

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    private val notifManager = NotificationManagerCompat.from(context)

    override fun handle(id: String, method: String, params: JSONObject) {
        scope.launch {
            try {
                when (method) {
                    "requestPermission" -> requestPermission(id)
                    "send"              -> send(id, params)
                    "schedule"          -> schedule(id, params)
                    "cancel"            -> cancel(id, params)
                    else                -> fail(id, "Unknown notification method: $method")
                }
            } catch (e: Exception) {
                fail(id, e.message ?: "Notification error")
            }
        }
    }

    private fun requestPermission(id: String) {
        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                context, android.Manifest.permission.POST_NOTIFICATIONS
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        } else {
            notifManager.areNotificationsEnabled()
        }
        ok(id, JSONObject().put("granted", granted))
    }

    private fun send(id: String, params: JSONObject) {
        val notifId  = params.optInt("id", System.currentTimeMillis().toInt())
        val title    = params.optString("title", "Dream")
        val content  = params.optString("content", "")

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pi = PendingIntent.getActivity(
            context, notifId, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notif = NotificationCompat.Builder(context, DreamApplication.NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(content)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pi)
            .setAutoCancel(true)
            .build()

        notifManager.notify(notifId, notif)
        ok(id, JSONObject().put("notifId", notifId))
    }

    private fun schedule(id: String, params: JSONObject) {
        val notifId   = params.optInt("id", System.currentTimeMillis().toInt())
        val title     = params.optString("title", "Dream")
        val content   = params.optString("content", "")
        val delaySec  = params.optLong("delaySec", 0L)
        val triggerAt = System.currentTimeMillis() + delaySec * 1000L

        val intent = Intent(context, AlarmReceiver::class.java).apply {
            putExtra("notifId", notifId)
            putExtra("title", title)
            putExtra("content", content)
        }
        val pi = PendingIntent.getBroadcast(
            context, notifId, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
            // 无精确闹钟权限，降级为非精确
            alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAt, pi)
        } else {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
        }

        ok(id, JSONObject().put("notifId", notifId).put("triggerAt", triggerAt))
    }

    private fun cancel(id: String, params: JSONObject) {
        val notifId = params.getInt("id")
        notifManager.cancel(notifId)
        val intent = Intent(context, AlarmReceiver::class.java)
        val pi = PendingIntent.getBroadcast(
            context, notifId, intent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
        )
        pi?.let { alarmManager.cancel(it) }
        ok(id)
    }

    override fun destroy() { scope.cancel() }
}
