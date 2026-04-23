<template>
  <div class="todo-view">
    <!-- 头部 -->
    <div class="view-header">
      <div class="header-left">
        <h2>待办任务</h2>
        <el-badge v-if="store.todoCount" :value="store.todoCount" :max="99" type="primary" />
      </div>
      <el-button type="primary" @click="openAdd">+ 新建</el-button>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <el-radio-group v-model="store.filter" size="small">
        <el-radio-button v-for="f in filters" :key="f.value" :value="f.value">{{ f.label }}</el-radio-button>
      </el-radio-group>

      <el-select v-model="priorityFilter" placeholder="全部优先级" size="small" style="width:120px" clearable @change="store.load()">
        <el-option label="高优先级" value="1" />
        <el-option label="中优先级" value="2" />
        <el-option label="低优先级" value="3" />
      </el-select>
    </div>

    <!-- 列表 -->
    <div class="todo-list" v-loading="store.loading">
      <div
        v-for="item in store.filtered" :key="item.id"
        class="todo-item" :class="{ done: item.status === 'done' }"
      >
        <el-checkbox
          :model-value="item.status === 'done'"
          @change="store.toggleDone(item.id)"
        />

        <div class="todo-body" @click="openEdit(item)">
          <div class="todo-title">{{ item.title }}</div>
          <div class="todo-meta">
            <el-tag :type="priorityTagType(item.priority)" size="small" effect="plain">
              {{ priorityLabel(item.priority) }}
            </el-tag>
            <el-text v-if="item.due_at" size="small" :type="isOverdue(item) ? 'danger' : 'info'">
              {{ formatDate(item.due_at) }}
            </el-text>
            <el-icon v-if="item.note" size="12"><Document /></el-icon>
          </div>
        </div>

        <el-button link type="danger" size="small" @click.stop="store.remove(item.id)">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>

      <el-empty v-if="store.filtered.length === 0 && !store.loading"
        :description="store.filter === 'done' ? '暂无已完成的任务' : '暂无待办，新建一个吧'"
        :image-size="80"
      />
    </div>

    <!-- 新建/编辑弹窗 -->
    <el-dialog
      v-model="modalVisible"
      :title="editId ? '编辑待办' : '新建待办'"
      width="440px"
      @closed="closeModal"
    >
      <el-form :model="form" label-width="70px">
        <el-form-item label="标题">
          <el-input
            ref="titleInputRef"
            v-model="form.title"
            placeholder="任务标题"
            @keydown.enter="submit"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="3" placeholder="备注（可选）" />
        </el-form-item>
        <el-form-item label="优先级">
          <el-radio-group v-model="form.priority">
            <el-radio-button :value="1">
              <el-text type="danger">高</el-text>
            </el-radio-button>
            <el-radio-button :value="2">
              <el-text type="warning">中</el-text>
            </el-radio-button>
            <el-radio-button :value="3">
              <el-text type="success">低</el-text>
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="截止日期">
          <el-date-picker v-model="form.dueDate" type="date" placeholder="选择日期" format="YYYY/MM/DD" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="modalVisible = false">取消</el-button>
        <el-button type="primary" @click="submit" :disabled="!form.title.trim()">
          {{ editId ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, nextTick } from 'vue'
import { Document, Close } from '@element-plus/icons-vue'
import { useTodoStore } from '../../stores/todo'
import type { TodoItem } from '../../stores/todo'
import dayjs from 'dayjs'

const store = useTodoStore()

const priorityFilter = ref('')
const filters = [
  { label: '全部', value: 'all' as const },
  { label: '待完成', value: 'todo' as const },
  { label: '已完成', value: 'done' as const }
]

const modalVisible = ref(false)
const editId = ref('')
const titleInputRef = ref()

const form = reactive({ title: '', note: '', priority: 2, dueDate: '' })

function priorityTagType(p: number) {
  return p === 1 ? 'danger' : p === 2 ? 'warning' : 'success'
}
function priorityLabel(p: number) {
  return p === 1 ? '高' : p === 2 ? '中' : '低'
}

function openAdd() {
  editId.value = ''
  Object.assign(form, { title: '', note: '', priority: 2, dueDate: '' })
  modalVisible.value = true
  nextTick(() => titleInputRef.value?.focus())
}

function openEdit(item: TodoItem) {
  editId.value = item.id
  form.title = item.title
  form.note = item.note ?? ''
  form.priority = item.priority
  form.dueDate = item.due_at ? dayjs.unix(item.due_at).format('YYYY-MM-DD') : ''
  modalVisible.value = true
  nextTick(() => titleInputRef.value?.focus())
}

function closeModal() {
  editId.value = ''
}

async function submit() {
  if (!form.title.trim()) return
  const due_at = form.dueDate ? dayjs(form.dueDate).endOf('day').unix() : undefined
  if (editId.value) {
    await store.update(editId.value, { title: form.title, note: form.note, priority: form.priority, due_at: due_at ?? null })
  } else {
    await store.add({ title: form.title, note: form.note, priority: form.priority, due_at })
  }
  modalVisible.value = false
}

function formatDate(ts: number) {
  const d = dayjs.unix(ts)
  if (d.isToday()) return '今天'
  if (d.isTomorrow()) return '明天'
  return d.format('MM/DD')
}

function isOverdue(item: TodoItem) {
  return item.status === 'todo' && item.due_at !== null && item.due_at < dayjs().startOf('day').unix()
}

onMounted(() => store.load())
</script>

<style scoped>
.todo-view { display: flex; flex-direction: column; height: 100%; overflow: hidden; padding: 20px; gap: 16px; }

.view-header { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
.header-left { display: flex; align-items: center; gap: 10px; }
.view-header h2 { font-size: 20px; font-weight: 700; color: var(--color-text); }

.filter-bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; flex-shrink: 0; }

.todo-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }

.todo-item {
  display: flex; align-items: center; gap: 10px;
  background: var(--color-bg-card); border: 1px solid var(--color-border);
  border-radius: var(--radius-md); padding: 12px 14px; cursor: pointer;
  transition: box-shadow var(--duration-fast);
}
.todo-item:hover { box-shadow: var(--shadow-sm); }
.todo-item.done { opacity: 0.55; }

.todo-body { flex: 1; min-width: 0; }
.todo-title { font-size: 14px; color: var(--color-text); font-weight: 500; }
.todo-item.done .todo-title { text-decoration: line-through; color: var(--color-text-muted); }
.todo-meta { display: flex; align-items: center; gap: 8px; margin-top: 5px; flex-wrap: wrap; }
</style>
