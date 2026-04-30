<template>
  <div class="fav-view">
    <!-- 左侧导航 -->
    <div class="fav-sidebar">
      <div class="fav-sidebar-header">
        <span class="fav-sidebar-title">收藏</span>
        <el-button type="primary" :icon="Plus" size="small" circle @click="openAdd()" />
      </div>

      <div class="fav-search">
        <el-input v-model="keyword" placeholder="搜索" :prefix-icon="Search" clearable size="small" @input="onSearch" />
      </div>

      <div class="fav-nav">
        <div
          v-for="tab in TABS"
          :key="tab.key"
          class="fav-nav-item"
          :class="{ active: activeTab === tab.key }"
          @click="switchTab(tab.key)"
        >
          <span class="fav-nav-icon">{{ tab.emoji }}</span>
          <span class="fav-nav-label">{{ tab.label }}</span>
          <span v-if="tabCount(tab.key) > 0" class="fav-nav-count">{{ tabCount(tab.key) }}</span>
        </div>
      </div>
    </div>

    <!-- 右侧内容 -->
    <div class="fav-main">
      <el-empty v-if="!store.loading && filtered.length === 0" description="暂无收藏" style="margin-top:80px" />

      <div class="fav-list" v-loading="store.loading">
        <!-- 链接卡片 -->
        <template v-if="activeTab !== 'quote'">
          <div
            v-for="item in filtered.filter(i => i.type === 'link')"
            :key="item.id"
            class="fav-card link-card"
          >
            <div class="card-top">
              <div class="card-meta">
                <el-icon v-if="item.is_pinned" class="pin-icon"><StarFilled /></el-icon>
                <span class="card-type-tag link-tag">链接</span>
                <div class="card-tags" v-if="parseTags(item.tags).length">
                  <el-tag v-for="t in parseTags(item.tags)" :key="t" size="small" type="info" effect="plain">{{ t }}</el-tag>
                </div>
              </div>
              <div class="card-actions">
                <el-tooltip content="打开链接" placement="top" :show-after="400">
                  <el-button link size="small" :icon="LinkIcon" @click="openUrl(item.url)" />
                </el-tooltip>
                <el-tooltip content="复制链接" placement="top" :show-after="400">
                  <el-button link size="small" :icon="CopyDocument" @click="copy(item.url)" />
                </el-tooltip>
                <el-tooltip :content="item.is_pinned ? '取消置顶' : '置顶'" placement="top" :show-after="400">
                  <el-button link size="small" :icon="item.is_pinned ? StarFilled : Star" @click="store.togglePin(item)" />
                </el-tooltip>
                <el-button link size="small" :icon="Edit" @click="openEdit(item)" />
                <el-popconfirm title="确认删除？" confirm-button-text="删除" cancel-button-text="取消" @confirm="store.remove(item.id)">
                  <template #reference>
                    <el-button link size="small" :icon="Delete" class="btn-danger" />
                  </template>
                </el-popconfirm>
              </div>
            </div>
            <div class="card-title">{{ item.title || item.url }}</div>
            <div class="card-url" @click="openUrl(item.url)">{{ item.url }}</div>
            <div v-if="item.author" class="card-author">— {{ item.author }}</div>
          </div>
        </template>

        <!-- 名言卡片 -->
        <template v-if="activeTab !== 'link'">
          <div
            v-for="item in filtered.filter(i => i.type === 'quote')"
            :key="item.id"
            class="fav-card quote-card"
          >
            <div class="card-top">
              <div class="card-meta">
                <el-icon v-if="item.is_pinned" class="pin-icon"><StarFilled /></el-icon>
                <span class="card-type-tag quote-tag">名言</span>
                <div class="card-tags" v-if="parseTags(item.tags).length">
                  <el-tag v-for="t in parseTags(item.tags)" :key="t" size="small" type="warning" effect="plain">{{ t }}</el-tag>
                </div>
              </div>
              <div class="card-actions">
                <el-tooltip content="复制" placement="top" :show-after="400">
                  <el-button link size="small" :icon="CopyDocument" @click="copy(item.content)" />
                </el-tooltip>
                <el-tooltip :content="item.is_pinned ? '取消置顶' : '置顶'" placement="top" :show-after="400">
                  <el-button link size="small" :icon="item.is_pinned ? StarFilled : Star" @click="store.togglePin(item)" />
                </el-tooltip>
                <el-button link size="small" :icon="Edit" @click="openEdit(item)" />
                <el-popconfirm title="确认删除？" confirm-button-text="删除" cancel-button-text="取消" @confirm="store.remove(item.id)">
                  <template #reference>
                    <el-button link size="small" :icon="Delete" class="btn-danger" />
                  </template>
                </el-popconfirm>
              </div>
            </div>
            <div class="quote-content">{{ item.content }}</div>
            <div v-if="item.author || item.title" class="quote-source">
              <span v-if="item.author">— {{ item.author }}</span>
              <span v-if="item.title" class="quote-title-ref">《{{ item.title }}》</span>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- 新增 / 编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑收藏' : '新增收藏'"
      width="500px"
      :close-on-click-modal="false"
      @closed="resetForm"
    >
      <el-form :model="form" label-width="72px" label-position="left">
        <el-form-item label="类型">
          <el-radio-group v-model="form.type" :disabled="!!editingId">
            <el-radio value="link">🔗 网页链接</el-radio>
            <el-radio value="quote">💬 名人名言</el-radio>
          </el-radio-group>
        </el-form-item>

        <!-- 链接专属 -->
        <template v-if="form.type === 'link'">
          <el-form-item label="链接" required>
            <el-input v-model="form.url" placeholder="https://..." @blur="autoFillTitle" />
          </el-form-item>
          <el-form-item label="标题">
            <el-input v-model="form.title" placeholder="留空则显示链接地址" />
          </el-form-item>
          <el-form-item label="来源">
            <el-input v-model="form.author" placeholder="网站名 / 作者（选填）" />
          </el-form-item>
        </template>

        <!-- 名言专属 -->
        <template v-if="form.type === 'quote'">
          <el-form-item label="内容" required>
            <el-input v-model="form.content" type="textarea" :rows="4" placeholder="输入名言内容..." />
          </el-form-item>
          <el-form-item label="作者">
            <el-input v-model="form.author" placeholder="作者姓名（选填）" />
          </el-form-item>
          <el-form-item label="出处">
            <el-input v-model="form.title" placeholder="书名 / 文章名（选填）" />
          </el-form-item>
        </template>

        <!-- 公共字段 -->
        <el-form-item label="标签">
          <div class="tag-input-area">
            <el-tag
              v-for="t in form.tags"
              :key="t"
              closable
              size="small"
              @close="removeTag(t)"
            >{{ t }}</el-tag>
            <el-input
              v-if="tagInputVisible"
              ref="tagInputRef"
              v-model="tagInputVal"
              size="small"
              style="width:80px"
              @keyup.enter="confirmTag"
              @blur="confirmTag"
            />
            <el-button v-else size="small" @click="showTagInput">+ 标签</el-button>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Plus, Search, Edit, Delete, Star, StarFilled,
  CopyDocument, Link as LinkIcon
} from '@element-plus/icons-vue'
import { useFavoriteStore } from '../../stores/favorite'
import type { Favorite, FavoriteType } from '../../stores/favorite'

const store = useFavoriteStore()

// ==================== 导航 Tab ====================
const TABS = [
  { key: 'all',   label: '全部',     emoji: '🗂' },
  { key: 'link',  label: '网页链接', emoji: '🔗' },
  { key: 'quote', label: '名人名言', emoji: '💬' },
] as const

type TabKey = typeof TABS[number]['key']
const activeTab = ref<TabKey>('all')
const keyword = ref('')

function tabCount(key: TabKey) {
  if (key === 'all') return store.items.length
  return store.items.filter(i => i.type === key).length
}

function switchTab(key: TabKey) {
  activeTab.value = key
}

function onSearch() {
  store.load({ keyword: keyword.value })
}

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return store.items.filter(item => {
    const tabOk = activeTab.value === 'all' || item.type === activeTab.value
    if (!tabOk) return false
    if (!kw) return true
    return (
      item.title.toLowerCase().includes(kw) ||
      item.url.toLowerCase().includes(kw) ||
      item.content.toLowerCase().includes(kw) ||
      item.author.toLowerCase().includes(kw)
    )
  })
})

// ==================== 工具函数 ====================
function parseTags(raw: string): string[] {
  try { return JSON.parse(raw) } catch { return [] }
}

function openUrl(url: string) {
  if (!url) return
  window.dreamAPI.app.openExternal(url.startsWith('http') ? url : `https://${url}`)
}

async function copy(text: string) {
  if (!text) return
  try { await navigator.clipboard.writeText(text); ElMessage.success('已复制') }
  catch { ElMessage.error('复制失败') }
}

// ==================== 弹窗表单 ====================
const dialogVisible = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)

const form = ref({
  type: 'link' as FavoriteType,
  title: '',
  url: '',
  content: '',
  author: '',
  tags: [] as string[]
})

// 标签输入
const tagInputVisible = ref(false)
const tagInputVal = ref('')
const tagInputRef = ref<InstanceType<typeof import('element-plus')['ElInput']> | null>(null)

function showTagInput() {
  tagInputVisible.value = true
  nextTick(() => tagInputRef.value?.focus())
}

function confirmTag() {
  const val = tagInputVal.value.trim()
  if (val && !form.value.tags.includes(val)) form.value.tags.push(val)
  tagInputVisible.value = false
  tagInputVal.value = ''
}

function removeTag(tag: string) {
  form.value.tags = form.value.tags.filter(t => t !== tag)
}

// 链接失焦自动填充标题（取 hostname 作为默认标题）
function autoFillTitle() {
  if (form.value.url && !form.value.title) {
    try {
      const u = new URL(form.value.url.startsWith('http') ? form.value.url : `https://${form.value.url}`)
      form.value.title = u.hostname.replace(/^www\./, '')
    } catch { /* 非法 URL 忽略 */ }
  }
}

function openAdd(type?: FavoriteType) {
  editingId.value = null
  if (type) form.value.type = type
  else if (activeTab.value !== 'all') form.value.type = activeTab.value as FavoriteType
  dialogVisible.value = true
}

function openEdit(item: Favorite) {
  editingId.value = item.id
  form.value = {
    type: item.type,
    title: item.title,
    url: item.url,
    content: item.content,
    author: item.author,
    tags: parseTags(item.tags)
  }
  dialogVisible.value = true
}

function resetForm() {
  editingId.value = null
  form.value = { type: 'link', title: '', url: '', content: '', author: '', tags: [] }
  tagInputVisible.value = false
  tagInputVal.value = ''
}

async function handleSave() {
  const f = form.value
  if (f.type === 'link' && !f.url.trim()) { ElMessage.warning('请填写链接地址'); return }
  if (f.type === 'quote' && !f.content.trim()) { ElMessage.warning('请填写名言内容'); return }

  // 解除 Vue 响应式 Proxy，避免 IPC 结构化克隆失败
  const tags = [...f.tags]

  saving.value = true
  try {
    if (editingId.value) {
      await store.update(editingId.value, {
        title: f.title, url: f.url, content: f.content,
        author: f.author, tags: tags as unknown as string  // store 传 string[]，IPC 序列化
      } as Parameters<typeof store.update>[1])
      ElMessage.success('已更新')
    } else {
      await store.add({ type: f.type, title: f.title, url: f.url, content: f.content, author: f.author, tags })
      ElMessage.success('已收藏')
    }
    dialogVisible.value = false
  } catch (e) {
    ElMessage.error('保存失败'); console.error(e)
  } finally {
    saving.value = false
  }
}

// ==================== 初始化 ====================
onMounted(() => store.load())
</script>

<style scoped>
.fav-view {
  display: flex;
  height: 100%;
  overflow: hidden;
}

/* ===== 左侧导航 ===== */
.fav-sidebar {
  width: 160px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  padding: 16px 8px 12px;
  gap: 8px;
}
.fav-sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px 4px;
}
.fav-sidebar-title { font-size: 13px; font-weight: 600; color: var(--color-text); }
.fav-search { padding: 0 2px; }

.fav-nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.fav-nav-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: 13px;
  transition: all var(--duration-fast) var(--ease-out);
  user-select: none;
}
.fav-nav-item:hover { background: var(--color-border); color: var(--color-text); }
.fav-nav-item.active { background: var(--color-accent-light); color: var(--color-accent); font-weight: 500; }
.fav-nav-icon { font-size: 14px; flex-shrink: 0; }
.fav-nav-label { flex: 1; }
.fav-nav-count {
  font-size: 11px;
  background: var(--color-border);
  color: var(--color-text-secondary);
  border-radius: 10px;
  padding: 0 6px;
  min-width: 18px;
  text-align: center;
}
.fav-nav-item.active .fav-nav-count {
  background: var(--color-accent-light);
  color: var(--color-accent);
}

/* ===== 右侧内容 ===== */
.fav-main {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.fav-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
  align-content: start;
}

/* ===== 卡片通用 ===== */
.fav-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: box-shadow var(--duration-fast) var(--ease-out);
}
.fav-card:hover { box-shadow: var(--shadow-md); }

.card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}
.pin-icon { color: var(--el-color-warning); font-size: 13px; flex-shrink: 0; }

.card-type-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 500;
  flex-shrink: 0;
}
.link-tag  { background: #e8f4fd; color: #1a73e8; }
.quote-tag { background: #fff8e1; color: #f57f17; }

.card-tags { display: flex; gap: 4px; flex-wrap: wrap; }
/* 消除 el-tag 相邻 margin */
.card-tags :deep(.el-tag + .el-tag) { margin-left: 0; }

.card-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.card-actions :deep(.el-button + .el-button) { margin-left: 0; }
.card-actions :deep(.el-button) { padding: 2px 3px; }

/* ===== 链接卡片 ===== */
.card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.4;
  word-break: break-word;
}
.card-url {
  font-size: 12px;
  color: var(--color-accent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.card-url:hover { text-decoration: underline; }
.card-author {
  font-size: 12px;
  color: var(--color-text-secondary);
}

/* ===== 名言卡片 ===== */
.quote-card { border-left: 3px solid var(--el-color-warning); }
.quote-content {
  font-size: 14px;
  color: var(--color-text);
  line-height: 1.7;
  word-break: break-word;
  white-space: pre-wrap;
}
.quote-source {
  font-size: 12px;
  color: var(--color-text-secondary);
  display: flex;
  gap: 6px;
  align-items: center;
}
.quote-title-ref { font-style: italic; }

.btn-danger { color: var(--el-color-danger) !important; }

/* ===== 标签输入 ===== */
.tag-input-area {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.tag-input-area :deep(.el-tag + .el-tag) { margin-left: 0; }
</style>
