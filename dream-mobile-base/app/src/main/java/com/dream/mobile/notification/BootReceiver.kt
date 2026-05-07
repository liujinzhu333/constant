package com.dream.mobile.notification

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.dream.mobile.db.DreamDBHelper

/**
 * 开机完成广播接收器。
 *
 * 设备重启后 AlarmManager 中的所有闹钟会被清空，此 Receiver 在收到
 * BOOT_COMPLETED 广播后，查询 reminders 表中所有 status='pending'
 * 且 remind_at > now 的记录，逐一重新注册精确闹钟。
 *
 * 注意：此 Receiver 在主线程执行，使用同步 SQLite 读取（无 WebView，不过 Bridge）。
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "DreamBootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
            intent.action != "android.intent.action.QUICKBOOT_POWERON"
        ) return

        Log.i(TAG, "设备启动，开始恢复提醒闹钟...")

        val now = System.currentTimeMillis()
        val helper = DreamDBHelper(context)
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

        try {
            val db = helper.readableDatabase
            // 查询所有 pending 且时间点在未来的提醒
            val cursor = db.rawQuery(
                "SELECT id, title, description, remind_at FROM reminders WHERE status = 'pending' AND remind_at > ?",
                arrayOf(now.toString())
            )

            var restored = 0
            cursor.use {
                while (it.moveToNext()) {
                    val reminderId   = it.getLong(it.getColumnIndexOrThrow("id"))
                    val title        = it.getString(it.getColumnIndexOrThrow("title"))
                    val description  = it.getString(it.getColumnIndexOrThrow("description")) ?: ""
                    val remindAt     = it.getLong(it.getColumnIndexOrThrow("remind_at"))

                    // 使用 reminderId 作为 notifId（保持唯一性，与创建时一致）
                    val notifId = (reminderId % Int.MAX_VALUE).toInt()

                    val alarmIntent = Intent(context, AlarmReceiver::class.java).apply {
                        putExtra("notifId", notifId)
                        putExtra("title",   title)
                        putExtra("content", description.ifEmpty { "您有一条提醒" })
                    }
                    val pi = PendingIntent.getBroadcast(
                        context,
                        notifId,
                        alarmIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
                        alarmManager.set(AlarmManager.RTC_WAKEUP, remindAt, pi)
                    } else {
                        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, remindAt, pi)
                    }

                    restored++
                    Log.d(TAG, "已恢复闹钟 id=$reminderId title=$title remindAt=$remindAt")
                }
            }

            Log.i(TAG, "共恢复 $restored 条提醒闹钟")
        } catch (e: Exception) {
            Log.e(TAG, "恢复闹钟失败：${e.message}", e)
        } finally {
            helper.close()
        }
    }
}
