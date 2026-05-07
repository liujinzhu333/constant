/// <reference types="vite/client" />

declare module '*.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// =============================================
// 全局常量（由 vite.config.ts define 注入）
// =============================================
declare const __APP_VERSION__: string

// =============================================
// JSBridge 原生接口（注入到 window 上）
// =============================================
interface DreamBridgeInterface {
  /** H5 调用原生：传入 JSON 字符串 */
  call(requestJson: string): void
  /** H5 向原生推送事件（预留） */
  emit(eventJson: string): void
}

interface Window {
  /** Android 原生注入的 Bridge 对象 */
  DreamBridge?: DreamBridgeInterface
  /** 原生调用此函数将结果回调给 H5 */
  __dreamBridgeCallback__?: (payload: {
    id: string
    ok: boolean
    data?: unknown
    error?: string
  }) => void
}
