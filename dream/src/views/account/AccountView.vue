<template>
  <div class="account-view">
    <!-- 未解锁：密钥输入界面 -->
    <div v-if="!store.keyVerified" class="lock-screen">
      <div class="lock-card">
        <el-icon class="lock-icon"><Lock /></el-icon>
        <h2 class="lock-title">账号管理</h2>
        <p class="lock-desc">请输入密钥以解锁账号数据</p>
        <el-input
          v-model="inputKey"
          type="password"
          placeholder="输入密钥"
          show-password
          size="large"
          style="width: 280px;"
          @keyup.enter="unlock"
        />
        <el-alert
          v-if="keyError"
          :title="keyError"
          type="error"
          show-icon
          :closable="false"
          style="margin-top: 12px; width: 280px;"
        />
        <el-button type="primary" size="large" style="margin-top: 16px; width: 280px;" @click="unlock">
          解锁
        </el-button>
      </div>
    </div>

    <!-- 已解锁：两栏布局 -->
    <template v-else>
      <!-- 左侧：分类导航 -->
      <div class="category-sidebar">
        <div class="category-header">
          <span class="category-title">账号管理</span>
          <el-button type="primary" size="small" :icon="Plus" circle @click="openAdd" />
        </div>

        <!-- 搜索框 -->
        <div class="category-search">
          <el-input
            v-model="keyword"
            placeholder="搜索"
            :prefix-icon="Search"
            clearable
            size="small"
          />
        </div>

        <!-- 分类列表 -->
        <div class="category-list">
          <div
            v-for="cat in categoryList"
            :key="cat.key"
            class="category-item"
            :class="{ active: activeCategory === cat.key }"
            @click="activeCategory = cat.key"
          >
            <span class="cat-icon">{{ cat.emoji }}</span>
            <span class="cat-label">{{ cat.label }}</span>
            <span v-if="cat.count > 0" class="cat-count">{{ cat.count }}</span>
          </div>
        </div>

        <!-- 底部锁定 -->
        <div class="category-footer">
          <el-button link size="small" :icon="Lock" @click="store.clearKey()" style="color: var(--color-text-secondary);">
            锁定
          </el-button>
        </div>
      </div>

      <!-- 右侧：账号列表 -->
      <div class="account-main">
        <div class="account-list" v-loading="store.loading">
          <el-empty v-if="filtered.length === 0" description="暂无账号" style="margin-top: 80px;" />

          <div v-for="acc in filtered" :key="acc.id" class="account-card">
            <!-- 卡片头 -->
            <div class="card-header">
              <div class="header-left">
                <span class="platform-name">{{ acc.platform }}</span>
                <span class="cat-tag" :style="{ background: catColorMap[acc.category]?.bg, color: catColorMap[acc.category]?.text }">
                  {{ catLabelMap[acc.category] ?? acc.category }}
                </span>
                <el-tooltip v-if="acc.platform_url" :content="acc.platform_url" placement="top" :show-after="300">
                  <el-button link size="small" :icon="LinkIcon" class="icon-btn" @click="openUrl(acc.platform_url)" />
                </el-tooltip>
                <el-tooltip v-if="acc.platform_url" content="复制链接" placement="top" :show-after="300">
                  <el-button link size="small" :icon="CopyDocument" class="icon-btn" @click="copy(acc.platform_url)" />
                </el-tooltip>
              </div>
              <div class="card-actions">
                <el-button link size="small" :icon="Edit" @click="openEdit(acc)" />
                <el-popconfirm
                  title="确认删除该账号？"
                  confirm-button-text="删除"
                  cancel-button-text="取消"
                  @confirm="handleDelete(acc.id)"
                >
                  <template #reference>
                    <el-button link size="small" :icon="Delete" class="btn-danger" />
                  </template>
                </el-popconfirm>
              </div>
            </div>

            <!-- 字段区：紧凑行内排列 -->
            <div class="card-fields">
              <template v-if="acc.account_name">
                <div class="field-row">
                  <span class="field-label">账号名称</span>
                  <span class="field-value">{{ acc.account_name }}</span>
                  <el-button link size="small" :icon="CopyDocument" class="copy-btn" @click="copy(acc.account_name)" />
                </div>
              </template>
              <template v-if="acc.phone">
                <div class="field-row">
                  <span class="field-label">手机号</span>
                  <span class="field-value">{{ acc.phone }}</span>
                  <el-button link size="small" :icon="CopyDocument" class="copy-btn" @click="copy(acc.phone)" />
                </div>
              </template>
              <template v-if="acc.email">
                <div class="field-row">
                  <span class="field-label">邮箱</span>
                  <span class="field-value">{{ acc.email }}</span>
                  <el-button link size="small" :icon="CopyDocument" class="copy-btn" @click="copy(acc.email)" />
                </div>
              </template>
              <template v-if="acc.password_enc">
                <div class="field-row">
                  <span class="field-label">密码</span>
                  <span class="field-value monospace">
                    <span v-if="revealedIds.has(acc.id)">{{ acc.password_plain ?? '解密失败' }}</span>
                    <span v-else class="password-dots">••••••••</span>
                  </span>
                  <el-button
                    link size="small"
                    :icon="revealedIds.has(acc.id) ? Hide : View"
                    class="copy-btn"
                    @click="toggleReveal(acc)"
                  />
                  <el-button
                    v-if="revealedIds.has(acc.id)"
                    link size="small" :icon="CopyDocument" class="copy-btn"
                    @click="copy(acc.password_plain ?? '')"
                  />
                </div>
              </template>
              <template v-if="acc.note">
                <div class="field-row">
                  <span class="field-label">备注</span>
                  <span class="field-value note-text">{{ acc.note }}</span>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- 新增 / 编辑弹窗 -->
      <el-dialog
        v-model="dialogVisible"
        :title="editingId ? '编辑账号' : '新增账号'"
        width="480px"
        :close-on-click-modal="false"
        @closed="resetForm"
      >
        <el-form :model="form" label-width="80px" label-position="left">
          <el-form-item label="平台名称" required>
            <el-input v-model="form.platform" placeholder="如 GitHub、微博" />
          </el-form-item>
          <el-form-item label="平台类型">
            <el-select v-model="form.category" style="width: 100%;">
              <el-option
                v-for="cat in CATEGORIES"
                :key="cat.key"
                :label="`${cat.emoji} ${cat.label}`"
                :value="cat.key"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="平台链接">
            <el-input v-model="form.platform_url" placeholder="https://..." />
          </el-form-item>
          <el-form-item label="账号名称">
            <el-input v-model="form.account_name" placeholder="用户名 / 昵称" />
          </el-form-item>
          <el-form-item label="手机号">
            <el-input v-model="form.phone" placeholder="选填" />
          </el-form-item>
          <el-form-item label="邮箱">
            <el-input v-model="form.email" placeholder="选填" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input
              v-model="form.password"
              type="password"
              show-password
              :placeholder="editingId ? '不填则保持原密码' : '选填'"
            />
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="form.note" type="textarea" :rows="2" placeholder="选填" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
        </template>
      </el-dialog>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Lock, Plus, Edit, Delete, View, Hide, CopyDocument, Link as LinkIcon, Search } from '@element-plus/icons-vue'
import { useAccountStore } from '../../stores/account'
import type { AccountWithPlain, AccountCategory } from '../../stores/account'

const store = useAccountStore()

// ==================== 分类定义 ====================
const CATEGORIES: { key: AccountCategory; label: string; emoji: string }[] = [
  { key: 'dev',      label: '开发工具',  emoji: '🛠' },
  { key: 'social',   label: '社交媒体',  emoji: '💬' },
  { key: 'shopping', label: '购物',      emoji: '🛒' },
  { key: 'finance',  label: '金融',      emoji: '💰' },
  { key: 'game',     label: '游戏',      emoji: '🎮' },
  { key: 'work',     label: '工作',      emoji: '💼' },
  { key: 'media',    label: '音视频',    emoji: '🎵' },
  { key: 'other',    label: '其他',      emoji: '📦' },
]

const catLabelMap: Record<string, string> = Object.fromEntries(CATEGORIES.map(c => [c.key, c.label]))

const catColorMap: Record<string, { bg: string; text: string }> = {
  dev:      { bg: '#e8f4fd', text: '#1a73e8' },
  social:   { bg: '#fce8f3', text: '#c2185b' },
  shopping: { bg: '#fff3e0', text: '#e65100' },
  finance:  { bg: '#e8f5e9', text: '#2e7d32' },
  game:     { bg: '#ede7f6', text: '#512da8' },
  work:     { bg: '#e3f2fd', text: '#1565c0' },
  media:    { bg: '#fce4ec', text: '#880e4f' },
  other:    { bg: '#f5f5f5', text: '#616161' },
}

// ==================== 解锁 ====================
const inputKey = ref('')
const keyError = ref('')

async function unlock() {
  if (!inputKey.value.trim()) { keyError.value = '密钥不能为空'; return }
  if (store.accounts.length === 0) await store.load()
  const ok = store.setSecretKey(inputKey.value.trim())
  if (!ok) { keyError.value = '密钥错误，请重试'; inputKey.value = '' }
  else { keyError.value = ''; inputKey.value = '' }
}

// ==================== 分类导航 ====================
const activeCategory = ref<AccountCategory | 'all'>('all')
const keyword = ref('')

const categoryList = computed(() => {
  const allCount = store.accounts.filter(a => matchKw(a)).length
  const cats = CATEGORIES.map(c => ({
    ...c,
    count: store.accounts.filter(a => a.category === c.key && matchKw(a)).length
  })).filter(c => c.count > 0)
  return [{ key: 'all' as const, label: '全部', emoji: '🗂', count: allCount }, ...cats]
})

function matchKw(a: AccountWithPlain) {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return true
  return (
    a.platform.toLowerCase().includes(kw) ||
    a.account_name.toLowerCase().includes(kw) ||
    a.email.toLowerCase().includes(kw) ||
    a.phone.includes(kw)
  )
}

const filtered = computed(() => {
  return store.accounts.filter(a => {
    const catOk = activeCategory.value === 'all' || a.category === activeCategory.value
    return catOk && matchKw(a)
  })
})

// ==================== 密码显示 ====================
const revealedIds = ref<Set<string>>(new Set())

function toggleReveal(acc: AccountWithPlain) {
  const s = new Set(revealedIds.value)
  s.has(acc.id) ? s.delete(acc.id) : s.add(acc.id)
  revealedIds.value = s
}

// ==================== 工具函数 ====================
function openUrl(url: string) {
  if (!url) return
  window.dreamAPI.app.openExternal(url.startsWith('http') ? url : `https://${url}`)
}

async function copy(text: string) {
  if (!text) return
  try { await navigator.clipboard.writeText(text); ElMessage.success('已复制') }
  catch { ElMessage.error('复制失败') }
}

async function handleDelete(id: string) {
  await store.deleteAccount(id)
  const s = new Set(revealedIds.value); s.delete(id); revealedIds.value = s
  ElMessage.success('已删除')
}

// ==================== 弹窗表单 ====================
const dialogVisible = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)

const form = ref({
  platform: '',
  category: 'other' as AccountCategory,
  platform_url: '',
  account_name: '',
  phone: '',
  email: '',
  password: '',
  note: ''
})

function openAdd() {
  editingId.value = null
  dialogVisible.value = true
}

function openEdit(acc: AccountWithPlain) {
  editingId.value = acc.id
  form.value = {
    platform: acc.platform,
    category: acc.category,
    platform_url: acc.platform_url,
    account_name: acc.account_name,
    phone: acc.phone,
    email: acc.email,
    password: '',
    note: acc.note
  }
  dialogVisible.value = true
}

function resetForm() {
  editingId.value = null
  form.value = { platform: '', category: 'other', platform_url: '', account_name: '', phone: '', email: '', password: '', note: '' }
}

async function handleSave() {
  if (!form.value.platform.trim()) { ElMessage.warning('请填写平台名称'); return }
  saving.value = true
  try {
    if (editingId.value) {
      await store.updateAccount(editingId.value, {
        platform: form.value.platform,
        category: form.value.category,
        platform_url: form.value.platform_url,
        account_name: form.value.account_name,
        phone: form.value.phone,
        email: form.value.email,
        note: form.value.note,
        password: form.value.password || undefined
      })
      ElMessage.success('已更新')
    } else {
      await store.addAccount({
        platform: form.value.platform,
        category: form.value.category,
        platform_url: form.value.platform_url,
        account_name: form.value.account_name,
        phone: form.value.phone,
        email: form.value.email,
        password: form.value.password || undefined,
        note: form.value.note
      })
      ElMessage.success('已添加')
    }
    dialogVisible.value = false
  } catch (e) {
    ElMessage.error('保存失败'); console.error(e)
  } finally {
    saving.value = false
  }
}

// ==================== 初始化 ====================
onMounted(async () => {
  if (store.accounts.length === 0) await store.load()
})
</script>

<style scoped>
.account-view {
  display: flex;
  height: 100%;
  overflow: hidden;
}

/* ===== 锁屏 ===== */
.lock-screen {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lock-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 32px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.lock-icon { font-size: 48px; color: var(--color-accent); }
.lock-title { margin: 0; font-size: 20px; font-weight: 600; color: var(--color-text); }
.lock-desc { margin: 0; font-size: 13px; color: var(--color-text-secondary); }

/* ===== 左侧分类栏 ===== */
.category-sidebar {
  width: 160px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  padding: 16px 8px 12px;
  gap: 8px;
}
.category-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px 4px;
}
.category-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}
.category-search { padding: 0 2px; }
.category-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}
.category-item {
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
.category-item:hover { background: var(--color-border); color: var(--color-text); }
.category-item.active { background: var(--color-accent-light); color: var(--color-accent); font-weight: 500; }
.cat-icon { font-size: 14px; flex-shrink: 0; }
.cat-label { flex: 1; }
.cat-count {
  font-size: 11px;
  background: var(--color-border);
  color: var(--color-text-secondary);
  border-radius: 10px;
  padding: 0 6px;
  min-width: 18px;
  text-align: center;
}
.category-item.active .cat-count {
  background: var(--color-accent-light);
  color: var(--color-accent);
}
.category-footer {
  border-top: 1px solid var(--color-border);
  padding-top: 8px;
  display: flex;
  justify-content: center;
}

/* ===== 右侧主区域 ===== */
.account-main {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.account-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  /* 自适应列数，卡片最大 300px */
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 300px));
  gap: 10px;
  align-content: start;
}

/* ===== 账号卡片 ===== */
.account-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  transition: box-shadow var(--duration-fast) var(--ease-out);
  /* 卡片宽度由 grid 控制，最大 300px */
  min-width: 0;
}
.account-card:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.07); }

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}
.platform-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  flex-shrink: 0;
}
.cat-tag {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 10px;
  font-weight: 500;
  flex-shrink: 0;
}
.icon-btn {
  color: var(--color-text-secondary) !important;
  padding: 0 2px !important;
  /* 消除 el-button + el-button 的默认 margin-left */
  margin-left: 0 !important;
}
/* header-left 内所有相邻 button 消除默认 margin */
.header-left :deep(.el-button + .el-button) { margin-left: 0; }

.card-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
/* card-actions 内按钮间距用 margin 控制，覆盖 EP 默认 12px */
.card-actions :deep(.el-button + .el-button) { margin-left: 0; }
.card-actions :deep(.el-button) { padding: 4px 4px; }

/* ===== 字段行：紧凑，不拉伸 ===== */
.card-fields {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.field-row {
  display: flex;
  align-items: center;
  font-size: 13px;
  line-height: 1.5;
}
/* field-row 内 button 之间消除默认 margin，紧跟内容 */
.field-row :deep(.el-button + .el-button) { margin-left: 0; }
.field-row :deep(.el-button) { margin-left: 0; padding: 0 3px; }

.field-label {
  width: 58px;
  flex-shrink: 0;
  color: var(--color-text-secondary);
  font-size: 12px;
}
.field-value {
  color: var(--color-text);
  margin-right: 2px;
  word-break: break-all;
}
.field-value.monospace { font-family: monospace; letter-spacing: 1px; }
.password-dots { letter-spacing: 2px; }
.note-text { color: var(--color-text-secondary); white-space: pre-wrap; }
.copy-btn { flex-shrink: 0; }

.btn-danger { color: var(--el-color-danger) !important; }
</style>
