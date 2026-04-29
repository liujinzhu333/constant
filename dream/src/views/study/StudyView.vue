<template>
  <div class="study-view">
    <!-- ========== 左栏：类型筛选 + 顶层计划列表 ========== -->
    <div class="plan-sidebar">
      <div class="category-tabs">
        <el-button
          v-for="cat in PLAN_CATEGORIES" :key="cat.value"
          size="small" round
          :type="store.activeCategory === cat.value ? 'primary' : ''"
          :style="store.activeCategory === cat.value ? { background: cat.color, borderColor: cat.color } : {}"
          @click="store.selectCategory(cat.value)"
        >
          {{ cat.icon }} {{ cat.label }}
        </el-button>
      </div>

      <div class="sidebar-actions">
        <el-text size="small" type="info">{{ currentCatLabel }} · {{ store.plans.length }} 个计划</el-text>
        <el-button circle size="small" @click="openAddPlan()" title="新建计划">
          <el-icon><Plus /></el-icon>
        </el-button>
      </div>

      <div class="plan-list" v-loading="store.loading">
        <div
          v-for="plan in store.plans" :key="plan.id"
          class="plan-card" :class="{ active: store.currentPlan?.id === plan.id }"
          @click="store.selectPlan(plan)"
        >
          <div class="plan-color-bar" :style="{ background: plan.color }" />
          <div class="plan-info">
            <div class="plan-name-row">
              <span class="plan-name">{{ plan.title }}</span>
              <span class="plan-cat-badge" :style="{ background: catColorOf(plan.category) }">
                {{ catIconOf(plan.category) }}
              </span>
            </div>
            <el-text size="small" type="info">{{ plan.doneCount }}/{{ plan.taskCount }} 任务 · {{ plan.progress }}%</el-text>
            <el-text v-if="plan.subPlanCount" size="small" type="info" style="margin-left:6px">· {{ plan.subPlanCount }} 子计划</el-text>
            <el-progress :percentage="plan.progress" :color="plan.color" :show-text="false" :stroke-width="3" style="margin-top:5px" />
          </div>
          <div class="plan-card-actions">
            <el-button link size="small" @click.stop="openEditPlan(plan)" title="编辑">
              <el-icon><Edit /></el-icon>
            </el-button>
            <el-button link type="danger" size="small" @click.stop="confirmDeletePlan(plan.id)" title="删除">
              <el-icon><Close /></el-icon>
            </el-button>
          </div>
        </div>

        <el-empty v-if="store.plans.length === 0 && !store.loading"
          :description="`暂无${currentCatLabel === '全部' ? '' : currentCatLabel}计划，点击 + 新建`"
          :image-size="60"
        />
      </div>
    </div>

    <!-- ========== 中栏：选中计划详情 + 顶层任务 + 子计划列表 ========== -->
    <div class="plan-detail" v-if="store.currentPlan">
      <div class="detail-header">
        <div class="detail-title-row">
          <div class="plan-dot" :style="{ background: store.currentPlan.color }" />
          <h2>{{ store.currentPlan.title }}</h2>
          <el-tag size="small" :color="catColorOf(store.currentPlan.category)" effect="dark">
            {{ catIconOf(store.currentPlan.category) }} {{ catLabelOf(store.currentPlan.category) }}
          </el-tag>
          <el-tag size="small" type="primary" effect="plain">{{ store.currentPlan.progress }}%</el-tag>
        </div>
        <p class="detail-desc" v-if="store.currentPlan.goal">目标：{{ store.currentPlan.goal }}</p>
        <p class="detail-desc" v-if="store.currentPlan.description" style="color:var(--color-text-muted)">{{ store.currentPlan.description }}</p>
      </div>

      <!-- 进度环 -->
      <div class="progress-ring-wrap">
        <el-progress type="circle" :percentage="store.currentPlan.progress" :color="store.currentPlan.color" :width="100" />
      </div>

      <!-- 本计划任务 -->
      <div class="task-section">
        <div class="section-header">
          <span class="section-label">任务清单</span>
          <el-text size="small" type="info">{{ store.tasks.filter(t => t.status==='done').length }}/{{ store.tasks.length }}</el-text>
        </div>
        <div class="task-add-row">
          <el-input
            v-model="newTaskTitle"
            placeholder="添加任务，回车确认"
            @keydown.enter="addTask"
          >
            <template #append>
              <el-button @click="addTask" :disabled="!newTaskTitle.trim()">添加</el-button>
            </template>
          </el-input>
        </div>

        <div class="task-list">
          <div
            v-for="task in store.tasks" :key="task.id"
            class="task-item" :class="{ done: task.status === 'done' }"
          >
            <el-checkbox :model-value="task.status === 'done'" @change="store.toggleTask(task)" />
            <span class="task-title">{{ task.title }}</span>
            <el-button link type="danger" size="small" @click="store.deleteTask(task.id)">
              <el-icon><Close /></el-icon>
            </el-button>
          </div>
          <el-empty v-if="store.tasks.length === 0" description="添加第一个任务" :image-size="40" />
        </div>
      </div>

      <!-- 子计划区 -->
      <div class="task-section">
        <div class="section-header">
          <span class="section-label">子计划</span>
          <el-button circle size="small" @click="openAddSubPlan()" title="新建子计划">
            <el-icon><Plus /></el-icon>
          </el-button>
        </div>

        <div class="sub-plan-list" v-loading="store.subPlansLoading">
          <div
            v-for="sub in store.subPlans" :key="sub.id"
            class="sub-plan-card" :class="{ active: store.currentSubPlan?.id === sub.id }"
            @click="store.selectSubPlan(sub)"
          >
            <div class="sub-plan-color" :style="{ background: sub.color }" />
            <div class="sub-plan-info">
              <span class="sub-plan-name">{{ sub.title }}</span>
              <div class="sub-plan-meta">
                <el-progress :percentage="sub.progress" :color="sub.color" :show-text="false" :stroke-width="2" style="flex:1" />
                <el-text size="small" type="info" style="flex-shrink:0">{{ sub.progress }}%</el-text>
              </div>
            </div>
            <div class="sub-plan-actions">
              <el-button link size="small" @click.stop="openEditSubPlan(sub)">
                <el-icon><Edit /></el-icon>
              </el-button>
              <el-button link type="danger" size="small" @click.stop="confirmDeleteSubPlan(sub.id)">
                <el-icon><Close /></el-icon>
              </el-button>
            </div>
          </div>
          <el-empty v-if="store.subPlans.length === 0 && !store.subPlansLoading"
            description="可为该计划添加子计划" :image-size="40" />
        </div>
      </div>
    </div>

    <!-- 未选择计划时的占位 -->
    <div class="plan-empty" v-else-if="!store.currentPlan && !store.currentSubPlan">
      <el-empty :description="`选择或新建一个${currentCatLabel === '全部' ? '' : currentCatLabel}计划`" :image-size="80">
        <template #image>
          <div style="font-size:48px">{{ currentCatIcon }}</div>
        </template>
      </el-empty>
    </div>

    <!-- ========== 右栏：子计划详情 ========== -->
    <div class="sub-detail" v-if="store.currentSubPlan">
      <div class="detail-header">
        <div class="detail-title-row">
          <div class="plan-dot" :style="{ background: store.currentSubPlan.color }" />
          <h3>{{ store.currentSubPlan.title }}</h3>
          <el-tag size="small" type="info" effect="plain">子计划</el-tag>
          <el-tag size="small" type="primary" effect="plain">{{ store.currentSubPlan.progress }}%</el-tag>
        </div>
        <p class="detail-desc" v-if="store.currentSubPlan.goal">目标：{{ store.currentSubPlan.goal }}</p>
      </div>

      <div class="progress-ring-wrap">
        <el-progress type="circle" :percentage="store.currentSubPlan.progress" :color="store.currentSubPlan.color" :width="80" />
      </div>

      <!-- 子计划任务 -->
      <div class="task-section">
        <div class="section-header">
          <span class="section-label">子计划任务</span>
          <el-text size="small" type="info">{{ store.subTasks.filter(t=>t.status==='done').length }}/{{ store.subTasks.length }}</el-text>
        </div>
        <div class="task-add-row">
          <el-input
            v-model="newSubTaskTitle"
            placeholder="添加任务，回车确认"
            @keydown.enter="addSubTask"
          >
            <template #append>
              <el-button @click="addSubTask" :disabled="!newSubTaskTitle.trim()">添加</el-button>
            </template>
          </el-input>
        </div>

        <div class="task-list">
          <div
            v-for="task in store.subTasks" :key="task.id"
            class="task-item" :class="{ done: task.status === 'done' }"
          >
            <el-checkbox :model-value="task.status === 'done'" @change="store.toggleSubTask(task)" />
            <span class="task-title">{{ task.title }}</span>
            <el-button link type="danger" size="small" @click="store.deleteSubTask(task.id)">
              <el-icon><Close /></el-icon>
            </el-button>
          </div>
          <el-empty v-if="store.subTasks.length === 0" description="添加第一个任务" :image-size="40" />
        </div>
      </div>
    </div>

    <!-- ========== 新建/编辑计划弹窗 ========== -->
    <el-dialog
      v-model="showPlanDialog"
      :title="planDialogMode === 'add' ? '新建计划' : planDialogMode === 'edit' ? '编辑计划' : '新建子计划'"
      width="480px"
    >
      <el-form :model="planForm" label-width="80px">
        <!-- 仅顶层计划可选类型 -->
        <el-form-item label="计划类型" v-if="planDialogMode !== 'sub'">
          <div class="cat-grid">
            <el-button
              v-for="cat in PLAN_CATEGORIES.filter(c => c.value !== 'all')" :key="cat.value"
              size="small"
              :type="planForm.category === cat.value ? 'primary' : ''"
              :style="planForm.category === cat.value ? { background: cat.color, borderColor: cat.color } : {}"
              @click="planForm.category = cat.value as PlanCategory; planForm.color = cat.color"
            >
              {{ cat.icon }} {{ cat.label }}
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="计划名称">
          <el-input v-model="planForm.title" :placeholder="planDialogMode === 'sub' ? '子计划名称' : `${catLabelOf(planForm.category)}计划名称`" />
        </el-form-item>
        <el-form-item label="目标描述">
          <el-input v-model="planForm.goal" type="textarea" :rows="2" placeholder="目标描述（可选）" />
        </el-form-item>
        <el-form-item label="详细描述">
          <el-input v-model="planForm.description" type="textarea" :rows="2" placeholder="详细描述（可选）" />
        </el-form-item>
        <el-form-item label="颜色">
          <div class="color-picker">
            <div v-for="c in colors" :key="c"
              class="color-dot" :style="{ background: c }"
              :class="{ selected: planForm.color === c }"
              @click="planForm.color = c"
            />
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPlanDialog = false">取消</el-button>
        <el-button type="primary" @click="submitPlanDialog" :disabled="!planForm.title.trim()">
          {{ planDialogMode === 'edit' ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { Plus, Close, Edit } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { useStudyStore, PLAN_CATEGORIES } from '../../stores/study'
import type { StudyPlan, PlanCategory } from '../../stores/study'

const store = useStudyStore()
const newTaskTitle = ref('')
const newSubTaskTitle = ref('')
const colors = ['#0071e3', '#34c759', '#ff9f0a', '#ff3b30', '#af52de', '#5ac8fa', '#ff6b35']

// 弹窗统一控制
type DialogMode = 'add' | 'edit' | 'sub' | 'editSub'
const showPlanDialog = ref(false)
const planDialogMode = ref<DialogMode>('add')
let editingPlanId = ''

const planForm = reactive<{
  title: string; goal: string; description: string; category: PlanCategory; color: string
}>({ title: '', goal: '', description: '', category: 'study', color: '#0071e3' })

onMounted(() => store.loadPlans())

const currentCat = computed(() => PLAN_CATEGORIES.find(c => c.value === store.activeCategory)!)
const currentCatLabel = computed(() => currentCat.value.label)
const currentCatIcon = computed(() => currentCat.value.icon)

function catColorOf(cat: string) { return PLAN_CATEGORIES.find(c => c.value === cat)?.color ?? '#8e8e93' }
function catIconOf(cat: string) { return PLAN_CATEGORIES.find(c => c.value === cat)?.icon ?? '🗂' }
function catLabelOf(cat: string) { return PLAN_CATEGORIES.find(c => c.value === cat)?.label ?? cat }

// ===== 顶层计划操作 =====

function openAddPlan() {
  planDialogMode.value = 'add'
  editingPlanId = ''
  const cat = store.activeCategory === 'all' ? 'study' : store.activeCategory
  Object.assign(planForm, {
    title: '', goal: '', description: '',
    category: cat as PlanCategory,
    color: PLAN_CATEGORIES.find(c => c.value === cat)?.color ?? '#0071e3',
  })
  showPlanDialog.value = true
}

function openEditPlan(plan: StudyPlan) {
  planDialogMode.value = 'edit'
  editingPlanId = plan.id
  Object.assign(planForm, {
    title: plan.title,
    goal: plan.goal ?? '',
    description: plan.description ?? '',
    category: plan.category,
    color: plan.color,
  })
  showPlanDialog.value = true
}

// ===== 子计划操作 =====

function openAddSubPlan() {
  if (!store.currentPlan) return
  planDialogMode.value = 'sub'
  editingPlanId = ''
  Object.assign(planForm, {
    title: '', goal: '', description: '',
    category: store.currentPlan.category,
    color: store.currentPlan.color,
  })
  showPlanDialog.value = true
}

function openEditSubPlan(sub: StudyPlan) {
  planDialogMode.value = 'editSub'
  editingPlanId = sub.id
  Object.assign(planForm, {
    title: sub.title,
    goal: sub.goal ?? '',
    description: sub.description ?? '',
    category: sub.category,
    color: sub.color,
  })
  showPlanDialog.value = true
}

// ===== 统一提交 =====

async function submitPlanDialog() {
  if (!planForm.title.trim()) return
  const data = {
    title: planForm.title,
    goal: planForm.goal,
    description: planForm.description,
    category: planForm.category,
    color: planForm.color,
  }
  if (planDialogMode.value === 'add') {
    await store.addPlan(data)
  } else if (planDialogMode.value === 'edit') {
    await store.updatePlan(editingPlanId, data)
  } else if (planDialogMode.value === 'sub') {
    await store.addSubPlan(data)
  } else if (planDialogMode.value === 'editSub') {
    await store.updateSubPlan(editingPlanId, data)
  }
  showPlanDialog.value = false
}

// ===== 删除 =====

async function confirmDeletePlan(id: string) {
  await ElMessageBox.confirm('确定删除该计划及所有子计划和任务吗？', '删除确认', {
    confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning'
  })
  store.deletePlan(id)
}

async function confirmDeleteSubPlan(id: string) {
  await ElMessageBox.confirm('确定删除该子计划及其任务吗？', '删除确认', {
    confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning'
  })
  store.deleteSubPlan(id)
}

// ===== 任务 =====

async function addTask() {
  if (!newTaskTitle.value.trim()) return
  await store.addTask(newTaskTitle.value.trim())
  newTaskTitle.value = ''
}

async function addSubTask() {
  if (!newSubTaskTitle.value.trim()) return
  await store.addSubTask(newSubTaskTitle.value.trim())
  newSubTaskTitle.value = ''
}
</script>

<style scoped>
.study-view { display: flex; height: 100%; overflow: hidden; }

/* ========== 左栏：计划列表 ========== */
.plan-sidebar {
  width: 250px; flex-shrink: 0; border-right: 1px solid var(--color-border);
  background: var(--color-bg-sidebar); display: flex; flex-direction: column;
}

.category-tabs { display: flex; gap: 4px; padding: 12px 10px 8px; flex-wrap: wrap; }

.sidebar-actions {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 12px 10px;
}

.plan-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding: 0 10px 12px; }
.plan-card {
  display: flex; align-items: center; gap: 0;
  background: var(--color-bg-card); border: 1px solid var(--color-border);
  border-radius: var(--radius-md); padding: 10px 6px 10px 0;
  cursor: pointer; transition: all 150ms; position: relative; overflow: hidden;
}
.plan-card:hover { box-shadow: var(--shadow-sm); }
.plan-card.active { border-color: var(--color-accent); background: var(--color-accent-light); }
.plan-color-bar { width: 4px; min-height: 48px; flex-shrink: 0; }
.plan-info { flex: 1; min-width: 0; padding-left: 10px; padding-right: 4px; }
.plan-name-row { display: flex; align-items: center; gap: 6px; }
.plan-name { font-size: 13px; font-weight: 600; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
.plan-cat-badge { width: 18px; height: 18px; border-radius: 50%; font-size: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.plan-card-actions { display: flex; flex-direction: column; gap: 2px; flex-shrink: 0; opacity: 0; transition: opacity 150ms; }
.plan-card:hover .plan-card-actions { opacity: 1; }

/* ========== 中栏：计划详情 ========== */
.plan-detail {
  width: 320px; flex-shrink: 0; overflow-y: auto;
  padding: 20px 20px; display: flex; flex-direction: column; gap: 16px;
  border-right: 1px solid var(--color-border);
}
.plan-empty { flex: 1; display: flex; align-items: center; justify-content: center; }

.detail-header { display: flex; flex-direction: column; gap: 4px; }
.detail-title-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.plan-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.detail-title-row h2 { font-size: 18px; font-weight: 700; color: var(--color-text); }
.detail-title-row h3 { font-size: 16px; font-weight: 700; color: var(--color-text); }
.detail-desc { font-size: 12px; color: var(--color-text-muted); line-height: 1.5; }

.progress-ring-wrap { align-self: center; }

.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.section-label { font-size: 12px; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.5px; }

.task-section { display: flex; flex-direction: column; }
.task-add-row { margin-bottom: 8px; }

.task-list { display: flex; flex-direction: column; gap: 5px; }
.task-item {
  display: flex; align-items: center; gap: 10px;
  background: var(--color-bg-card); border: 1px solid var(--color-border);
  border-radius: var(--radius-sm); padding: 8px 10px; transition: all 150ms;
}
.task-item.done { opacity: 0.55; }
.task-title { flex: 1; font-size: 13px; color: var(--color-text); }
.task-item.done .task-title { text-decoration: line-through; color: var(--color-text-muted); }

/* 子计划列表 */
.sub-plan-list { display: flex; flex-direction: column; gap: 6px; }
.sub-plan-card {
  display: flex; align-items: center; gap: 0;
  background: var(--color-bg-card); border: 1px solid var(--color-border);
  border-radius: var(--radius-sm); padding: 8px 6px 8px 0;
  cursor: pointer; transition: all 150ms;
}
.sub-plan-card:hover { box-shadow: var(--shadow-sm); }
.sub-plan-card.active { border-color: var(--color-accent); background: var(--color-accent-light); }
.sub-plan-color { width: 3px; min-height: 36px; flex-shrink: 0; border-radius: 2px; margin-left: 4px; }
.sub-plan-info { flex: 1; min-width: 0; padding: 0 8px; }
.sub-plan-name { font-size: 13px; font-weight: 500; color: var(--color-text); }
.sub-plan-meta { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
.sub-plan-actions { display: flex; flex-direction: column; gap: 0; flex-shrink: 0; opacity: 0; transition: opacity 150ms; }
.sub-plan-card:hover .sub-plan-actions { opacity: 1; }

/* ========== 右栏：子计划详情 ========== */
.sub-detail {
  flex: 1; overflow-y: auto; padding: 20px 24px;
  display: flex; flex-direction: column; gap: 16px;
  background: var(--color-bg);
}

/* ========== 弹窗内 ========== */
.cat-grid { display: flex; gap: 6px; flex-wrap: wrap; }
.color-picker { display: flex; gap: 8px; }
.color-dot { width: 22px; height: 22px; border-radius: 50%; cursor: pointer; transition: transform 150ms; }
.color-dot:hover { transform: scale(1.15); }
.color-dot.selected { outline: 3px solid var(--color-text); outline-offset: 2px; }
</style>
