<template>
  <div class="app-container">
    <!-- macOS 拖拽区域 -->
    <div class="titlebar" v-if="isMac">
      <div class="titlebar-drag" />
      <span class="titlebar-title">Dream</span>
    </div>

    <!-- 主内容区 -->
    <RouterView />

    <!-- 全局更新提示 -->
    <UpdateBanner />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterView } from 'vue-router'
import UpdateBanner from './components/UpdateBanner.vue'

const isMac = ref(false)

onMounted(async () => {
  const platform = await window.dreamAPI?.app.getPlatform()
  isMac.value = platform === 'darwin'
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--color-bg);
  color: var(--color-text);
}

.titlebar {
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
}

.titlebar-drag {
  position: absolute;
  inset: 0;
  -webkit-app-region: drag;
}

.titlebar-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-muted);
  letter-spacing: 0.5px;
  -webkit-app-region: no-drag;
  pointer-events: none;
}
</style>
