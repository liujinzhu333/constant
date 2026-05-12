<template>
  <div class="app-container">
    <!-- macOS Electron 拖拽区域 -->
    <div class="titlebar" v-if="showTitlebar">
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
import { RouterView } from 'vue-router'
import UpdateBanner from './components/UpdateBanner.vue'
import { isElectron, isMac } from './utils/env'

// titlebar 仅在 Electron macOS 窗口内显示
const showTitlebar = isElectron && isMac
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
  height: 100dvh; /* 动态视口高度，移动端浏览器工具栏收缩时自动适配 */
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
