/**
 * Dream Mobile — 热更新模块（纯 H5 版）
 *
 * 通过 JSBridge 调用 Android 原生 UpdateBridge，实现 H5 业务包热更新：
 *   1. H5 请求版本服务端，对比版本号
 *   2. 调用 bridge.update.download() 下载 zip 包（带进度事件）
 *   3. 调用 bridge.update.apply()     解压替换 h5_update/ 目录
 *   4. 调用 bridge.update.reload()    重载 WebView
 *
 * 在浏览器调试环境，所有更新接口直接报错（更新能力仅原生有效）。
 */

import { bridge, bridgeUpdate } from './bridge'
import { logger } from './logger'

export const UPDATE_SERVER = 'https://your-update-server.com'  // 替换为实际地址

export interface UpdateInfo {
  version: string
  zipUrl: string
  md5: string
  changelog: string
  forceUpdate: boolean
}

export interface UpdateStatus {
  checking: boolean
  hasUpdate: boolean
  downloading: boolean
  progress: number      // 0–100
  installing: boolean
  error: string | null
  info: UpdateInfo | null
}

/** semver 比较：a > b 返回 true */
function semverGt(a: string, b: string): boolean {
  const parse = (v: string) => v.replace(/[^0-9.]/g, '').split('.').map(Number)
  const [a1, a2, a3] = parse(a)
  const [b1, b2, b3] = parse(b)
  if (a1 !== b1) return a1 > b1
  if (a2 !== b2) return a2 > b2
  return a3 > b3
}

class Updater {
  private _status: UpdateStatus = {
    checking: false,
    hasUpdate: false,
    downloading: false,
    progress: 0,
    installing: false,
    error: null,
    info: null,
  }

  private _listeners: Array<(s: UpdateStatus) => void> = []

  onStatus(cb: (s: UpdateStatus) => void) {
    this._listeners.push(cb)
    return () => { this._listeners = this._listeners.filter(l => l !== cb) }
  }

  private emit() {
    const s = { ...this._status }
    this._listeners.forEach(cb => cb(s))
  }

  get status(): UpdateStatus { return { ...this._status } }

  /** 检测更新 */
  async check(userTriggered = false): Promise<UpdateInfo | null> {
    if (!bridge.isNative) {
      logger.info('Updater', '非原生环境，跳过热更新检测')
      return null
    }

    if (this._status.checking) return null
    this._status.checking = true
    this._status.error = null
    this.emit()

    try {
      const { version: currentVersion } = await bridgeUpdate.getVersion()

      const resp = await fetch(`${UPDATE_SERVER}/api/version`, {
        method: 'GET',
        signal: AbortSignal.timeout(10_000),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const info: UpdateInfo = await resp.json()

      if (!semverGt(info.version, currentVersion)) {
        logger.info('Updater', `已是最新版本 ${currentVersion}`)
        this._status = { ...this._status, checking: false, hasUpdate: false }
        this.emit()
        return null
      }

      logger.info('Updater', `发现新版本 ${info.version}（当前 ${currentVersion}）`)
      this._status = { ...this._status, checking: false, hasUpdate: true, info }
      this.emit()
      return info

    } catch (err) {
      logger.error('Updater', '检测更新失败', err)
      this._status.checking = false
      if (userTriggered) {
        this._status.error = `检测失败：${String(err)}`
      }
      this.emit()
      return null
    }
  }

  /** 下载并安装更新 */
  async downloadAndInstall(info: UpdateInfo): Promise<void> {
    if (!bridge.isNative) return
    if (this._status.downloading || this._status.installing) return

    this._status = { ...this._status, downloading: true, progress: 0, error: null }
    this.emit()

    // 监听进度事件（原生通过 CustomEvent 推送）
    const PROGRESS_EVENT = 'dream:update:progress'
    const onProgress = (e: Event) => {
      const { progress } = (e as CustomEvent<{ progress: number }>).detail
      this._status.progress = progress
      this.emit()
    }
    window.addEventListener(PROGRESS_EVENT, onProgress)

    try {
      // 1. 下载
      const { tempPath } = await bridgeUpdate.download({
        url: info.zipUrl,
        md5: info.md5,
        callbackEvent: PROGRESS_EVENT,
      })

      // 2. 解压替换
      this._status = { ...this._status, downloading: false, installing: true }
      this.emit()
      await bridgeUpdate.apply(tempPath)

      // 3. 重载
      logger.info('Updater', `安装成功，即将重载`)
      this._status = { ...this._status, installing: false, hasUpdate: false }
      this.emit()

      // 给 UI 弹窗留 300ms 再重载
      setTimeout(() => bridgeUpdate.reload(), 300)

    } catch (err) {
      logger.error('Updater', '安装失败', err)
      this._status = {
        ...this._status,
        downloading: false,
        installing: false,
        error: `安装失败：${String(err)}`,
      }
      this.emit()
    } finally {
      window.removeEventListener(PROGRESS_EVENT, onProgress)
    }
  }

  /** 清除已下载的更新包（回滚到内置版本） */
  async clean(): Promise<void> {
    if (!bridge.isNative) return
    await bridgeUpdate.clean()
    await bridgeUpdate.reload()
  }

  /** 获取当前 H5 版本信息 */
  async getVersion(): Promise<{ version: string; source: 'bundle' | 'update' }> {
    if (!bridge.isNative) return { version: __APP_VERSION__, source: 'bundle' }
    return bridgeUpdate.getVersion()
  }
}

export const updater = new Updater()
