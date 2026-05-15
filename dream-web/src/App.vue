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

/* ===== 全局弹窗移动端适配 ===== */
@media (max-width: 767px) {
  /* 弹窗全宽，贴底展示（sheet 风格） */
  .el-dialog {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    position: fixed !important;
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
    border-radius: 16px 16px 0 0 !important;
    max-height: 90dvh !important;
    display: flex !important;
    flex-direction: column !important;
  }

  /* 弹窗内容区可滚动 */
  .el-dialog .el-dialog__body {
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch;
    flex: 1;
    min-height: 0;
  }

  /* 遮罩居底对齐 */
  .el-overlay {
    align-items: flex-end !important;
  }

  /* 底部按钮区固定不滚动 */
  .el-dialog .el-dialog__footer {
    flex-shrink: 0;
    border-top: 1px solid var(--color-border);
    padding-bottom: max(12px, env(safe-area-inset-bottom));
  }
}
</style>
