/**
 * Dream Mobile — 通知封装（纯 H5 版）
 *
 * 通过 JSBridge 调用 Android 原生 NotificationBridge：
 *   - 原生基座内：走 Bridge → 系统通知
 *   - 浏览器调试：Bridge mock，console.log 模拟
 */

import { bridge, bridgeNotification } from './bridge'
import { logger } from './logger'

export interface NotificationOptions {
  title: string
  content: string
  /** 通知 ID（用于取消/覆盖） */
  id?: number
  /** 延迟秒数（0 = 立即） */
  delaySec?: number
}

class NotificationManager {
  private _permissionGranted = false

  /** 申请通知权限（仅需调用一次） */
  async requestPermission(): Promise<boolean> {
    try {
      const result = await bridgeNotification.requestPermission()
      this._permissionGranted = result.granted
      logger.info('Notification', `权限状态：${result.granted ? '已授权' : '未授权'}`)
      return result.granted
    } catch (err) {
      logger.error('Notification', '申请权限失败', err)
      return false
    }
  }

  /** 发送通知（立即或定时） */
  async send(options: NotificationOptions): Promise<void> {
    const { title, content, id = Date.now() % 0x7FFFFFFF, delaySec = 0 } = options
    try {
      if (delaySec > 0) {
        await bridgeNotification.schedule({ id, title, content, delaySec })
      } else {
        await bridgeNotification.send({ id, title, content })
      }
    } catch (err) {
      logger.error('Notification', '发送通知失败', err)
    }
  }

  /** 取消通知 */
  async cancel(id: number): Promise<void> {
    try {
      await bridgeNotification.cancel(id)
    } catch (err) {
      logger.error('Notification', '取消通知失败', err)
    }
  }

  get isNative(): boolean {
    return bridge.isNative
  }
}

export const notification = new NotificationManager()
