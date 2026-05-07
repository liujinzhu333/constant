package com.dream.mobile.update

import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.dream.mobile.DreamApplication
import com.dream.mobile.R

/**
 * 热更新前台服务（占位）
 * 后续如需后台下载可在此实现，目前 UpdateBridge 直接在协程中下载。
 */
class UpdateService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notif = NotificationCompat.Builder(this, DreamApplication.NOTIFICATION_CHANNEL_ID)
            .setContentTitle("Dream")
            .setContentText("正在下载更新...")
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
        startForeground(9999, notif)
        return START_NOT_STICKY
    }
}
