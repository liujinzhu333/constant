<template>
  <div class="note-view">
    <!-- 左侧笔记列表 -->
    <div class="note-sidebar">
      <div class="sidebar-head">
        <el-input
          :model-value="searchKeyword"
          placeholder="搜索笔记..."
          size="small"
          clearable
          @input="onSearchInput"
          @clear="onSearchClear"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-button circle size="small" @click="createNote" title="新建笔记">
          <el-icon><Plus /></el-icon>
        </el-button>
      </div>

      <div class="note-list">
        <div
          v-for="note in store.notes" :key="note.id"
          class="note-card" :class="{ active: store.current?.id === note.id }"
          @click="store.select(note)"
        >
          <div class="note-card-header">
            <span class="note-title">{{ note.title || '无标题' }}</span>
            <el-icon v-if="note.is_pinned" size="12" color="var(--color-accent)"><StarFilled /></el-icon>
          </div>
          <div class="note-preview">{{ stripContent(note.content) }}</div>
          <div class="note-date">{{ formatDate(note.updated_at) }}</div>
        </div>

        <el-empty v-if="store.notes.length === 0"
          :description="searchKeyword ? '没有匹配的笔记' : '新建第一篇笔记'"
          :image-size="60"
        />
      </div>
    </div>

    <!-- 右侧编辑区 -->
    <div class="note-editor" v-if="store.current">
      <div class="editor-toolbar">
        <input
          class="title-input"
          :value="localTitle"
          placeholder="笔记标题"
          @input="onTitleInput"
          @blur="flushSave"
        />
        <div class="toolbar-actions">
          <el-tooltip :content="store.current.is_pinned ? '取消置顶' : '置顶'">
            <el-button circle size="small" @click="store.togglePin(store.current!)">
              <el-icon><Star /></el-icon>
            </el-button>
          </el-tooltip>
          <el-button circle size="small" type="danger" @click="removeNote" title="删除">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </div>

      <textarea
        class="note-content"
        :value="localContent"
        placeholder="开始记录..."
        @input="onContentInput"
        @blur="flushSave"
      />

      <div class="editor-footer">
        <el-text size="small" type="info">{{ formatDate(store.current.updated_at) }} 更新</el-text>
        <el-text size="small" type="info">{{ localContent.length }} 字</el-text>
      </div>
    </div>

    <div class="note-empty" v-else>
      <el-empty description="选择笔记或新建一篇" :image-size="80" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { Search, Plus, Star, StarFilled, Delete } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { useNoteStore } from '../../stores/note'
import { useDebouncedCall } from '../../composables/useDebounce'
import dayjs from 'dayjs'

const store = useNoteStore()

// ========== 搜索（防抖 400ms，保持 :model-value + @input 隔离）==========
const searchKeyword = ref('')
const { trigger: triggerSearch } = useDebouncedCall(() => {
  store.search(searchKeyword.value)
}, 400)

function onSearchInput(val: string) {
  searchKeyword.value = val
  triggerSearch()
}

function onSearchClear() {
  searchKeyword.value = ''
  store.search('')
}

// ========== 编辑区本地状态（与 store 解耦，防止光标跳位）==========
const localTitle = ref('')
const localContent = ref('')
let currentId = ''

watch(() => store.current, (note) => {
  if (!note) return
  if (note.id !== currentId) {
    currentId = note.id
    localTitle.value = note.title
    localContent.value = note.content
  }
}, { immediate: true })

const { trigger: triggerSave, flush: flushSave, cancel: cancelSave } = useDebouncedCall(() => {
  if (!currentId) return
  store.saveNote(currentId, localTitle.value, localContent.value)
}, 800)

function onTitleInput(e: Event) {
  localTitle.value = (e.target as HTMLInputElement).value
  triggerSave()
}

function onContentInput(e: Event) {
  localContent.value = (e.target as HTMLTextAreaElement).value
  triggerSave()
}

onUnmounted(() => flushSave())
onMounted(() => store.load())

async function createNote() {
  cancelSave()
  const note = await store.addNote()
  localTitle.value = note.title
  localContent.value = note.content
  currentId = note.id
}

async function removeNote() {
  if (!store.current) return
  await ElMessageBox.confirm('确定删除这篇笔记吗？', '删除确认', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  })
  cancelSave()
  currentId = ''
  await store.remove(store.current.id)
}

function stripContent(s: string) {
  return s.replace(/<[^>]*>/g, '').slice(0, 80)
}

function formatDate(ts: number) {
  const d = dayjs.unix(ts)
  if (d.isToday()) return d.format('HH:mm')
  if (d.isYesterday()) return '昨天'
  return d.format('MM/DD')
}
</script>

<style scoped>
.note-view { display: flex; height: 100%; overflow: hidden; }

.note-sidebar {
  width: 220px; flex-shrink: 0; border-right: 1px solid var(--color-border);
  background: var(--color-bg-sidebar); display: flex; flex-direction: column; padding: 12px 10px;
}
.sidebar-head { display: flex; gap: 6px; margin-bottom: 10px; align-items: center; }

.note-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.note-card {
  padding: 10px; border-radius: var(--radius-sm); cursor: pointer;
  border: 1px solid transparent; transition: all 150ms;
}
.note-card:hover { background: var(--color-bg-card); border-color: var(--color-border); }
.note-card.active { background: var(--color-accent-light); border-color: var(--color-accent); }
.note-card-header { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
.note-title { font-size: 13px; font-weight: 600; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.note-preview { font-size: 12px; color: var(--color-text-muted); margin-top: 3px; line-height: 1.4; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.note-date { font-size: 11px; color: var(--color-text-muted); margin-top: 4px; }

.note-editor { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.note-empty { flex: 1; display: flex; align-items: center; justify-content: center; }

.editor-toolbar {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 20px; border-bottom: 1px solid var(--color-border); flex-shrink: 0;
}
.title-input {
  flex: 1; font-size: 18px; font-weight: 700; color: var(--color-text);
  border: none; background: transparent; outline: none;
}
.toolbar-actions { display: flex; gap: 4px; }

.note-content {
  flex: 1; padding: 20px; font-size: 15px; line-height: 1.8;
  color: var(--color-text); background: transparent; border: none;
  outline: none; resize: none; font-family: inherit;
}

.editor-footer {
  display: flex; justify-content: space-between; flex-shrink: 0;
  padding: 8px 20px; border-top: 1px solid var(--color-border);
}
</style>
