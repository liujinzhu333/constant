<template>
  <div class="detail-page">
    <van-nav-bar
      :title="store.selectedPlan?.title || '计划详情'"
      left-arrow
      @click-left="router.back()"
    />

    <div v-if="!store.selectedPlan" class="empty-wrap">
      <van-empty description="计划不存在" />
    </div>

    <template v-else>
      <!-- 计划信息卡 -->
      <div class="plan-card">
        <div class="plan-top">
          <div class="cat-row">
            <span class="cat-dot" :style="{ background: catColor }"></span>
            <span class="cat-label">{{ catLabel }}</span>
          </div>
          <van-tag :type="statusType(store.selectedPlan.status)">{{ statusLabel(store.selectedPlan.status) }}</van-tag>
        </div>
        <p v-if="store.selectedPlan.description" class="plan-desc">{{ store.selectedPlan.description }}</p>
        <div class="progress-row">
          <van-progress
            :percentage="progressRate"
            :color="catColor"
            stroke-width="5"
            :show-pivot="false"
            track-color="#f2f2f7"
          />
          <span class="progress-text">{{ store.selectedPlan.done_count }}/{{ store.selectedPlan.task_count }} 完成</span>
        </div>
      </div>

      <!-- 任务列表 -->
      <div class="section-header">
        <span class="section-title">任务列表</span>
        <van-button size="mini" type="primary" plain @click="showAddTask">+ 添加任务</van-button>
      </div>

      <div class="task-list">
        <van-empty v-if="store.tasks.length === 0" description="暂无任务" image-size="80" />

        <van-swipe-cell
          v-for="task in store.tasks"
          :key="task.id"
        >
          <van-cell
            :title="task.title"
            :class="{ 'task-done': task.status === 'done' }"
            clickable
            @click="toggleTask(task)"
          >
            <template #icon>
              <div class="check-circle" :class="{ checked: task.status === 'done' }">
                <van-icon v-if="task.status === 'done'" name="success" color="#fff" size="12" />
              </div>
            </template>
          </van-cell>
          <template #right>
            <van-button square type="danger" text="删除" @click="deleteTask(task.id)" />
          </template>
        </van-swipe-cell>
      </div>
    </template>

    <!-- 添加任务弹窗 -->
    <BottomSheet :visible="showSheet" @close="closeSheet">
      <div class="sheet-inner">
        <van-nav-bar title="添加任务" left-text="取消" right-text="添加" @click-left="closeSheet" @click-right="submitTask" />
        <div class="form-wrap">
          <van-cell-group inset>
            <van-field
              ref="taskFieldRef"
              v-model="taskTitle"
              placeholder="输入任务名称"
              maxlength="200"
              @keyup.enter="submitTask"
            />
          </van-cell-group>
        </div>
      </div>
    </BottomSheet>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showConfirmDialog } from 'vant'
import { useStudyStore, PLAN_CATEGORIES } from '../../stores/study'
import type { PlanTask } from '../../utils/db'
import BottomSheet from '../../components/BottomSheet.vue'

const store = useStudyStore()
const route = useRoute()
const router = useRouter()
const taskTitle = ref('')
const showSheet = ref(false)
const taskFieldRef = ref()

onMounted(async () => {
  const id = Number(route.params.id || 0)
  if (id && store.selectedPlan?.id !== id) await store.loadTasks(id)
})

const catColor = computed(() => PLAN_CATEGORIES.find(c => c.value === store.selectedPlan?.category)?.color || '#8e8e93')
const catLabel = computed(() => {
  const cat = PLAN_CATEGORIES.find(c => c.value === store.selectedPlan?.category)
  return cat ? `${cat.icon} ${cat.label}` : ''
})
const progressRate = computed(() => {
  const p = store.selectedPlan
  if (!p || !p.task_count) return 0
  return Math.round((p.done_count / p.task_count) * 100)
})

function statusLabel(status: string) {
  const map: Record<string, string> = { active: '进行中', done: '已完成', paused: '已暂停' }
  return map[status] || status
}
function statusType(status: string): 'primary' | 'success' | 'default' {
  const map: Record<string, 'primary' | 'success' | 'default'> = { active: 'primary', done: 'success', paused: 'default' }
  return map[status] || 'default'
}

async function toggleTask(task: PlanTask) {
  if (!store.selectedPlan) return
  if (task.status === 'done') await store.taskUndone(task.id, store.selectedPlan.id)
  else await store.taskDone(task.id, store.selectedPlan.id)
}

async function deleteTask(id: number) {
  if (!store.selectedPlan) return
  await showConfirmDialog({ title: '删除任务', message: '确定删除该任务？' })
  await store.deleteTask(id, store.selectedPlan.id)
}

function showAddTask() {
  taskTitle.value = ''
  showSheet.value = true
  nextTick(() => taskFieldRef.value?.focus?.())
}
function closeSheet() { showSheet.value = false }

async function submitTask() {
  if (!taskTitle.value.trim()) { showToast('请输入任务名称'); return }
  if (!store.selectedPlan) return
  await store.addTask(store.selectedPlan.id, taskTitle.value.trim())
  taskTitle.value = ''
  closeSheet()
}
</script>

<style lang="scss" scoped>
.detail-page { display: flex; flex-direction: column; height: 100%; background: $color-bg; }

.plan-card { background: #fff; margin: 8px 12px; border-radius: $radius-lg; padding: 14px; box-shadow: $shadow-sm; display: flex; flex-direction: column; gap: 10px; }
.plan-top { display: flex; align-items: center; justify-content: space-between; }
.cat-row { display: flex; align-items: center; gap: 6px; }
.cat-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.cat-label { font-size: $font-sm; color: $color-text-secondary; }
.plan-desc { font-size: $font-sm; color: $color-text-secondary; margin: 0; line-height: 1.5; }
.progress-row { display: flex; align-items: center; gap: 8px; }
.progress-text { font-size: $font-xs; color: $color-text-tertiary; white-space: nowrap; }

.section-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px 6px; }
.section-title { font-size: $font-md; font-weight: $font-medium; color: $color-text-primary; }

.task-list { flex: 1; overflow-y: auto; }
.task-done { opacity: 0.5; }
.task-done :deep(.van-cell__title) { text-decoration: line-through; color: $color-text-tertiary; }

.check-circle {
  width: 22px; height: 22px; border-radius: 50%; border: 2px solid $color-border;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-right: 10px;
  &.checked { background: $color-primary; border-color: $color-primary; }
}

.sheet-inner { max-height: 60vh; display: flex; flex-direction: column; }
.form-wrap { overflow-y: auto; padding: 12px 0 calc(env(safe-area-inset-bottom) + 12px); }

.empty-wrap { flex: 1; display: flex; align-items: center; justify-content: center; }
</style>
