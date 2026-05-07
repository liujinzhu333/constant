<template>
  <div class="edit-page">
    <van-nav-bar
      :title="localTitle || '笔记'"
      left-arrow
      @click-left="router.back()"
    >
      <template #right>
        <div class="nav-right">
          <van-icon
            :name="isPinned ? 'top' : 'top'"
            :color="isPinned ? '#0071e3' : '#aeaeb2'"
            size="20"
            @click="togglePin"
          />
          <van-icon name="delete-o" color="#ff3b30" size="20" @click="deleteNote" />
        </div>
      </template>
    </van-nav-bar>

    <div class="editor-wrap">
      <input
        ref="titleRef"
        class="title-input"
        :value="localTitle"
        placeholder="标题"
        maxlength="200"
        @input="onTitleInput"
        @blur="flushSave"
      />
      <div class="divider-line"></div>
      <textarea
        class="content-input"
        :value="localContent"
        placeholder="开始记录..."
        @input="onContentInput"
        @blur="flushSave"
      />
    </div>

    <div class="toolbar">
      <span class="word-count">{{ localContent.length }} 字</span>
      <span class="save-hint">{{ saveHint }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { useNoteStore } from '../../stores/note'
import { useDebounce } from '../../composables/useDebounce'

const store = useNoteStore()
const route = useRoute()
const router = useRouter()
const titleRef = ref<HTMLInputElement>()
const noteId = ref(0)
const isPinned = ref(false)
const localTitle = ref('')
const localContent = ref('')
const saveHint = ref('')

onMounted(async () => {
  noteId.value = Number(route.params.id || 0)
  await loadNote()
})

async function loadNote() {
  if (!noteId.value) return
  await store.loadNote(noteId.value)
  const note = store.currentNote
  if (note) {
    localTitle.value = note.title
    localContent.value = note.content
    isPinned.value = !!note.is_pinned
  }
}

const { trigger: saveTrigger, flush: saveFlush } = useDebounce(
  async (title: string, content: string) => {
    if (!noteId.value) return
    await store.saveNote(noteId.value, { title, content })
    saveHint.value = '已保存'
    setTimeout(() => { saveHint.value = '' }, 1500)
  },
  800
)

function onTitleInput(e: Event) {
  localTitle.value = (e.target as HTMLInputElement).value
  saveTrigger(localTitle.value, localContent.value)
}

function onContentInput(e: Event) {
  localContent.value = (e.target as HTMLTextAreaElement).value
  saveTrigger(localTitle.value, localContent.value)
}

function flushSave() {
  saveFlush(localTitle.value, localContent.value)
}

async function togglePin() {
  isPinned.value = !isPinned.value
  await store.saveNote(noteId.value, { is_pinned: isPinned.value ? 1 : 0 })
  showToast(isPinned.value ? '已置顶' : '已取消置顶')
}

async function deleteNote() {
  await showConfirmDialog({ title: '删除笔记', message: '确定删除此笔记？删除后不可恢复' })
  await store.removeNote(noteId.value)
  router.back()
}

onUnmounted(() => { flushSave() })
</script>

<style lang="scss" scoped>
.edit-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
}

.editor-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.nav-right {
  display: flex;
  gap: 14px;
  align-items: center;
}

.title-input {
  padding: 14px 16px 10px;
  font-size: $font-2xl;
  font-weight: $font-bold;
  color: $color-text-primary;
  background: transparent;
  border: none;
  outline: none;
  width: 100%;
  box-sizing: border-box;
  flex-shrink: 0;
}

.divider-line {
  height: 1px;
  background: $color-separator;
  margin: 0 16px;
  flex-shrink: 0;
}

.content-input {
  flex: 1;
  padding: 12px 16px;
  font-size: $font-md;
  color: $color-text-primary;
  line-height: 1.8;
  background: transparent;
  border: none;
  outline: none;
  width: 100%;
  box-sizing: border-box;
  resize: none;
  overflow-y: auto;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px calc(env(safe-area-inset-bottom) + 8px);
  border-top: 1px solid $color-separator;
  background: #fff;
  flex-shrink: 0;
}

.word-count { font-size: $font-xs; color: $color-text-tertiary; }
.save-hint { font-size: $font-xs; color: $color-success; }
</style>
