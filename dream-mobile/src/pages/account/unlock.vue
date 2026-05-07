<template>
  <div class="unlock-page">
    <van-nav-bar title="解锁账号" left-arrow @click-left="router.back()" />
    <div class="unlock-body">
      <van-icon name="lock" size="56" color="#0071e3" />
      <p class="lock-title">账号管理</p>
      <p class="lock-desc">请输入密钥以解锁</p>
      <van-cell-group inset style="width:100%">
        <van-field v-model="keyInput" type="password" placeholder="输入密钥" maxlength="64" @keyup.enter="doUnlock" />
      </van-cell-group>
      <van-button type="primary" block round @click="doUnlock" style="margin-top:12px">解锁</van-button>
      <van-button v-if="store.supportsBiometrics" plain round @click="doBiometricUnlock" style="margin-top:8px">
        使用指纹/面容解锁
      </van-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useAccountStore } from '../../stores/account'

const store = useAccountStore()
const router = useRouter()
const keyInput = ref('')

onMounted(() => store.checkBiometrics())

async function doUnlock() {
  if (!keyInput.value) { showToast('请输入密钥'); return }
  const ok = await store.unlock(keyInput.value)
  if (!ok) showToast({ message: '密钥错误', type: 'fail' })
  else router.back()
}

async function doBiometricUnlock() {
  if (!keyInput.value) { showToast('请先输入密钥，再使用生物识别'); return }
  const ok = await store.biometricUnlock(keyInput.value)
  if (!ok) showToast({ message: '生物识别失败', type: 'fail' })
  else router.back()
}
</script>

<style lang="scss" scoped>
.unlock-page { display: flex; flex-direction: column; height: 100%; background: $color-bg; }
.unlock-body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px 24px; gap: 12px; }
.lock-title { font-size: $font-2xl; font-weight: $font-bold; color: $color-text-primary; margin: 0; }
.lock-desc { font-size: $font-md; color: $color-text-secondary; margin: 0; }
</style>
