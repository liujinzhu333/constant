import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TodoItem } from '../../electron/preload/index'

export type { TodoItem }

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
      items.value = await window.dreamAPI.todo.list()
    } finally {
      loading.value = false
    }
  }

  async function add(data: { title: string; note?: string; priority?: number; due_at?: number; tags?: string[] }) {
    const item = await window.dreamAPI.todo.add(data)
    items.value.unshift(item)
    return item
  }

  async function update(id: string, data: Partial<TodoItem>) {
    const updated = await window.dreamAPI.todo.update(id, data as Record<string, unknown>)
    const idx = items.value.findIndex(i => i.id === id)
    if (idx !== -1 && updated) items.value[idx] = updated
    return updated
  }

  async function toggleDone(id: string) {
    const item = items.value.find(i => i.id === id)
    if (!item) return
    if (item.status === 'todo') {
      await window.dreamAPI.todo.done(id)
      item.status = 'done'
      item.done_at = Math.floor(Date.now() / 1000)
    } else {
      await window.dreamAPI.todo.undone(id)
      item.status = 'todo'
      item.done_at = null
    }
  }

  async function remove(id: string) {
    await window.dreamAPI.todo.delete(id)
    items.value = items.value.filter(i => i.id !== id)
  }

  return { items, filter, loading, filtered, todoCount, doneCount, load, add, update, toggleDone, remove }
})
