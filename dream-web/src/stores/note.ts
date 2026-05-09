import { defineStore } from 'pinia'
import { ref } from 'vue'
import { noteApi, type Note } from '../utils/api'

export type { Note }

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

  async function search(kw: string) {
    keyword.value = kw
    await load()
  }

  async function select(note: Note) {
    current.value = note
  }

  async function addNote() {
    const note = await noteApi.add({ title: '无标题', content: '' })
    notes.value.unshift(note)
    current.value = note
    return note
  }

  // 保存（防抖由 view 层控制）
  async function saveNote(id: string, title: string, content: string) {
    const updated = await noteApi.update(id, { title, content })
    const idx = notes.value.findIndex(n => n.id === id)
    if (idx !== -1 && updated) {
      // 只更新 title / updated_at，不回写 content（避免光标跳位）
      notes.value[idx].title = title
      notes.value[idx].updated_at = updated.updated_at
    }
  }

  async function togglePin(note: Note) {
    const val = note.is_pinned ? 0 : 1
    await noteApi.update(note.id, { is_pinned: val })
    note.is_pinned = val
    notes.value.sort((a, b) => b.is_pinned - a.is_pinned)
  }

  async function remove(id: string) {
    await noteApi.delete(id)
    notes.value = notes.value.filter(n => n.id !== id)
    if (current.value?.id === id) current.value = notes.value[0] ?? null
  }

  return { notes, current, keyword, loading, load, search, select, addNote, saveNote, togglePin, remove }
})
