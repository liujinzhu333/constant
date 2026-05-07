<template>
  <div class="todo-page">
    <!-- 顶部导航 -->
    <van-nav-bar title="待办" />

    <!-- 筛选 Tab -->
    <van-tabs v-model:active="activeTab" color="#0071e3" title-active-color="#0071e3" sticky>
      <van-tab
        v-for="tab in filterTabs"
        :key="tab.value"
        :title="tab.label"
        :name="tab.value"
        :badge="tab.value === 'pending' && store.pendingCount > 0 ? String(store.pendingCount) : ''"
      />
    </van-tabs>

    <!-- 列表 -->
    <div class="list-wrap">
      <van-loading v-if="store.loading" class="loading-center" />

      <van-empty v-else-if="store.filteredTodos.length === 0"
        :description="store.filter === 'done' ? '暂无已完成的待办' : '暂无待办，点击 + 添加'" />

      <van-pull-refresh v-else v-model="refreshing" @refresh="onRefresh">
        <div class="list-inner">
          <van-swipe-cell
            v-for="item in store.filteredTodos"
            :key="item.id"
            class="swipe-cell"
          >
            <van-cell class="todo-cell" :class="{ done: item.status === 'done' }" clickable @click="openEdit(item)">
              <template #icon>
                <div class="check-area" @click.stop="toggleStatus(item)">
                  <div class="check-circle" :class="{ checked: item.status === 'done' }">
                    <van-icon v-if="item.status === 'done'" name="success" color="#fff" size="13" />
                  </div>
                </div>
              </template>
              <template #title>
                <span class="todo-title" :class="{ 'line-through': item.status === 'done' }">{{ item.title }}</span>
              </template>
              <template #label>
                <div class="meta">
                  <span class="priority-dot" :style="{ background: priorityColor(item.priority) }"></span>
                  <span class="priority-label" :style="{ color: priorityColor(item.priority) }">{{ priorityLabel(item.priority) }}</span>
                  <span v-if="item.due_at" class="due-date" :class="{ overdue: isOverdue(item) }">{{ formatDue(item.due_at) }}</span>
                </div>
                <span v-if="item.note" class="item-note van-ellipsis">{{ item.note }}</span>
              </template>
            </van-cell>
            <template #right>
              <van-button class="delete-btn" square type="danger" text="删除" @click="confirmDelete(item)" />
            </template>
          </van-swipe-cell>
        </div>
      </van-pull-refresh>
    </div>

    <!-- FAB -->
    <div class="fab" @click="openAdd">
      <van-icon name="plus" color="#fff" size="24" />
    </div>

    <!-- 新增/编辑弹窗 -->
    <BottomSheet :visible="sheetVisible" @close="closeSheet">
      <div class="sheet-inner">
        <van-nav-bar
          :title="editingItem ? '编辑待办' : '新增待办'"
          right-text="保存"
          left-text="取消"
          @click-left="closeSheet"
          @click-right="submitForm"
        />
        <div class="form-wrap">
          <van-cell-group inset>
            <van-field v-model="form.title" label="标题" placeholder="输入待办标题" maxlength="100" />
            <van-field v-model="form.note" label="备注" placeholder="可选备注" maxlength="500" />
            <van-field label="截止日期">
              <template #input>
                <input type="date" v-model="form.dueDate" class="date-input" />
              </template>
            </van-field>
          </van-cell-group>

          <div class="priority-wrap">
            <span class="priority-label-title">优先级</span>
            <div class="priority-selector">
              <div
                v-for="p in priorities"
                :key="p.value"
                class="priority-option"
                :class="{ selected: form.priority === p.value }"
                :style="form.priority === p.value ? { background: p.color, borderColor: p.color } : {}"
                @click="form.priority = p.value"
              >
                <span :style="{ color: form.priority === p.value ? '#fff' : p.color }">{{ p.label }}</span>
              </div>
            </div>
          </div>

          <div class="form-actions">
            <van-button v-if="editingItem" type="danger" plain block @click="deleteItem" style="margin-bottom:8px">删除</van-button>
            <van-button type="primary" block @click="submitForm">{{ editingItem ? '保存' : '添加' }}</van-button>
          </div>
        </div>
      </div>
    </BottomSheet>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { showToast, showConfirmDialog } from 'vant'
import { useTodoStore, type Priority } from '../../stores/todo'
import type { TodoItem } from '../../utils/db'
import dayjs from 'dayjs'
import BottomSheet from '../../components/BottomSheet.vue'

const store = useTodoStore()
const sheetVisible = ref(false)
const refreshing = ref(false)
const activeTab = ref<'all' | 'pending' | 'done'>('all')

const filterTabs = [
  { value: 'all' as const, label: '全部' },
  { value: 'pending' as const, label: '待完成' },
  { value: 'done' as const, label: '已完成' },
]

const priorities = [
  { value: 'high' as Priority, label: '高', color: '#ff3b30' },
  { value: 'medium' as Priority, label: '中', color: '#ff9f0a' },
  { value: 'low' as Priority, label: '低', color: '#34c759' },
]

const editingItem = ref<TodoItem | null>(null)
const form = ref({ title: '', note: '', priority: 'medium' as Priority, dueDate: '' })

watch(activeTab, (v) => store.setFilter(v))

onMounted(() => store.loadList())

async function onRefresh() {
  await store.loadList()
  refreshing.value = false
}

function priorityColor(p: string) {
  const map: Record<string, string> = { high: '#ff3b30', medium: '#ff9f0a', low: '#34c759' }
  return map[p] || '#8e8e93'
}

function priorityLabel(p: string) {
  const map: Record<string, string> = { high: '高', medium: '中', low: '低' }
  return map[p] || ''
}

function formatDue(ts: number) {
  const d = dayjs(ts)
  if (d.isToday()) return '今天'
  if (d.isTomorrow()) return '明天'
  return d.format('MM/DD')
}

function isOverdue(item: TodoItem) {
  return item.status === 'pending' && item.due_at !== null && item.due_at < Date.now()
}

async function toggleStatus(item: TodoItem) {
  if (item.status === 'done') await store.undoneTodo(item.id)
  else await store.doneTodo(item.id)
}

function openAdd() {
  editingItem.value = null
  form.value = { title: '', note: '', priority: 'medium', dueDate: '' }
  sheetVisible.value = true
}

function openEdit(item: TodoItem) {
  editingItem.value = item
  form.value = {
    title: item.title,
    note: item.note || '',
    priority: item.priority as Priority,
    dueDate: item.due_at ? dayjs(item.due_at).format('YYYY-MM-DD') : '',
  }
  sheetVisible.value = true
}

function closeSheet() { sheetVisible.value = false }

async function submitForm() {
  if (!form.value.title.trim()) { showToast('请输入标题'); return }
  const dueAt = form.value.dueDate ? dayjs(form.value.dueDate).endOf('day').valueOf() : null
  if (editingItem.value) {
    await store.updateTodo(editingItem.value.id, {
      title: form.value.title.trim(), note: form.value.note.trim(),
      priority: form.value.priority, due_at: dueAt,
    })
  } else {
    await store.addTodo({ title: form.value.title.trim(), note: form.value.note.trim(), priority: form.value.priority, due_at: dueAt })
  }
  closeSheet()
}

async function deleteItem() {
  if (!editingItem.value) return
  await showConfirmDialog({ title: '删除待办', message: `确定删除「${editingItem.value.title}」？` })
  await store.removeTodo(editingItem.value.id)
  closeSheet()
}

async function confirmDelete(item: TodoItem) {
  await showConfirmDialog({ title: '删除待办', message: `确定删除「${item.title}」？` })
  store.removeTodo(item.id)
}
</script>

<style lang="scss" scoped>
.todo-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: $color-bg;
}

.list-wrap {
  flex: 1;
  overflow-y: auto;
}

.loading-center {
  display: flex;
  justify-content: center;
  padding: 40px;
}

.list-inner {
  padding-bottom: 80px;
}

.swipe-cell {
  // 让右侧删除按钮撑满整行高度
  :deep(.van-swipe-cell__right) {
    display: flex;
    align-items: stretch;
  }
}

.delete-btn {
  height: 100%;
}

.todo-cell {
  &.done { opacity: 0.55; }
}

.check-area {
  display: flex;
  align-items: center;
  margin-right: 10px;
  padding-top: 2px;
}

.check-circle {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid $color-border;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all $transition-fast;

  &.checked {
    background: $color-primary;
    border-color: $color-primary;
  }
}

.todo-title {
  font-size: $font-md;
  color: $color-text-primary;
  font-weight: $font-medium;
  &.line-through {
    text-decoration: line-through;
    color: $color-text-tertiary;
  }
}

.meta {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 3px;
}

.priority-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
}

.priority-label {
  font-size: $font-xs;
  font-weight: $font-medium;
}

.due-date {
  font-size: $font-xs;
  color: $color-text-tertiary;
  &.overdue { color: $color-danger; }
}

.item-note {
  font-size: $font-xs;
  color: $color-text-secondary;
  margin-top: 2px;
  display: block;
}

.fab {
  position: fixed;
  right: 20px;
  bottom: 80px;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: $color-primary;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: $shadow-lg;
  z-index: 10;
  cursor: pointer;
}

.sheet-inner {
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.form-wrap {
  overflow-y: auto;
  padding: 12px 0 calc(env(safe-area-inset-bottom) + 12px);
}

.date-input {
  border: none;
  outline: none;
  font-size: $font-md;
  color: $color-text-primary;
  width: 100%;
}

.priority-wrap {
  padding: 12px 16px;
}

.priority-label-title {
  font-size: $font-sm;
  color: $color-text-secondary;
  display: block;
  margin-bottom: 8px;
}

.priority-selector {
  display: flex;
  gap: 8px;
}

.priority-option {
  flex: 1;
  text-align: center;
  padding: 8px;
  border-radius: $radius-md;
  border: 1px solid $color-border;
  font-size: $font-sm;
  cursor: pointer;
  transition: all $transition-fast;
}

.form-actions {
  padding: 0 16px 16px;
}
</style>
