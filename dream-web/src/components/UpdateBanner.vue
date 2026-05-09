<template>
  <Transition name="slide-up">
    <div v-if="showBanner" class="update-banner">
      <div class="banner-content">
        <span class="banner-icon">🚀</span>
        <span class="banner-text">
          <template v-if="status === 'available'">
            发现新版本 <strong>{{ version }}</strong>，点击下载
          </template>
          <template v-else-if="status === 'downloading'">
            正在下载更新... {{ progress.toFixed(0) }}%
          </template>
          <template v-else-if="status === 'downloaded'">
            更新已就绪，点击安装并重启
          </template>
        </span>
        <div class="banner-actions">
          <button
            v-if="status === 'available'"
            class="btn btn-primary btn-sm"
            @click="downloadUpdate"
          >下载</button>
          <button
            v-if="status === 'downloaded'"
            class="btn btn-primary btn-sm"
            @click="installUpdate"
          >安装重启</button>
          <button class="btn btn-ghost btn-sm" @click="dismiss">稍后</button>
        </div>
      </div>
      <div v-if="status === 'downloading'" class="banner-progress">
        <div class="progress-fill" :style="{ width: progress + '%' }" />
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const showBanner = ref(false)
const status = ref('')
const version = ref('')
const progress = ref(0)

let removeStatus: (() => void) | null = null
let removeProgress: (() => void) | null = null

onMounted(() => {
  const api = window.dreamAPI
  if (!api) return

  removeStatus = api.updater.onStatus((data) => {
    status.value = data.status
    if (['available', 'downloading', 'downloaded'].includes(data.status)) {
      showBanner.value = true
      if (data.status === 'available' && data.info && typeof data.info === 'object') {
        version.value = (data.info as { version: string }).version ?? ''
      }
    }
  })

  removeProgress = api.updater.onProgress((data) => {
    progress.value = data.percent
  })
})

onUnmounted(() => {
  removeStatus?.()
  removeProgress?.()
})

async function downloadUpdate() {
  await window.dreamAPI?.updater.download()
}

async function installUpdate() {
  await window.dreamAPI?.updater.install()
}

function dismiss() {
  showBanner.value = false
}
</script>

<style scoped>
.update-banner {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 48px);
  max-width: 560px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  z-index: 1000;
}

.banner-content {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
}

.banner-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.banner-text {
  flex: 1;
  font-size: 14px;
  color: var(--color-text);
}

.banner-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
}

.banner-progress {
  height: 3px;
  background: var(--color-border);
}

.progress-fill {
  height: 100%;
  background: var(--color-accent);
  transition: width 0.3s ease;
}

/* 动画 */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s var(--ease-out);
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}
</style>
