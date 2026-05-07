/**
 * Dream Mobile — 收藏 Store
 * 对标 PC 端 dream/src/stores/favorite.ts
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { favoriteDao, type FavoriteItem } from '../utils/db'
import { logger } from '../utils/logger'

export type FavoriteType = 'all' | 'link' | 'quote'

export const useFavoriteStore = defineStore('favorite', () => {
  const favorites = ref<FavoriteItem[]>([])
  const selectedType = ref<FavoriteType>('all')
  const searchKeyword = ref('')
  const loading = ref(false)

  const filteredFavorites = computed(() => {
    let list = favorites.value
    if (selectedType.value !== 'all') {
      list = list.filter(f => f.type === selectedType.value)
    }
    if (searchKeyword.value) {
      const kw = searchKeyword.value.toLowerCase()
      list = list.filter(f =>
        f.title.toLowerCase().includes(kw) ||
        f.content.toLowerCase().includes(kw) ||
        f.author.toLowerCase().includes(kw)
      )
    }
    return list
  })

  async function loadList(type?: FavoriteType) {
    loading.value = true
    try {
      const t = type ?? selectedType.value
      favorites.value = await favoriteDao.list(t === 'all' ? undefined : t)
    } catch (err) {
      logger.error('FavoriteStore', 'loadList 失败', err)
    } finally {
      loading.value = false
    }
  }

  async function addFavorite(data: Omit<FavoriteItem, 'id' | 'created_at' | 'updated_at'>): Promise<number | undefined> {
    try {
      const id = await favoriteDao.add(data)
      await loadList()
      return id
    } catch (err) {
      logger.error('FavoriteStore', 'addFavorite 失败', err)
      console.error('[FavoriteStore] 添加失败', err)
    }
  }

  async function updateFavorite(id: number, data: Partial<FavoriteItem>) {
    try {
      await favoriteDao.update(id, data)
      const idx = favorites.value.findIndex(f => f.id === id)
      if (idx !== -1) favorites.value[idx] = { ...favorites.value[idx], ...data }
    } catch (err) {
      logger.error('FavoriteStore', `updateFavorite id=${id} 失败`, err)
    }
  }

  async function pinFavorite(id: number, pinned: boolean) {
    try {
      await favoriteDao.pin(id, pinned)
      const idx = favorites.value.findIndex(f => f.id === id)
      if (idx !== -1) favorites.value[idx].is_pinned = pinned ? 1 : 0
      // 重新排序（置顶优先）
      favorites.value.sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return b.is_pinned - a.is_pinned
        return b.created_at - a.created_at
      })
    } catch (err) {
      logger.error('FavoriteStore', `pinFavorite id=${id} 失败`, err)
    }
  }

  async function removeFavorite(id: number) {
    try {
      await favoriteDao.remove(id)
      favorites.value = favorites.value.filter(f => f.id !== id)
    } catch (err) {
      logger.error('FavoriteStore', `removeFavorite id=${id} 失败`, err)
      console.error('[FavoriteStore] 删除失败', err)
    }
  }

  function selectType(type: FavoriteType) {
    selectedType.value = type
  }

  function setSearch(kw: string) {
    searchKeyword.value = kw
  }

  return {
    favorites, selectedType, searchKeyword, loading,
    filteredFavorites,
    loadList, addFavorite, updateFavorite, pinFavorite, removeFavorite,
    selectType, setSearch,
  }
})
