<template>
  <div class="member-view">
    <!-- ── 左栏：关系分类 + 标签筛选 ── -->
    <aside class="member-sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">人员</span>
        <el-button type="primary" size="small" :icon="Plus" circle @click="openAddDialog" />
      </div>

      <el-input
        v-model="memberStore.filterKeyword"
        placeholder="搜索姓名/称谓"
        size="small"
        clearable
        class="search-input"
      />

      <div class="section-label">关系分类</div>
      <div
        class="filter-item"
        :class="{ active: memberStore.filterRelation === '' }"
        @click="memberStore.filterRelation = ''"
      >
        <el-icon><Grid /></el-icon>
        <span>全部</span>
        <span class="count">{{ memberStore.members.length }}</span>
      </div>
      <div
        v-for="rel in RELATION_OPTIONS"
        :key="rel.value"
        class="filter-item"
        :class="{ active: memberStore.filterRelation === rel.value }"
        @click="memberStore.filterRelation = rel.value"
      >
        <el-icon><User /></el-icon>
        <span>{{ rel.label }}</span>
        <span class="count">{{ memberStore.members.filter(m => m.relation === rel.value).length }}</span>
      </div>

      <template v-if="memberStore.allTags.length">
        <div class="section-label">标签</div>
        <div
          class="filter-item"
          :class="{ active: memberStore.filterTag === '' }"
          @click="memberStore.filterTag = ''"
        >
          <span>全部标签</span>
        </div>
        <div
          v-for="tag in memberStore.allTags"
          :key="tag"
          class="filter-item tag-item"
          :class="{ active: memberStore.filterTag === tag }"
          @click="memberStore.filterTag = tag"
        >
          <el-tag size="small" effect="plain">{{ tag }}</el-tag>
        </div>
      </template>
    </aside>

    <!-- ── 中栏：人员卡片列表 ── -->
    <section class="member-list">
      <div v-if="memberStore.loading" class="empty-tip">加载中…</div>
      <div v-else-if="memberStore.filteredMembers.length === 0" class="empty-tip">暂无人员</div>
      <div
        v-for="m in memberStore.filteredMembers"
        :key="m.id"
        class="member-card"
        :class="{ active: currentMember?.id === m.id }"
        @click="selectMember(m)"
      >
        <div class="avatar" :style="{ background: m.avatar_color }">
          {{ m.name.slice(0, 1) }}
        </div>
        <div class="card-info">
          <div class="card-name">{{ m.name }}
            <span v-if="m.nickname" class="card-nickname">「{{ m.nickname }}」</span>
          </div>
          <div class="card-meta">
            <el-tag size="small" type="info" effect="plain">{{ RELATION_LABELS[m.relation] }}</el-tag>
            <span v-if="m.relation_title" class="card-title-text">{{ m.relation_title }}</span>
          </div>
          <div v-if="parsedTags(m).length" class="card-tags">
            <el-tag v-for="t in parsedTags(m)" :key="t" size="small" effect="plain">{{ t }}</el-tag>
          </div>
        </div>
      </div>
    </section>

    <!-- ── 右栏：详情面板 ── -->
    <section class="member-detail" v-if="currentMember">
      <div class="detail-header">
        <div class="detail-avatar" :style="{ background: currentMember.avatar_color }">
          {{ currentMember.name.slice(0, 1) }}
        </div>
        <div class="detail-title">
          <h2 class="detail-name">{{ currentMember.name }}
            <span v-if="currentMember.nickname" class="detail-nickname">「{{ currentMember.nickname }}」</span>
          </h2>
          <div class="detail-meta">
            <el-tag type="info">{{ RELATION_LABELS[currentMember.relation] }}</el-tag>
            <span v-if="currentMember.relation_title">{{ currentMember.relation_title }}</span>
          </div>
        </div>
        <div class="detail-actions">
          <el-button size="small" :icon="Edit" @click="openEditDialog" />
          <el-button size="small" type="danger" :icon="Delete" @click="handleDelete" />
        </div>
      </div>

      <div class="detail-section">
        <div class="section-title">基本信息</div>
        <div class="info-grid">
          <template v-if="currentMember.gender !== 'unknown'">
            <span class="info-label">性别</span>
            <span>{{ currentMember.gender === 'male' ? '男' : '女' }}</span>
          </template>
          <template v-if="currentMember.birth_date">
            <span class="info-label">生日（公历）</span>
            <span>{{ currentMember.birth_date }}</span>
          </template>
          <template v-if="currentMember.birth_lunar">
            <span class="info-label">生日（农历）</span>
            <span>{{ currentMember.birth_lunar }}</span>
          </template>
          <template v-if="currentMember.phone">
            <span class="info-label">电话</span>
            <span>{{ currentMember.phone }}</span>
          </template>
          <template v-if="currentMember.email">
            <span class="info-label">邮箱</span>
            <span>{{ currentMember.email }}</span>
          </template>
          <template v-if="currentMember.note">
            <span class="info-label">备注</span>
            <span class="info-note">{{ currentMember.note }}</span>
          </template>
        </div>
        <div v-if="parsedTags(currentMember).length" class="detail-tags">
          <el-tag v-for="t in parsedTags(currentMember)" :key="t" size="small">{{ t }}</el-tag>
        </div>
      </div>

      <div class="detail-section">
        <div class="section-title-row">
          <span class="section-title">关联人员</span>
          <el-button size="small" :icon="Plus" @click="openRelationDialog">关联</el-button>
        </div>
        <div v-if="memberStore.relationsLoading" class="tip">加载中…</div>
        <div v-else-if="memberStore.relations.length === 0" class="tip">暂无关联</div>
        <div v-for="r in memberStore.relations" :key="r.rel_id" class="relation-item">
          <div class="rel-avatar" :style="{ background: r.avatar_color }">{{ r.name.slice(0,1) }}</div>
          <div class="rel-info">
            <span class="rel-name">{{ r.name }}</span>
            <span class="rel-label" v-if="r.label">{{ r.label }}</span>
          </div>
          <el-button size="small" type="danger" text :icon="Close" @click="removeRelation(r)" />
        </div>
      </div>

      <div class="detail-section">
        <div class="section-title-row">
          <span class="section-title">经历</span>
          <el-button size="small" :icon="Plus" @click="openEventDialog">添加</el-button>
        </div>
        <div v-if="memberStore.eventsLoading" class="tip">加载中…</div>
        <div v-else-if="memberStore.events.length === 0" class="tip">暂无经历记录</div>
        <div v-for="ev in memberStore.events" :key="ev.id" class="event-item">
          <div class="event-date">{{ ev.event_date || '—' }}</div>
          <div class="event-body">
            <div class="event-title">{{ ev.title }}</div>
            <div v-if="ev.content" class="event-content">{{ ev.content }}</div>
          </div>
          <el-button size="small" type="danger" text :icon="Close" @click="deleteEvent(ev.id)" />
        </div>
      </div>
    </section>

    <section class="member-detail empty-detail" v-else>
      <div class="empty-tip">点击左侧人员查看详情</div>
    </section>

    <!-- ── 新增/编辑 弹窗 ── -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'add' ? '新增人员' : '编辑人员'"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form :model="form" label-width="90px">
        <el-form-item label="姓名" required>
          <el-input v-model="form.name" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="昵称">
          <el-input v-model="form.nickname" placeholder="可选" />
        </el-form-item>
        <el-form-item label="性别">
          <el-select v-model="form.gender" style="width:100%">
            <el-option label="未知" value="unknown" />
            <el-option label="男" value="male" />
            <el-option label="女" value="female" />
          </el-select>
        </el-form-item>
        <el-form-item label="关系分类">
          <el-select v-model="form.relation" style="width:100%">
            <el-option v-for="opt in RELATION_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="称谓">
          <el-input v-model="form.relation_title" placeholder="如：表舅、外婆" />
        </el-form-item>
        <el-form-item label="生日（公历）">
          <el-input v-model="form.birth_date" placeholder="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="生日（农历）">
          <el-input v-model="form.birth_lunar" placeholder="如：正月初一" />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="form.phone" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="form.email" />
        </el-form-item>
        <el-form-item label="标签">
          <el-select
            v-model="form.tags"
            multiple filterable allow-create default-first-option
            placeholder="输入后回车创建标签"
            style="width:100%"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitDialog">确定</el-button>
      </template>
    </el-dialog>

    <!-- ── 添加经历 弹窗 ── -->
    <el-dialog v-model="eventDialogVisible" title="添加经历" width="420px" :close-on-click-modal="false">
      <el-form :model="eventForm" label-width="80px">
        <el-form-item label="日期">
          <el-input v-model="eventForm.event_date" placeholder="YYYY-MM-DD 或自由描述" />
        </el-form-item>
        <el-form-item label="标题" required>
          <el-input v-model="eventForm.title" placeholder="简短描述" />
        </el-form-item>
        <el-form-item label="详情">
          <el-input v-model="eventForm.content" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="eventDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitEvent">确定</el-button>
      </template>
    </el-dialog>

    <!-- ── 关联人员 弹窗 ── -->
    <el-dialog v-model="relationDialogVisible" title="关联人员" width="500px" :close-on-click-modal="false">
      <el-form label-width="90px">
        <!-- 选择人员 -->
        <el-form-item label="选择人员">
          <el-select v-model="relationTargetId" filterable placeholder="搜索姓名" style="width:100%">
            <el-option
              v-for="m in memberStore.members.filter(m => m.id !== currentMember?.id)"
              :key="m.id"
              :label="`${m.name}${m.nickname ? '「' + m.nickname + '」' : ''}（${RELATION_LABELS[m.relation]}）`"
              :value="m.id"
            />
          </el-select>
        </el-form-item>

        <!-- 关系大类 -->
        <el-form-item label="关系大类">
          <div class="rel-cat-tabs">
            <span
              v-for="cat in RELATION_CATEGORIES"
              :key="cat"
              class="rel-cat-tab"
              :class="{ active: relationCategory === cat }"
              @click="onSelectCategory(cat)"
            >{{ cat }}</span>
          </div>
        </el-form-item>

        <!-- 关系组 -->
        <el-form-item label="选择关系" v-if="relationCategory">
          <el-select v-model="relationGroupName" placeholder="选择关系组" style="width:100%" @change="onSelectGroup">
            <el-option
              v-for="g in currentCategoryGroups"
              :key="g.name"
              :label="g.name"
              :value="g.name"
            />
          </el-select>
        </el-form-item>

        <!-- 我叫 TA -->
        <el-form-item v-if="relationGroupName">
          <template #label><span>{{ currentMember?.name }} 叫 TA</span></template>
          <el-select v-model="relationPairLabel" placeholder="选择称谓" style="width:100%" @change="onSelectPair">
            <el-option
              v-for="p in currentGroupPairs"
              :key="p.label"
              :label="p.label"
              :value="p.label"
            />
          </el-select>
        </el-form-item>

        <!-- TA 叫我（下拉选 + 允许自定义，选了关系组时） -->
        <el-form-item v-if="relationGroupName">
          <template #label><span>TA 叫 {{ currentMember?.name }}</span></template>
          <el-select
            v-model="relationReverseLabel"
            filterable allow-create default-first-option
            placeholder="自动填入，可选择或手动输入"
            style="width:100%"
          >
            <el-option v-for="rv in currentGroupReverseLabels" :key="rv" :label="rv" :value="rv" />
          </el-select>
        </el-form-item>

        <!-- 自定义称谓（兜底输入） -->
        <el-form-item v-if="!relationGroupName">
          <template #label><span>{{ currentMember?.name }} 叫 TA</span></template>
          <el-input v-model="relationLabel" placeholder="也可直接输入称谓" @input="onRelationLabelInput" />
        </el-form-item>
        <el-form-item v-if="!relationGroupName">
          <template #label><span>TA 叫 {{ currentMember?.name }}</span></template>
          <el-select
            v-model="relationReverseLabel"
            filterable allow-create default-first-option
            placeholder="自动推断，可选择或手动输入"
            style="width:100%"
          >
            <el-option v-for="rv in ALL_REVERSE_LABELS" :key="rv" :label="rv" :value="rv" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="relationDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitRelation">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { Plus, Edit, Delete, Close, Grid, User } from '@element-plus/icons-vue'
import {
  useMemberStore,
  RELATION_LABELS, RELATION_OPTIONS, randomAvatarColor,
  type Member, type MemberRelation, type MemberRelationRow,
} from '../../stores/member'
import { RELATION_CATEGORIES, RELATION_DICT_BY_CATEGORY, ALL_REVERSE_LABELS, inferReverseLabel, type RelationCategory } from '../../utils/relationDict'

const memberStore = useMemberStore()
memberStore.load()

const currentMember = ref<Member | null>(null)

async function selectMember(m: Member) {
  currentMember.value = m
  await Promise.all([
    memberStore.loadEvents(m.id),
    memberStore.loadRelations(m.id),
  ])
}

function parsedTags(m: Member): string[] {
  try { return JSON.parse(m.tags || '[]') } catch { return [] }
}

// ── 新增/编辑 弹窗 ──
const dialogVisible = ref(false)
const dialogMode    = ref<'add' | 'edit'>('add')
const submitting    = ref(false)

const defaultForm = () => ({
  name: '', nickname: '', gender: 'unknown',
  birth_date: '', birth_lunar: '',
  relation: 'other' as MemberRelation, relation_title: '',
  phone: '', email: '', note: '',
  tags: [] as string[],
  avatar_color: randomAvatarColor(),
})
const form = ref(defaultForm())

function openAddDialog() {
  form.value = defaultForm()
  dialogMode.value = 'add'
  dialogVisible.value = true
}

function openEditDialog() {
  if (!currentMember.value) return
  const m = currentMember.value
  form.value = {
    name: m.name, nickname: m.nickname, gender: m.gender,
    birth_date: m.birth_date, birth_lunar: m.birth_lunar,
    relation: m.relation, relation_title: m.relation_title,
    phone: m.phone, email: m.email, note: m.note,
    tags: (() => { try { return JSON.parse(m.tags || '[]') } catch { return [] } })(),
    avatar_color: m.avatar_color,
  }
  dialogMode.value = 'edit'
  dialogVisible.value = true
}

async function submitDialog() {
  if (!form.value.name.trim()) { ElMessage.warning('姓名不能为空'); return }
  submitting.value = true
  try {
    if (dialogMode.value === 'add') {
      await memberStore.addMember(form.value)
    } else if (currentMember.value) {
      await memberStore.updateMember(currentMember.value.id, form.value)
      const updated = memberStore.members.find(m => m.id === currentMember.value!.id)
      if (updated) currentMember.value = updated
    }
    dialogVisible.value = false
  } finally {
    submitting.value = false
  }
}

async function handleDelete() {
  if (!currentMember.value) return
  await ElMessageBox.confirm(`确定删除「${currentMember.value.name}」？`, '删除确认', { type: 'warning' })
  await memberStore.deleteMember(currentMember.value.id)
  currentMember.value = null
}

// ── 经历弹窗 ──
const eventDialogVisible = ref(false)
const eventForm = ref({ event_date: '', title: '', content: '' })

function openEventDialog() {
  eventForm.value = { event_date: '', title: '', content: '' }
  eventDialogVisible.value = true
}

async function submitEvent() {
  if (!eventForm.value.title.trim()) { ElMessage.warning('标题不能为空'); return }
  if (!currentMember.value) return
  submitting.value = true
  try {
    await memberStore.addEvent({ member_id: currentMember.value.id, ...eventForm.value })
    eventDialogVisible.value = false
  } finally {
    submitting.value = false
  }
}

async function deleteEvent(id: string) {
  await ElMessageBox.confirm('确定删除该经历？', '删除确认', { type: 'warning' })
  await memberStore.deleteEvent(id)
}

// ── 关联弹窗 ──
const relationDialogVisible  = ref(false)
const relationTargetId       = ref('')
const relationCategory       = ref<RelationCategory | ''>('')
const relationGroupName      = ref('')
const relationPairLabel      = ref('')
const relationLabel          = ref('')   // 兜底：直接手动输入时使用
const relationReverseLabel   = ref('')

// 当前大类下的所有关系组
const currentCategoryGroups = computed(() =>
  RELATION_DICT_BY_CATEGORY.find(c => c.category === relationCategory.value)?.groups ?? []
)

// 当前关系组的称谓对列表
const currentGroupPairs = computed(() =>
  currentCategoryGroups.value.find(g => g.name === relationGroupName.value)?.pairs ?? []
)

// 当前关系组所有 label 称谓（去重，用于「TA 叫我」下拉候选）
// 对方叫我的称谓 = 该关系组任意一个正向 label
const currentGroupReverseLabels = computed(() =>
  [...new Set(currentGroupPairs.value.map(p => p.label))]
)

function onSelectCategory(cat: RelationCategory) {
  relationCategory.value     = cat
  relationGroupName.value    = ''
  relationPairLabel.value    = ''
  relationLabel.value        = ''
  relationReverseLabel.value = ''
}

function onSelectGroup() {
  relationPairLabel.value    = ''
  relationLabel.value        = ''
  relationReverseLabel.value = ''
  // 自动选中该组第一个称谓对
  const first = currentGroupPairs.value[0]
  if (first) {
    relationPairLabel.value    = first.label
    relationLabel.value        = first.label
    relationReverseLabel.value = first.reverse
  }
}

function onSelectPair(label: string) {
  const pair = currentGroupPairs.value.find(p => p.label === label)
  relationLabel.value        = label
  relationReverseLabel.value = pair?.reverse ?? ''
}

function onRelationLabelInput(val: string) {
  relationReverseLabel.value = inferReverseLabel(val)
}

function openRelationDialog() {
  relationTargetId.value     = ''
  relationCategory.value     = ''
  relationGroupName.value    = ''
  relationPairLabel.value    = ''
  relationLabel.value        = ''
  relationReverseLabel.value = ''
  relationDialogVisible.value = true
}

async function submitRelation() {
  if (!relationTargetId.value) { ElMessage.warning('请选择要关联的人员'); return }
  if (!currentMember.value) return
  submitting.value = true
  try {
    await memberStore.addRelation({
      from_id:       currentMember.value.id,
      to_id:         relationTargetId.value,
      label:         relationLabel.value,
      reverse_label: relationReverseLabel.value,
    })
    relationDialogVisible.value = false
  } finally {
    submitting.value = false
  }
}

async function removeRelation(r: MemberRelationRow) {
  if (!currentMember.value) return
  await ElMessageBox.confirm(`确定解除与「${r.name}」的关联？`, '解除确认', { type: 'warning' })
  await memberStore.deleteRelation(currentMember.value.id, r.id)
  await memberStore.loadRelations(currentMember.value.id)
}

watch(() => memberStore.members, (list) => {
  if (currentMember.value) {
    const updated = list.find(m => m.id === currentMember.value!.id)
    if (updated) currentMember.value = updated
  }
}, { deep: true })
</script>

<style scoped>
.member-view { display: flex; height: 100%; overflow: hidden; }

.member-sidebar {
  width: 180px; flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  display: flex; flex-direction: column; gap: 2px;
  padding: 12px 8px; overflow-y: auto;
}
.sidebar-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 4px 4px 8px; margin-bottom: 4px;
}
.sidebar-title { font-size: 15px; font-weight: 600; color: var(--color-text); }
.search-input { margin-bottom: 8px; }
.section-label {
  font-size: 11px; color: var(--color-text-secondary);
  padding: 8px 4px 2px; text-transform: uppercase; letter-spacing: 0.5px;
}
.filter-item {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 8px; border-radius: var(--radius-sm);
  cursor: pointer; font-size: 13px; color: var(--color-text-secondary);
  transition: all 120ms;
}
.filter-item:hover { background: var(--color-border); color: var(--color-text); }
.filter-item.active { background: var(--color-accent-light); color: var(--color-accent); font-weight: 500; }
.count { margin-left: auto; font-size: 11px; opacity: 0.6; }
.tag-item { padding: 4px 8px; }

.member-list {
  width: 240px; flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  overflow-y: auto; padding: 8px;
  display: flex; flex-direction: column; gap: 6px;
}
.member-card {
  display: flex; gap: 10px; align-items: flex-start;
  padding: 10px; border-radius: var(--radius-sm);
  cursor: pointer; border: 1px solid transparent;
  transition: all 120ms;
}
.member-card:hover { background: var(--color-border); }
.member-card.active { background: var(--color-accent-light); border-color: var(--color-accent); }
.avatar {
  width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 16px; font-weight: 600; flex-shrink: 0;
}
.card-info { flex: 1; min-width: 0; }
.card-name { font-size: 14px; font-weight: 500; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-nickname { font-size: 12px; color: var(--color-text-secondary); font-weight: 400; }
.card-meta { display: flex; align-items: center; gap: 4px; margin-top: 2px; }
.card-title-text { font-size: 12px; color: var(--color-text-secondary); }
.card-tags { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; }

.member-detail {
  flex: 1; overflow-y: auto; padding: 20px 24px;
  display: flex; flex-direction: column; gap: 20px;
}
.empty-detail { align-items: center; justify-content: center; }

.detail-header {
  display: flex; align-items: center; gap: 16px;
  padding-bottom: 16px; border-bottom: 1px solid var(--color-border);
}
.detail-avatar {
  width: 56px; height: 56px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 24px; font-weight: 700; flex-shrink: 0;
}
.detail-title { flex: 1; }
.detail-name { margin: 0 0 4px; font-size: 20px; font-weight: 600; }
.detail-nickname { font-size: 14px; color: var(--color-text-secondary); font-weight: 400; }
.detail-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.detail-actions { display: flex; gap: 6px; }

.detail-section { display: flex; flex-direction: column; gap: 8px; }
.section-title { font-size: 13px; font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
.section-title-row { display: flex; align-items: center; justify-content: space-between; }

.info-grid {
  display: grid; grid-template-columns: 90px 1fr;
  gap: 6px 12px; font-size: 13px;
}
.info-label { color: var(--color-text-secondary); }
.info-note { white-space: pre-wrap; line-height: 1.5; }
.detail-tags { display: flex; flex-wrap: wrap; gap: 4px; }

.relation-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px; border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
}
.rel-avatar {
  width: 30px; height: 30px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 13px; font-weight: 600; flex-shrink: 0;
}
.rel-info { flex: 1; display: flex; align-items: center; gap: 6px; }
.rel-name { font-size: 13px; font-weight: 500; }
.rel-label { font-size: 12px; color: var(--color-text-secondary); }

.event-item {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 10px; border-radius: var(--radius-sm);
  border-left: 3px solid var(--color-accent); background: var(--color-bg-sidebar);
}
.event-date { font-size: 12px; color: var(--color-text-secondary); white-space: nowrap; padding-top: 2px; min-width: 80px; }
.event-body { flex: 1; }
.event-title { font-size: 13px; font-weight: 500; }
.event-content { font-size: 12px; color: var(--color-text-secondary); margin-top: 2px; white-space: pre-wrap; }

.empty-tip { color: var(--color-text-secondary); font-size: 13px; text-align: center; padding: 24px 0; }
.tip { font-size: 12px; color: var(--color-text-secondary); padding: 4px 0; }

/* 关联弹窗大类 tab */
.rel-cat-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
.rel-cat-tab {
  padding: 3px 10px; border-radius: 12px; font-size: 12px;
  border: 1px solid var(--color-border); cursor: pointer;
  color: var(--color-text-secondary); transition: all 120ms;
}
.rel-cat-tab:hover { border-color: var(--color-accent); color: var(--color-accent); }
.rel-cat-tab.active { background: var(--color-accent); border-color: var(--color-accent); color: #fff; font-weight: 500; }
</style>
