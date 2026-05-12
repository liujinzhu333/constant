import { defineStore } from 'pinia'
import { ref } from 'vue'
import { noteApi, offlinePost, offlinePatch, offlineDelete, type Note } from '../utils/api'
import { useConnectionStore } from './connection'

export type { Note }

const now = () => Math.floor(Date.now() / 1000)

export const useNoteStore = defineStore('note', () => {
  const notes = ref<Note[]>([])
  const current = ref<Note | null>(null)
  const keyword = ref('')
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      notes.value = await noteApi.list(keyword.value)
    } finally {
      loading.value = false
    }
  }

  // 向 connection store 注册数据刷新回调（重连同步时调用）
  useConnectionStore().registerRefresh(load)

  async function search(kw: string) {
    keyword.value = kw
    await load()
  }

  async function select(note: Note) {
    current.value = note
  }

  async function addNote() {
    const t = now()
    const note = await offlinePost<Note>(
      '/api/notes',
      { title: '无标题', content: '' },
      (tempId) => ({
        id: tempId, title: '无标题', content: '',
        tags: '[]', is_pinned: 0, created_at: t, updated_at: t,
      }),
    )
    notes.value.unshift(note)
    current.value = note
    return note
  }

  async function saveNote(id: string, title: string, content: string) {
    const item = notes.value.find(n => n.id === id)
    if (!item) return
    const updated = await offlinePatch<Note>(
      `/api/notes/${id}`,
      { title, content },
      item,
    )
    const idx = notes.value.findIndex(n => n.id === id)
    if (idx !== -1 && updated) {
      // 只更新 title / updated_at，不回写 content（避免光标跳位）
      notes.value[idx].title = title
      notes.value[idx].updated_at = updated.updated_at
    }
    // 离线时同步更新 current.content 供继续编辑
    if (current.value?.id === id) {
      current.value = { ...current.value, title, content, updated_at: updated.updated_at }
    }
  }

  async function togglePin(note: Note) {
    const val = note.is_pinned ? 0 : 1
    await offlinePatch<Note>(`/api/notes/${note.id}`, { is_pinned: val }, note)
    note.is_pinned = val
    notes.value.sort((a, b) => b.is_pinned - a.is_pinned)
  }

  async function remove(id: string) {
    await offlineDelete(`/api/notes/${id}`)
    notes.value = notes.value.filter(n => n.id !== id)
    if (current.value?.id === id) current.value = notes.value[0] ?? null
  }

  return { notes, current, keyword, loading, load, search, select, addNote, saveNote, togglePin, remove }
})
