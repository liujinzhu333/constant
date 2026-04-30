import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Favorite, FavoriteType } from '../../electron/preload/index'

export type { FavoriteType }
export type { Favorite }

export const useFavoriteStore = defineStore('favorite', () => {
  const items = ref<Favorite[]>([])
  const loading = ref(false)

  async function load(filter?: { type?: string; keyword?: string }) {
    loading.value = true
    try {
      items.value = await window.dreamAPI.favorite.list(filter)
    } finally {
      loading.value = false
    }
  }

  async function add(data: {
    type: FavoriteType; title?: string; url?: string
    content?: string; author?: string; tags?: string[]
  }) {
    const created = await window.dreamAPI.favorite.add(data)
    // 置顶的插到最前，否则按创建时间降序插入头部
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
    const updated = await window.dreamAPI.favorite.update(id, data)
    const idx = items.value.findIndex(i => i.id === id)
    if (idx !== -1) items.value[idx] = updated
    return updated
  }

  async function togglePin(item: Favorite) {
    const pinned = !item.is_pinned
    await window.dreamAPI.favorite.pin(item.id, !!pinned)
    const idx = items.value.findIndex(i => i.id === item.id)
    if (idx !== -1) {
      items.value[idx] = { ...items.value[idx], is_pinned: pinned ? 1 : 0 }
      // 重新排序：置顶的排前面
      items.value.sort((a, b) => {
        if (b.is_pinned !== a.is_pinned) return b.is_pinned - a.is_pinned
        return b.created_at - a.created_at
      })
    }
  }

  async function remove(id: string) {
    await window.dreamAPI.favorite.delete(id)
    items.value = items.value.filter(i => i.id !== id)
  }

  return { items, loading, load, add, update, togglePin, remove }
})
