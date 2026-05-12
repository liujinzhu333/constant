/**
 * 连接状态 Store
 *
 * 管理 Web 环境下与 PC 端 HTTP Server 的连接状态：
 * - online：正常连接，所有读写操作可用
 * - offline：断开连接（手动断开或网络故障），只读缓存模式
 *
 * 手动断开后，各业务 store 的写操作会检查 isOnline，
 * 离线时提示用户并阻止请求。
 *
 * 各业务 store 通过 registerRefresh() 注册刷新回调，
 * 重连成功后 sync() 会先回放离线队列，再统一刷新所有已注册的 store。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { setApiOffline } from '../utils/api'
import { replayQueue, pendingCount } from '../utils/offline-queue'

export type ConnectionStatus = 'online' | 'offline' | 'checking'

export interface SyncResult {
  replayed: number
  failed: number
  refreshed: number
  errors: string[]
}

export const useConnectionStore = defineStore('connection', () => {
  const status = ref<ConnectionStatus>('online')
  const syncing = ref(false)

  /** 已注册的业务 store 刷新回调列表 */
  const _refreshCallbacks: Array<() => Promise<void>> = []

  const isOnline  = computed(() => status.value === 'online')
  const isOffline = computed(() => status.value === 'offline')

  /** 离线队列中待同步的操作数（响应式） */
  const pendingQueueCount = ref(pendingCount())

  /** 刷新队列计数（写操作后调用） */
  function refreshPendingCount() {
    pendingQueueCount.value = pendingCount()
  }

  /**
   * 注册业务 store 的数据刷新回调。
   * 重复注册同一函数引用会被去重。
   */
  function registerRefresh(cb: () => Promise<void>) {
    if (!_refreshCallbacks.includes(cb)) {
      _refreshCallbacks.push(cb)
    }
  }

  /** 手动断开：切换为离线模式，后续读操作走缓存 */
  function disconnect() {
    status.value = 'offline'
    setApiOffline(true)
  }

  /** 尝试重连：ping 服务端，成功则恢复 online */
  async function reconnect(baseUrl: string): Promise<boolean> {
    status.value = 'checking'
    try {
      const res = await fetch(`${baseUrl}/ping`, { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        status.value = 'online'
        setApiOffline(false)
        return true
      }
    } catch { /* 网络不通 */ }
    status.value = 'offline'
    setApiOffline(true)
    return false
  }

  /** 标记为连接成功（外部 ping 通后调用） */
  function setOnline() { status.value = 'online'; setApiOffline(false) }

  /** 标记为断开（API 请求失败时由拦截器调用） */
  function setOffline() { status.value = 'offline'; setApiOffline(true) }

  /**
   * 同步：回放离线队列 → 刷新所有业务 store 数据。
   * 调用前请确保网络已恢复（status === 'online'）。
   */
  async function sync(): Promise<SyncResult> {
    if (syncing.value) return { replayed: 0, failed: 0, refreshed: 0, errors: ['sync already in progress'] }
    syncing.value = true
    const result: SyncResult = { replayed: 0, failed: 0, refreshed: 0, errors: [] }
    try {
      // 1. 回放离线队列
      const replay = await replayQueue()
      result.replayed = replay.success
      result.failed = replay.failed
      result.errors = replay.errors.map(e => `${e.item.method} ${e.item.path}: ${e.error}`)
      refreshPendingCount()

      // 2. 刷新所有已注册的业务 store
      await Promise.allSettled(
        _refreshCallbacks.map(cb =>
          cb().then(() => { result.refreshed++ }).catch(e => {
            result.errors.push(`refresh failed: ${e?.message ?? String(e)}`)
          })
        )
      )
    } finally {
      syncing.value = false
    }
    return result
  }

  return {
    status, isOnline, isOffline, syncing, pendingQueueCount,
    disconnect, reconnect, setOnline, setOffline,
    registerRefresh, refreshPendingCount, sync,
  }
})
