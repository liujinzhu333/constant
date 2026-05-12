import { defineStore } from 'pinia'
import { ref } from 'vue'
import { favoriteApi, offlinePost, offlinePatch, offlineDelete, type Favorite, type FavoriteType } from '../utils/api'
import { useConnectionStore } from './connection'

export type { FavoriteType }
export type { Favorite }

const now = () => Math.floor(Date.now() / 1000)

export const useFavoriteStore = defineStore('favorite', () => {
  const items = ref<Favorite[]>([])
  const loading = ref(false)

  async function load(filter?: { type?: string; keyword?: string }) {
    loading.value = true
    try {
      items.value = await favoriteApi.list(filter)
    } finally {
      loading.value = false
    }
  }

  // 向 connection store 注册数据刷新回调（重连同步时调用）
  // favorite load 带参数，注册一个无参包装
  useConnectionStore().registerRefresh(() => load())

  async function add(data: {
    type: FavoriteType; title?: string; url?: string
    content?: string; author?: string; tags?: string[]
  }) {
    const body = JSON.parse(JSON.stringify(data)) as Record<string, unknown>
    const t = now()
    const created = await offlinePost<Favorite>(
      '/api/favorites',
      body,
      (tempId) => ({
        id: tempId, type: data.type,
        title: data.title ?? '', url: data.url ?? '',
        content: data.content ?? '', author: data.author ?? '',
        tags: data.tags ? JSON.stringify(data.tags) : '[]',
        is_pinned: 0, created_at: t, updated_at: t,
      }),
    )
    if (created.is_pinned) {
      items.value.unshift(created)
    } else {
      const firstNonPinned = items.value.findIndex(i => !i.is_pinned)
      if (firstNonPinned === -1) items.value.push(created)
      else items.value.splice(firstNonPinned, 0, created)
    }
    return created
  }

  async function update(id: string, data: Partial<Omit<Favorite, 'id' | 'created_at' | 'updated_at'>>) {
    const body = JSON.parse(JSON.stringify(data)) as Record<string, unknown>
    const current = items.value.find(i => i.id === id)
    if (!current) return
    const updated = await offlinePatch<Favorite>(`/api/favorites/${id}`, body, current)
    const idx = items.value.findIndex(i => i.id === id)
    if (idx !== -1) items.value[idx] = updated
    return updated
  }

  async function togglePin(item: Favorite) {
    const pinned = !item.is_pinned
    await offlinePatch<Favorite>(
      `/api/favorites/${item.id}`,
      { is_pinned: pinned ? 1 : 0 },
      item,
    )
    const idx = items.value.findIndex(i => i.id === item.id)
    if (idx !== -1) {
      items.value[idx] = { ...items.value[idx], is_pinned: pinned ? 1 : 0 }
      items.value.sort((a, b) => {
        if (b.is_pinned !== a.is_pinned) return b.is_pinned - a.is_pinned
        return b.created_at - a.created_at
      })
    }
  }

  async function remove(id: string) {
    await offlineDelete(`/api/favorites/${id}`)
    items.value = items.value.filter(i => i.id !== id)
  }

  return { items, loading, load, add, update, togglePin, remove }
})
