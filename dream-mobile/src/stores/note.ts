/**
 * Dream Mobile — 笔记 Store
 * 对标 PC 端 dream/src/stores/note.ts
 * 特别注意：saveNote 不回写 content（防止编辑器光标跳位，PC 端踩坑记录 #4）
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { noteDao, type NoteItem } from '../utils/db'
import { logger } from '../utils/logger'

export const useNoteStore = defineStore('note', () => {
  const notes = ref<NoteItem[]>([])
  const currentNote = ref<NoteItem | null>(null)
  const loading = ref(false)
  const searchKeyword = ref('')

  async function loadList(keyword?: string) {
    loading.value = true
    try {
      notes.value = await noteDao.list(keyword)
    } catch (err) {
      logger.error('NoteStore', 'loadList 失败', err)
    } finally {
      loading.value = false
    }
  }

  async function loadNote(id: number) {
    try {
      currentNote.value = await noteDao.get(id)
    } catch (err) {
      logger.error('NoteStore', `loadNote id=${id} 失败`, err)
    }
  }

  async function addNote(title: string, content = ''): Promise<number | undefined> {
    try {
      const id = await noteDao.add({ title, content, is_pinned: 0 })
      await loadList(searchKeyword.value || undefined)
      return id
    } catch (err) {
      logger.error('NoteStore', 'addNote 失败', err)
      console.error('[NoteStore] 新建失败', err)
    }
  }

  /**
   * 保存笔记（注意：不回写 content 到 store，防止编辑器光标跳位）
   * 对标 PC 端 note.ts saveNote 特殊规则
   */
  async function saveNote(id: number, data: { title?: string; content?: string; is_pinned?: number }) {
    try {
      await noteDao.update(id, data)
      // 仅回写 title / is_pinned，不回写 content
      const idx = notes.value.findIndex(n => n.id === id)
      if (idx !== -1) {
        if (data.title !== undefined) notes.value[idx].title = data.title
        if (data.is_pinned !== undefined) notes.value[idx].is_pinned = data.is_pinned
        notes.value[idx].updated_at = Date.now()
      }
      if (currentNote.value?.id === id) {
        if (data.title !== undefined) currentNote.value.title = data.title
        if (data.is_pinned !== undefined) currentNote.value.is_pinned = data.is_pinned
        // content 不回写
      }
    } catch (err) {
      logger.error('NoteStore', `saveNote id=${id} 失败`, err)
    }
  }

  async function removeNote(id: number) {
    try {
      await noteDao.remove(id)
      notes.value = notes.value.filter(n => n.id !== id)
      if (currentNote.value?.id === id) currentNote.value = null
    } catch (err) {
      logger.error('NoteStore', `removeNote id=${id} 失败`, err)
      console.error('[NoteStore] 删除失败', err)
    }
  }

  function setSearch(kw: string) {
    searchKeyword.value = kw
  }

  return {
    notes, currentNote, loading, searchKeyword,
    loadList, loadNote, addNote, saveNote, removeNote, setSearch,
  }
})
