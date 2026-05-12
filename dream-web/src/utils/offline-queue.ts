/**
 * 离线操作队列
 *
 * 离线时的写操作（POST / PATCH / DELETE）不走网络，而是记录在此队列中。
 * 重连后调用 replayQueue() 按顺序回放到服务端，成功后清除对应条目。
 *
 * 数据结构：
 *   QueueItem { id, method, path, body, tempId?, realId? }
 *
 * tempId 规则：
 *   POST（新增）操作的 body 中包含 tempId（"offline_<timestamp>_<random>"），
 *   后续对该资源的 PATCH/DELETE 操作的 path 里会含 tempId。
 *   回放时，POST 成功后将服务端返回的真实 id 替换后续操作中的 tempId。
 */

import { getAxiosInstance } from './api'

export type QueueMethod = 'POST' | 'PATCH' | 'DELETE'

export interface QueueItem {
  /** 队列项唯一标识 */
  id: string
  method: QueueMethod
  /** 相对路径，如 /api/todos 或 /api/todos/offline_xxx */
  path: string
  body?: Record<string, unknown>
  /** 该操作新增资源的临时 ID（仅 POST 有） */
  tempId?: string
  /** 创建时间戳（ms） */
  createdAt: number
}

const QUEUE_KEY = 'dream_offline_queue'

// ─── 持久化读写 ────────────────────────────────────────────────────

function load(): QueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function save(queue: QueueItem[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch { /* 存储满时忽略 */ }
}

// ─── 内存队列（与 localStorage 同步） ─────────────────────────────

let _queue: QueueItem[] = load()

export function getQueue(): QueueItem[] {
  return _queue
}

export function pendingCount(): number {
  return _queue.length
}

/** 生成离线临时 ID */
export function genTempId(): string {
  return `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export function isTempId(id: string): boolean {
  return id.startsWith('offline_')
}

/** 入队一条操作 */
export function enqueue(item: Omit<QueueItem, 'id' | 'createdAt'>): QueueItem {
  const entry: QueueItem = { ...item, id: genTempId(), createdAt: Date.now() }
  _queue.push(entry)
  save(_queue)
  return entry
}

/** 清空整个队列 */
export function clearQueue() {
  _queue = []
  save(_queue)
}

/** 删除单条 */
function dequeue(id: string) {
  _queue = _queue.filter(i => i.id !== id)
  save(_queue)
}

// ─── 回放 ─────────────────────────────────────────────────────────

export interface ReplayResult {
  success: number
  failed: number
  errors: Array<{ item: QueueItem; error: string }>
}

/**
 * 按顺序回放队列到服务端。
 * POST 成功后，将返回的真实 id 替换后续队列中所有含该 tempId 的 path。
 */
export async function replayQueue(): Promise<ReplayResult> {
  const result: ReplayResult = { success: 0, failed: 0, errors: [] }

  // 取快照，避免回放期间入队新操作影响循环
  const snapshot = [..._queue]

  for (const item of snapshot) {
    try {
      let path = item.path
      let res: any = null

      const http = getAxiosInstance()
      if (item.method === 'POST') {
        res = await http.post(path, item.body ?? {})
        // 如果这是一个新增操作，将后续队列中的 tempId 替换为真实 id
        if (item.tempId && res?.id) {
          _queue = _queue.map(q => ({
            ...q,
            path: q.path.replace(item.tempId!, res.id),
            body: q.body
              ? JSON.parse(JSON.stringify(q.body).replace(new RegExp(item.tempId!, 'g'), res.id))
              : q.body,
          }))
          save(_queue)
        }
      } else if (item.method === 'PATCH') {
        await http.patch(path, item.body ?? {})
      } else if (item.method === 'DELETE') {
        await http.delete(path)
      }

      dequeue(item.id)
      result.success++
    } catch (e: any) {
      result.failed++
      result.errors.push({ item, error: e?.message ?? String(e) })
      // 任何情况都保留队列数据，只有成功才 dequeue
      // 网络错误时停止回放，等下次重连再试
      if (!e?.response) break
      // 其他错误（4xx/5xx）：记录错误，继续尝试后续条目，数据保留
    }
  }

  return result
}
