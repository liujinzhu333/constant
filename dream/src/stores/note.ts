import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Note } from '../../electron/preload/index'

export type { Note }

export const useNoteStore = defineStore('note', () => {
  const notes = ref<Note[]>([])
  const current = ref<Note | null>(null)
  const keyword = ref('')
  const loading = ref(false)
  async function load() {
    loading.value = true
    try {
      notes.value = await window.dreamAPI.note.list(keyword.value)
    } finally {
      loading.value = false
    }
  }

  async function search(kw: string) {
    keyword.value = kw
    await load()
  }

  async function select(note: Note) {
    current.value = note
  }

  async function addNote() {
    const note = await window.dreamAPI.note.add({ title: '无标题', content: '' })
    notes.value.unshift(note)
    current.value = note
    return note
  }

  // 保存（防抖由 view 层控制，store 只负责 IPC）
  async function saveNote(id: string, title: string, content: string) {
    const updated = await window.dreamAPI.note.update(id, { title, content } as Record<string, unknown>)
    const idx = notes.value.findIndex(n => n.id === id)
    if (idx !== -1 && updated) {
      // 只更新 title / updated_at，不回写 content（避免触发 watch 导致光标跳位）
      notes.value[idx].title = title
      notes.value[idx].updated_at = (updated as typeof notes.value[0]).updated_at
    }
  }

  async function togglePin(note: Note) {
    const val = note.is_pinned ? 0 : 1
    await window.dreamAPI.note.update(note.id, { is_pinned: val } as Record<string, unknown>)
    note.is_pinned = val
    notes.value.sort((a, b) => b.is_pinned - a.is_pinned)
  }

  async function remove(id: string) {
    await window.dreamAPI.note.delete(id)
    notes.value = notes.value.filter(n => n.id !== id)
    if (current.value?.id === id) current.value = notes.value[0] ?? null
  }

  return { notes, current, keyword, loading, load, search, select, addNote, saveNote, togglePin, remove }
})
