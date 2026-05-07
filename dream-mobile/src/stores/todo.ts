/**
 * Dream Mobile — 待办 Store
 * 对标 PC 端 dream/src/stores/todo.ts
 * 将 window.dreamAPI.todo.xxx() 替换为 todoDao.xxx()
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { todoDao, type TodoItem } from '../utils/db'
import { logger } from '../utils/logger'

export type TodoFilter = 'all' | 'pending' | 'done'
export type Priority = 'high' | 'medium' | 'low'

export const useTodoStore = defineStore('todo', () => {
  const todos = ref<TodoItem[]>([])
  const filter = ref<TodoFilter>('all')
  const loading = ref(false)

  const filteredTodos = computed(() => {
    if (filter.value === 'all') return todos.value
    return todos.value.filter(t => t.status === filter.value)
  })

  const pendingCount = computed(() => todos.value.filter(t => t.status === 'pending').length)

  async function loadList() {
    loading.value = true
    try {
      todos.value = await todoDao.list()
    } catch (err) {
      logger.error('TodoStore', 'loadList 失败', err)
      console.error('[TodoStore] 加载失败', err)
    } finally {
      loading.value = false
    }
  }

  async function addTodo(data: {
    title: string
    note?: string
    priority?: Priority
    due_at?: number | null
    remind_at?: number | null
    tags?: string[]
  }) {
    try {
      const id = await todoDao.add({
        title: data.title,
        note: data.note || '',
        priority: data.priority || 'medium',
        status: 'pending',
        due_at: data.due_at ?? null,
        remind_at: data.remind_at ?? null,
        tags: JSON.stringify(data.tags || []),
      })
      await loadList()
      logger.info('TodoStore', `新增待办 id=${id}`)
    } catch (err) {
      logger.error('TodoStore', 'addTodo 失败', err)
      console.error('[TodoStore] 添加失败', err)
    }
  }

  async function updateTodo(id: number, data: Partial<TodoItem>) {
    try {
      await todoDao.update(id, data)
      const idx = todos.value.findIndex(t => t.id === id)
      if (idx !== -1) todos.value[idx] = { ...todos.value[idx], ...data }
    } catch (err) {
      logger.error('TodoStore', `updateTodo id=${id} 失败`, err)
      console.error('[TodoStore] 更新失败', err)
    }
  }

  async function doneTodo(id: number) {
    try {
      await todoDao.done(id)
      const idx = todos.value.findIndex(t => t.id === id)
      if (idx !== -1) todos.value[idx].status = 'done'
    } catch (err) {
      logger.error('TodoStore', `doneTodo id=${id} 失败`, err)
    }
  }

  async function undoneTodo(id: number) {
    try {
      await todoDao.undone(id)
      const idx = todos.value.findIndex(t => t.id === id)
      if (idx !== -1) todos.value[idx].status = 'pending'
    } catch (err) {
      logger.error('TodoStore', `undoneTodo id=${id} 失败`, err)
    }
  }

  async function removeTodo(id: number) {
    try {
      await todoDao.remove(id)
      todos.value = todos.value.filter(t => t.id !== id)
    } catch (err) {
      logger.error('TodoStore', `removeTodo id=${id} 失败`, err)
      console.error('[TodoStore] 删除失败', err)
    }
  }

  function setFilter(f: TodoFilter) {
    filter.value = f
  }

  return {
    todos, filter, loading, filteredTodos, pendingCount,
    loadList, addTodo, updateTodo, doneTodo, undoneTodo, removeTodo, setFilter,
  }
})
