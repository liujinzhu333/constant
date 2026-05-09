/**
 * Electron 主进程入口
 * 基座核心启动文件
 */
import { app } from 'electron'
import * as path from 'path'
import { StartupManager } from '../modules/startup'
import { IpcManager } from '../modules/ipc'

// 开发模式使用独立的 userData 目录，避免与线上安装版本争抢单例锁和数据库
// 必须在 app.requestSingleInstanceLock() 之前调用，否则无效
const isDev = !!process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === 'development'
if (isDev) {
  app.setPath('userData', path.join(app.getPath('appData'), 'dream-dev'))
}

// 规避 macOS GPU 进程崩溃问题（Electron 29 已知问题）
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-software-rasterizer')
app.commandLine.appendSwitch('no-sandbox')

// GPU / 网络服务崩溃时不退出 app，仅记录日志
app.on('gpu-process-crashed' as any, (_event: any, killed: boolean) => {
  console.error(`[Main] GPU 进程崩溃（killed=${killed}），应用继续运行`)
})
app.on('child-process-gone' as any, (_event: any, details: any) => {
  console.error('[Main] 子进程退出:', details?.type, details?.reason)
  // network_service / GPU 崩溃时阻止退出
})
// 阻止所有窗口关闭时自动退出（HTTP Server 需要保持运行）
app.on('window-all-closed', (e: any) => {
  e?.preventDefault?.()
})

// 主进程全局异常兜底，防止 uncaughtException / unhandledRejection 导致渲染进程白屏
process.on('uncaughtException', (err) => {
  console.error('[Main] uncaughtException:', err)
  // 不退出进程，让应用继续运行
})
process.on('unhandledRejection', (reason) => {
  console.error('[Main] unhandledRejection:', reason)
  // 不退出进程
})

// 注册 IPC 处理器（需在 app.whenReady 前注册）
IpcManager.getInstance().register()

// 启动基座
StartupManager.getInstance().bootstrap().catch((err) => {
  console.error('[Main] 基座启动失败:', err)
  process.exit(1)
})
