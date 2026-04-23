/**
 * Electron 主进程入口
 * 基座核心启动文件
 */
import { app } from 'electron'
import { StartupManager } from '../modules/startup'
import { IpcManager } from '../modules/ipc'

// 规避 macOS GPU 进程崩溃问题（Electron 29 已知问题）
app.commandLine.appendSwitch('--disable-gpu')
app.commandLine.appendSwitch('--disable-software-rasterizer')

// 注册 IPC 处理器（需在 app.whenReady 前注册）
IpcManager.getInstance().register()

// 启动基座
StartupManager.getInstance().bootstrap().catch((err) => {
  console.error('[Main] 基座启动失败:', err)
  process.exit(1)
})
