<template>
  <div class="account-page">
    <van-nav-bar title="账号管理">
      <template #right>
        <van-icon v-if="store.isUnlocked" name="lock" size="20" @click="store.lock" />
      </template>
    </van-nav-bar>

    <!-- 未解锁 -->
    <div v-if="!store.isUnlocked" class="lock-screen">
      <van-icon name="lock" size="56" color="#0071e3" />
      <p class="lock-title">账号管理</p>
      <p class="lock-desc">请输入密钥以解锁</p>
      <van-cell-group inset style="width:100%">
        <van-field
          v-model="keyInput"
          type="password"
          placeholder="输入密钥（首次使用随意设置）"
          maxlength="64"
          @keyup.enter="doUnlock"
        />
      </van-cell-group>
      <van-button type="primary" block round @click="doUnlock" style="margin-top:8px">解锁</van-button>
      <van-button v-if="store.supportsBiometrics" plain round @click="doBiometricUnlock" style="margin-top:8px">
        使用指纹/面容解锁
      </van-button>
    </div>

    <!-- 已解锁 -->
    <template v-else>
      <!-- 分类横向导航 -->
      <div class="type-scroll">
        <div
          v-for="t in allTypes"
          :key="t.value"
          class="type-chip"
          :class="{ active: store.selectedType === t.value }"
          @click="store.selectType(t.value)"
        >
          {{ t.icon }} {{ t.label }}
        </div>
      </div>

      <!-- 账号列表 -->
      <div class="list-wrap">
        <van-loading v-if="store.loading" class="loading-center" />
        <van-empty v-else-if="store.filteredAccounts.length === 0" description="暂无账号，点击 + 添加" />

        <div v-else class="list-inner">
          <div
            v-for="acc in store.filteredAccounts"
            :key="acc.id"
            class="acc-card"
          >
            <div class="acc-header">
              <span class="acc-platform">{{ acc.platform }}</span>
              <div class="acc-header-right">
                <van-tag>{{ getTypeLabel(acc.type) }}</van-tag>
                <van-icon name="ellipsis" size="18" color="#aeaeb2" @click.stop="showAccountActions(acc)" />
              </div>
            </div>
            <van-cell-group>
              <van-cell v-if="acc.username" icon="contact" :value="acc.username" />
              <van-cell v-if="acc.email" icon="envelop-o" :value="acc.email" />
              <van-cell v-if="acc.phone" icon="phone-o" :value="acc.phone" />
              <van-cell v-if="acc.password_encrypted" icon="shield-o">
                <template #value>
                  <span>{{ showPwd[acc.id] ? decryptPwd(acc.password_encrypted) : '••••••••' }}</span>
                  <van-icon
                    :name="showPwd[acc.id] ? 'closed-eye' : 'eye-o'"
                    style="margin-left:8px;vertical-align:middle"
                    @click.stop="togglePwd(acc.id)"
                  />
                </template>
              </van-cell>
              <van-cell v-if="acc.url" icon="link-o" :value="acc.url" is-link :url="acc.url" />
              <van-cell v-if="acc.note" icon="notes-o" :value="acc.note" />
            </van-cell-group>
          </div>
        </div>
      </div>

      <div class="fab" @click="showAddDialog">
        <van-icon name="plus" color="#fff" size="24" />
      </div>
    </template>

    <!-- 新增弹窗 -->
    <BottomSheet :visible="sheetVisible" @close="closePopup">
      <div class="sheet-inner">
        <van-nav-bar title="新增账号" left-text="取消" right-text="保存" @click-left="closePopup" @click-right="submitAdd" />
        <div class="form-wrap">
          <van-cell-group inset>
            <van-field v-model="form.platform" label="平台 *" placeholder="如：GitHub、微信" maxlength="50" />
            <van-field v-model="form.username" label="账号" placeholder="用户名" maxlength="200" />
            <van-field v-model="form.email" label="邮箱" type="email" placeholder="邮箱" maxlength="200" />
            <van-field v-model="form.phone" label="手机" type="tel" placeholder="手机号" maxlength="20" />
            <van-field v-model="form.password" label="密码" type="password" placeholder="密码（将加密存储）" maxlength="500" />
            <van-field v-model="form.url" label="链接" placeholder="网站地址" maxlength="500" />
            <van-field v-model="form.note" label="备注" placeholder="备注" maxlength="500" />
          </van-cell-group>
          <div class="type-section">
            <span class="section-label">类型</span>
            <div class="type-selector">
              <div
                v-for="t in ACCOUNT_TYPES"
                :key="t.value"
                class="type-opt"
                :class="{ selected: form.type === t.value }"
                @click="form.type = t.value"
              >
                {{ t.icon }} {{ t.label }}
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
      :title="`操作「${actionAcc?.platform}」`"
      cancel-text="取消"
      @select="onActionSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { showToast, showFailToast } from 'vant'
import { useAccountStore, ACCOUNT_TYPES, type AccountType } from '../../stores/account'
import type { AccountItem } from '../../utils/db'
import BottomSheet from '../../components/BottomSheet.vue'

const store = useAccountStore()
const keyInput = ref('')
const showPwd = ref<Record<number, boolean>>({})
const sheetVisible = ref(false)
const actionSheetShow = ref(false)
const actionAcc = ref<AccountItem | null>(null)
const actionSheetActions = ref<Array<{ name: string; color?: string }>>([])

const allTypes = computed(() => [{ value: 'all' as const, label: '全部', icon: '📋' }, ...ACCOUNT_TYPES])

const form = ref({ platform: '', type: 'other' as AccountType, username: '', email: '', phone: '', password: '', url: '', note: '' })

onMounted(() => store.checkBiometrics())

async function doUnlock() {
  if (!keyInput.value) { showToast('请输入密钥'); return }
  const ok = await store.unlock(keyInput.value)
  if (!ok) showFailToast('密钥错误')
  else keyInput.value = ''
}

async function doBiometricUnlock() {
  if (!keyInput.value) { showToast('请先输入密钥，再使用生物识别'); return }
  const ok = await store.biometricUnlock(keyInput.value)
  if (!ok) showFailToast('生物识别失败')
  else keyInput.value = ''
}

function getTypeLabel(type: string) {
  return ACCOUNT_TYPES.find(t => t.value === type)?.label || type
}

function togglePwd(id: number) { showPwd.value[id] = !showPwd.value[id] }
function decryptPwd(encrypted: string) { return store.decryptPassword(encrypted) }

function showAccountActions(acc: AccountItem) {
  actionAcc.value = acc
  actionSheetActions.value = [
    { name: '复制账号' },
    { name: '复制密码' },
    { name: '删除', color: '#ff3b30' },
  ]
  actionSheetShow.value = true
}

async function onActionSelect(action: { name: string }) {
  const acc = actionAcc.value
  if (!acc) return
  actionSheetShow.value = false
  if (action.name === '复制账号') {
    await navigator.clipboard?.writeText(acc.username || acc.email || acc.phone)
    showToast('已复制账号')
  } else if (action.name === '复制密码') {
    const pwd = decryptPwd(acc.password_encrypted)
    if (pwd) { await navigator.clipboard?.writeText(pwd); showToast('已复制密码') }
    else showToast('无密码可复制')
  } else if (action.name === '删除') {
    store.removeAccount(acc.id)
    showToast('已删除')
  }
}

function showAddDialog() {
  form.value = { platform: '', type: 'other', username: '', email: '', phone: '', password: '', url: '', note: '' }
  sheetVisible.value = true
}
function closePopup() { sheetVisible.value = false }

async function submitAdd() {
  if (!form.value.platform.trim()) { showToast('请输入平台名称'); return }
  await store.addAccount({
    platform: form.value.platform.trim(), type: form.value.type,
    username: form.value.username.trim(), email: form.value.email.trim(),
    phone: form.value.phone.trim(), password_encrypted: form.value.password,
    url: form.value.url.trim(), note: form.value.note.trim(),
  })
  closePopup()
}
</script>

<style lang="scss" scoped>
.account-page { display: flex; flex-direction: column; height: 100%; background: $color-bg; }

.lock-screen { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px 24px; gap: 12px; }
.lock-title { font-size: $font-2xl; font-weight: $font-bold; color: $color-text-primary; margin: 0; }
.lock-desc { font-size: $font-md; color: $color-text-secondary; margin: 0; }

.type-scroll { display: flex; gap: 6px; padding: 8px 12px; overflow-x: auto; background: #fff; border-bottom: 1px solid $color-separator; flex-shrink: 0; scrollbar-width: none; &::-webkit-scrollbar { display: none; } }
.type-chip { padding: 5px 12px; border-radius: $radius-pill; border: 1px solid $color-border; white-space: nowrap; flex-shrink: 0; cursor: pointer; font-size: $font-sm; color: $color-text-secondary; &.active { background: #e8f3fc; border-color: $color-primary; color: $color-primary; } }

.list-wrap { flex: 1; overflow-y: auto; }
.loading-center { display: flex; justify-content: center; padding: 40px; }
.list-inner { padding: 8px 12px 80px; display: flex; flex-direction: column; gap: 10px; }

.acc-card { background: #fff; border-radius: $radius-lg; overflow: hidden; box-shadow: $shadow-sm; }
.acc-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px 8px; }
.acc-platform { font-size: $font-lg; font-weight: $font-bold; color: $color-text-primary; }
.acc-header-right { display: flex; align-items: center; gap: 8px; }

.fab { position: fixed; right: 20px; bottom: 80px; width: 50px; height: 50px; border-radius: 50%; background: $color-primary; display: flex; align-items: center; justify-content: center; box-shadow: $shadow-lg; cursor: pointer; }

.sheet-inner { max-height: 90vh; display: flex; flex-direction: column; }
.form-wrap { overflow-y: auto; padding: 12px 0 calc(env(safe-area-inset-bottom) + 12px); }
.type-section { padding: 12px 16px; }
.section-label { font-size: $font-sm; color: $color-text-secondary; display: block; margin-bottom: 8px; }
.type-selector { display: flex; flex-wrap: wrap; gap: 8px; }
.type-opt { padding: 6px 12px; border-radius: $radius-pill; background: $color-bg; font-size: $font-sm; color: $color-text-secondary; cursor: pointer; border: 1px solid $color-border; &.selected { background: #e8f3fc; border-color: $color-primary; color: $color-primary; } }
</style>
