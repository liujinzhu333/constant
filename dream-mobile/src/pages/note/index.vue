<template>
  <div class="note-page">
    <van-nav-bar title="笔记" />
    <van-search
      v-model="store.searchKeyword"
      placeholder="搜索笔记..."
      @update:model-value="onSearch"
      @clear="clearSearch"
    />

    <div class="list-wrap">
      <van-loading v-if="store.loading" class="loading-center" />
      <van-empty v-else-if="store.notes.length === 0"
        :description="store.searchKeyword ? '没有匹配的笔记' : '暂无笔记，点击 + 新建'" />

      <van-pull-refresh v-else v-model="refreshing" @refresh="onRefresh">
        <div class="list-inner">
          <van-cell
            v-for="note in store.notes"
            :key="note.id"
            clickable
            :title="note.title || '无标题'"
            :label="note.content"
            @click="goEdit(note.id)"
          >
            <template #icon>
              <van-icon v-if="note.is_pinned" name="top" color="#0071e3" style="margin-right:6px;margin-top:1px" />
            </template>
            <template #value>
              <div class="note-cell-right">
                <span class="note-date">{{ formatDate(note.updated_at) }}</span>
                <van-icon name="ellipsis" size="18" color="#aeaeb2" @click.stop="showNoteActions(note)" />
              </div>
            </template>
          </van-cell>
        </div>
      </van-pull-refresh>
    </div>

    <div class="fab" @click="createNote">
      <van-icon name="plus" color="#fff" size="24" />
    </div>

    <!-- 长按操作菜单 -->
    <van-action-sheet
      v-model:show="actionSheetShow"
      :actions="actionSheetActions"
      :title="`操作「${actionNote?.title || '无标题'}」`"
      cancel-text="取消"
      @select="onActionSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog } from 'vant'
import { useNoteStore } from '../../stores/note'
import { useDebounce } from '../../composables/useDebounce'
import type { NoteItem } from '../../utils/db'
import dayjs from 'dayjs'

const store = useNoteStore()
const router = useRouter()
const refreshing = ref(false)
const actionSheetShow = ref(false)
const actionNote = ref<NoteItem | null>(null)
const actionSheetActions = ref<Array<{ name: string; color?: string }>>([])

onMounted(() => store.loadList())

async function onRefresh() {
  await store.loadList(store.searchKeyword || undefined)
  refreshing.value = false
}

const { trigger: searchTrigger } = useDebounce((kw: string) => {
  store.loadList(kw || undefined)
}, 400)

function onSearch(kw: string) {
  store.setSearch(kw)
  searchTrigger(kw)
}

function clearSearch() {
  store.setSearch('')
  store.loadList()
}

function formatDate(ts: number) {
  const d = dayjs(ts)
  if (d.isToday()) return d.format('HH:mm')
  if (d.isYesterday()) return '昨天'
  return d.format('MM/DD')
}

async function createNote() {
  const id = await store.addNote('新建笔记')
  if (id) router.push(`/note/edit/${id}`)
}

function goEdit(id: number) {
  router.push(`/note/edit/${id}`)
}

function showNoteActions(note: NoteItem) {
  actionNote.value = note
  actionSheetActions.value = [
    { name: note.is_pinned ? '取消置顶' : '置顶' },
    { name: '删除', color: '#ff3b30' },
  ]
  actionSheetShow.value = true
}

async function onActionSelect(action: { name: string }) {
  const note = actionNote.value
  if (!note) return
  actionSheetShow.value = false
  if (action.name === '置顶' || action.name === '取消置顶') {
    await store.saveNote(note.id, { is_pinned: note.is_pinned ? 0 : 1 })
    store.loadList(store.searchKeyword || undefined)
  } else if (action.name === '删除') {
    await showConfirmDialog({ title: '删除笔记', message: '确定删除此笔记？删除后不可恢复' })
    await store.removeNote(note.id)
  }
}
</script>

<style lang="scss" scoped>
.note-page { display: flex; flex-direction: column; height: 100%; background: $color-bg; }
.list-wrap { flex: 1; overflow-y: auto; }
.loading-center { display: flex; justify-content: center; padding: 40px; }
.list-inner { padding-bottom: 80px; }

.note-cell-right { display: flex; align-items: center; gap: 10px; }
.note-date { font-size: $font-xs; color: $color-text-tertiary; }
.fab { position: fixed; right: 20px; bottom: 80px; width: 50px; height: 50px; border-radius: 50%; background: $color-primary; display: flex; align-items: center; justify-content: center; box-shadow: $shadow-lg; cursor: pointer; }
</style>
