<template>
  <div class="study-page">
    <van-nav-bar title="学习计划" />

    <!-- 分类横向滚动 -->
    <div class="category-scroll">
      <div
        v-for="cat in PLAN_CATEGORIES"
        :key="cat.value"
        class="cat-chip"
        :class="{ active: store.selectedCategory === cat.value }"
        :style="store.selectedCategory === cat.value ? { background: cat.color, borderColor: cat.color } : {}"
        @click="store.selectCategory(cat.value)"
      >
        <span>{{ cat.icon }}</span>
        <span class="cat-label" :style="store.selectedCategory === cat.value ? { color: '#fff' } : {}">{{ cat.label }}</span>
      </div>
    </div>

    <!-- 计划列表 -->
    <div class="list-wrap">
      <van-loading v-if="store.loading" class="loading-center" />
      <van-empty v-else-if="store.filteredPlans.length === 0" description="暂无计划，点击 + 新建" />

      <van-pull-refresh v-else v-model="refreshing" @refresh="onRefresh">
        <div class="list-inner">
          <div
            v-for="plan in store.filteredPlans"
            :key="plan.id"
            class="plan-card"
            @click="goPlanDetail(plan)"
          >
            <div class="plan-top">
              <div class="flex-start">
                <span class="cat-dot" :style="{ background: getCatColor(plan.category) }"></span>
                <span class="plan-title">{{ plan.title }}</span>
              </div>
              <div class="plan-top-right">
                <van-tag :type="statusType(plan.status)" size="medium">{{ statusLabel(plan.status) }}</van-tag>
                <van-icon name="ellipsis" size="18" color="#aeaeb2" @click.stop="showPlanActions(plan)" />
              </div>
            </div>
            <p v-if="plan.description" class="plan-desc van-multi-ellipsis--l2">{{ plan.description }}</p>
            <div class="progress-row">
              <van-progress
                :percentage="progressRate(plan)"
                :color="getCatColor(plan.category)"
                stroke-width="4"
                :show-pivot="false"
                track-color="#f2f2f7"
              />
              <span class="progress-text">{{ plan.done_count }}/{{ plan.task_count }}</span>
            </div>
            <div class="plan-footer">
              <span class="sub-count">{{ plan.sub_plan_count }} 个子计划</span>
              <van-icon name="arrow" color="#aeaeb2" />
            </div>
          </div>
        </div>
      </van-pull-refresh>
    </div>

    <!-- FAB -->
    <div class="fab" @click="showAddDialog">
      <van-icon name="plus" color="#fff" size="24" />
    </div>

    <!-- 新建弹窗 -->
    <BottomSheet :visible="sheetVisible" @close="closePopup">
      <div class="sheet-inner">
        <van-nav-bar title="新建计划" left-text="取消" right-text="创建" @click-left="closePopup" @click-right="submitAdd" />
        <div class="form-wrap">
          <van-cell-group inset>
            <van-field v-model="form.title" label="计划名称" placeholder="输入计划名称" maxlength="100" />
            <van-field v-model="form.description" label="描述" placeholder="可选描述" maxlength="500" />
          </van-cell-group>
          <div class="cat-select-wrap">
            <span class="select-label">分类</span>
            <div class="cat-selector">
              <div
                v-for="cat in PLAN_CATEGORIES.filter(c => c.value !== 'all')"
                :key="cat.value"
                class="cat-option"
                :class="{ selected: form.category === cat.value }"
                :style="form.category === cat.value ? { background: cat.color } : {}"
                @click="form.category = cat.value"
              >
                <span :style="form.category === cat.value ? { color: '#fff' } : {}">{{ cat.icon }} {{ cat.label }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </BottomSheet>

    <!-- 操作菜单 -->
    <van-action-sheet
      v-model:show="actionSheetShow"
      :actions="actionSheetActions"
      :title="`操作「${actionPlan?.title}」`"
      cancel-text="取消"
      @select="onActionSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast, showConfirmDialog } from 'vant'
import { useStudyStore, PLAN_CATEGORIES, type PlanCategory } from '../../stores/study'
import type { PlanItem } from '../../utils/db'
import BottomSheet from '../../components/BottomSheet.vue'

const store = useStudyStore()
const router = useRouter()
const sheetVisible = ref(false)
const refreshing = ref(false)
const actionSheetShow = ref(false)
const actionPlan = ref<PlanItem | null>(null)
const actionSheetActions = ref<Array<{ name: string; color?: string }>>([])

const form = ref({ title: '', description: '', category: 'study' as PlanCategory })

onMounted(() => store.loadPlans())

async function onRefresh() {
  await store.loadPlans()
  refreshing.value = false
}

function getCatColor(cat: string) {
  return PLAN_CATEGORIES.find(c => c.value === cat)?.color || '#8e8e93'
}

function progressRate(plan: PlanItem) {
  if (!plan.task_count) return 0
  return Math.round((plan.done_count / plan.task_count) * 100)
}

function statusLabel(status: string) {
  const map: Record<string, string> = { active: '进行中', done: '已完成', paused: '已暂停' }
  return map[status] || status
}

function statusType(status: string): 'primary' | 'success' | 'default' {
  const map: Record<string, 'primary' | 'success' | 'default'> = { active: 'primary', done: 'success', paused: 'default' }
  return map[status] || 'default'
}

function goPlanDetail(plan: PlanItem) {
  store.selectPlan(plan)
  router.push(`/study/detail/${plan.id}`)
}

function showAddDialog() {
  form.value = { title: '', description: '', category: 'study' }
  sheetVisible.value = true
}

function closePopup() { sheetVisible.value = false }

async function submitAdd() {
  if (!form.value.title.trim()) { showToast('请输入计划名称'); return }
  await store.addPlan({ title: form.value.title.trim(), description: form.value.description.trim(), category: form.value.category })
  closePopup()
}

function showPlanActions(plan: PlanItem) {
  actionPlan.value = plan
  actionSheetActions.value = [
    { name: '查看详情' },
    { name: plan.status === 'done' ? '恢复进行' : '标为完成' },
    { name: '删除', color: '#ff3b30' },
  ]
  actionSheetShow.value = true
}

async function onActionSelect(action: { name: string }) {
  const plan = actionPlan.value
  if (!plan) return
  actionSheetShow.value = false
  if (action.name === '查看详情') {
    goPlanDetail(plan)
  } else if (action.name === '恢复进行' || action.name === '标为完成') {
    store.updatePlan(plan.id, { status: plan.status === 'done' ? 'active' : 'done' })
  } else if (action.name === '删除') {
    await showConfirmDialog({ title: '删除计划', message: `确定删除「${plan.title}」及其所有任务？` })
    store.deletePlan(plan.id)
  }
}
</script>

<style lang="scss" scoped>
.study-page { display: flex; flex-direction: column; height: 100%; background: $color-bg; }

.category-scroll {
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  overflow-x: auto;
  background: #fff;
  border-bottom: 1px solid $color-separator;
  flex-shrink: 0;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}

.cat-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: $radius-pill;
  border: 1px solid $color-border;
  white-space: nowrap;
  flex-shrink: 0;
  cursor: pointer;
  font-size: $font-sm;
}
.cat-label { color: $color-text-secondary; }

.list-wrap { flex: 1; overflow-y: auto; }
.loading-center { display: flex; justify-content: center; padding: 40px; }

.list-inner { padding: 8px 12px 80px; display: flex; flex-direction: column; gap: 10px; }

.plan-card {
  background: #fff;
  border-radius: $radius-lg;
  padding: 14px;
  box-shadow: $shadow-sm;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
}

.plan-top { display: flex; align-items: center; justify-content: space-between; }
.plan-top-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.flex-start { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.cat-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.plan-title { font-size: $font-md; font-weight: $font-medium; color: $color-text-primary; flex: 1; }
.plan-desc { font-size: $font-sm; color: $color-text-secondary; margin: 0; line-height: 1.5; }

.progress-row { display: flex; align-items: center; gap: 8px; }
.progress-text { font-size: $font-xs; color: $color-text-tertiary; flex-shrink: 0; white-space: nowrap; }

.plan-footer { display: flex; align-items: center; justify-content: space-between; }
.sub-count { font-size: $font-xs; color: $color-text-tertiary; }

.fab { position: fixed; right: 20px; bottom: 80px; width: 50px; height: 50px; border-radius: 50%; background: $color-primary; display: flex; align-items: center; justify-content: center; box-shadow: $shadow-lg; cursor: pointer; }

.sheet-inner { max-height: 90vh; display: flex; flex-direction: column; }
.form-wrap { overflow-y: auto; padding: 12px 0 calc(env(safe-area-inset-bottom) + 12px); }

.cat-select-wrap { padding: 12px 16px; }
.select-label { font-size: $font-sm; color: $color-text-secondary; display: block; margin-bottom: 8px; }
.cat-selector { display: flex; flex-wrap: wrap; gap: 8px; }
.cat-option { padding: 6px 14px; border-radius: $radius-pill; background: $color-bg; font-size: $font-sm; color: $color-text-secondary; cursor: pointer; border: 1px solid $color-border; &.selected { border-color: transparent; } }
</style>
