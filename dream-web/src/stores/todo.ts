import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { todoApi, offlinePost, offlinePatch, offlineDelete, type TodoItem } from '../utils/api'
import { useConnectionStore } from './connection'

export type { TodoItem }

const now = () => Math.floor(Date.now() / 1000)

export const useTodoStore = defineStore('todo', () => {
  const items = ref<TodoItem[]>([])
  const filter = ref<'all' | 'todo' | 'done'>('all')
  const loading = ref(false)

  const filtered = computed(() => {
    if (filter.value === 'all') return items.value
    return items.value.filter(i => i.status === filter.value)
  })

  const todoCount = computed(() => items.value.filter(i => i.status === 'todo').length)
  const doneCount = computed(() => items.value.filter(i => i.status === 'done').length)

  async function load() {
    loading.value = true
    try {
      items.value = await todoApi.list()
    } finally {
      loading.value = false
    }
  }

  // 向 connection store 注册数据刷新回调（重连同步时调用）
  useConnectionStore().registerRefresh(load)

  async function add(data: { title: string; note?: string; priority?: number; due_at?: number; tags?: string[] }) {
    const t = now()
    const item = await offlinePost<TodoItem>(
      '/api/todos',
      data as Record<string, unknown>,
      (tempId) => ({
        id: tempId, title: data.title, note: data.note ?? '',
        status: 'todo' as const, priority: data.priority ?? 2,
        due_at: data.due_at ?? null, remind_at: null,
        tags: data.tags ? JSON.stringify(data.tags) : '[]',
        done_at: null, created_at: t, updated_at: t,
      }),
    )
    items.value.unshift(item)
    return item
  }

  async function update(id: string, data: Partial<TodoItem>) {
    const current = items.value.find(i => i.id === id)
    if (!current) return
    const updated = await offlinePatch<TodoItem>(
      `/api/todos/${id}`,
      data as Record<string, unknown>,
      current,
    )
    const idx = items.value.findIndex(i => i.id === id)
    if (idx !== -1) items.value[idx] = updated
    return updated
  }

  async function toggleDone(id: string) {
    const item = items.value.find(i => i.id === id)
    if (!item) return
    if (item.status === 'todo') {
      const patch = { status: 'done' as const, done_at: now() }
      await offlinePatch<TodoItem>(`/api/todos/${id}`, patch, item)
      item.status = 'done'
      item.done_at = patch.done_at
    } else {
      const patch = { status: 'todo' as const, done_at: null }
      await offlinePatch<TodoItem>(`/api/todos/${id}`, patch, item)
      item.status = 'todo'
      item.done_at = null
    }
  }

  async function remove(id: string) {
    await offlineDelete(`/api/todos/${id}`)
    items.value = items.value.filter(i => i.id !== id)
  }

  return { items, filter, loading, filtered, todoCount, doneCount, load, add, update, toggleDone, remove }
})
