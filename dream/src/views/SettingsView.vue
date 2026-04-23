<template>
  <div class="settings-page">
    <div class="settings-header">
      <RouterLink to="/" class="back-btn">
        <el-button link type="primary">← 返回</el-button>
      </RouterLink>
      <h1>设置</h1>
    </div>

    <div class="settings-content">
      <!-- 关于 -->
      <section class="settings-section">
        <h2 class="section-title">关于</h2>
        <el-card shadow="never">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="应用名称">Dream 个人助手</el-descriptions-item>
            <el-descriptions-item label="基座版本">v{{ baseVersion }}</el-descriptions-item>
            <el-descriptions-item label="运行平台">{{ platform }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </section>

      <!-- 热更新 -->
      <section class="settings-section">
        <h2 class="section-title">更新</h2>
        <el-card shadow="never">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="更新状态">
              <el-tag :type="statusTagType">{{ statusText }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item v-if="updateProgress > 0" label="下载进度">
              <el-progress :percentage="Number(updateProgress.toFixed(0))" style="width:200px" />
            </el-descriptions-item>
          </el-descriptions>
          <div style="margin-top:16px;display:flex;gap:10px">
            <el-button type="primary" @click="checkUpdate" :loading="isChecking">
              {{ isChecking ? '检测中...' : '检查更新' }}
            </el-button>
            <el-button @click="rollback">回滚版本</el-button>
          </div>
        </el-card>
      </section>

      <!-- 数据 -->
      <section class="settings-section">
        <h2 class="section-title">数据</h2>
        <el-card shadow="never">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="数据目录">
              <el-text class="path-text">{{ dataPath }}</el-text>
            </el-descriptions-item>
          </el-descriptions>
          <div style="margin-top:16px;display:flex;gap:10px">
            <el-button type="primary" @click="backup">备份数据</el-button>
            <el-button @click="openDataDir">打开目录</el-button>
          </div>
        </el-card>
      </section>

      <!-- 日志 -->
      <section class="settings-section">
        <h2 class="section-title">日志</h2>
        <el-card shadow="never">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="日志目录">
              <el-text class="path-text">{{ logDir }}</el-text>
            </el-descriptions-item>
          </el-descriptions>
          <div style="margin-top:16px">
            <el-button @click="openLogDir">查看日志</el-button>
          </div>
        </el-card>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

const baseVersion = ref('1.0.0')
const platform = ref('-')
const dataPath = ref('-')
const logDir = ref('-')
const updateStatus = ref('not-available')
const updateProgress = ref(0)
const isChecking = ref(false)

const statusText = computed(() => {
  const map: Record<string, string> = {
    checking: '检测中', available: '有新版本', 'not-available': '已是最新',
    downloading: '下载中', downloaded: '已下载', error: '出错', rollback: '已回滚'
  }
  return map[updateStatus.value] || '未知'
})

const statusTagType = computed(() => {
  if (updateStatus.value === 'not-available') return 'success'
  if (['available', 'downloaded'].includes(updateStatus.value)) return 'warning'
  if (updateStatus.value === 'error') return 'danger'
  return 'info'
})

let removeStatusListener: (() => void) | null = null
let removeProgressListener: (() => void) | null = null

onMounted(async () => {
  const api = window.dreamAPI
  if (!api) return
  const p = await api.app.getPlatform()
  platform.value = p === 'darwin' ? 'macOS' : 'Windows'
  dataPath.value = await api.app.getPath('userData')
  logDir.value = await api.log.getLogDir()
  const meta = await api.store.getMeta('base_version')
  if (meta) baseVersion.value = meta
  updateStatus.value = await api.updater.getStatus()
  removeStatusListener = api.updater.onStatus((data) => { updateStatus.value = data.status })
  removeProgressListener = api.updater.onProgress((data) => { updateProgress.value = data.percent })
})

onUnmounted(() => {
  removeStatusListener?.()
  removeProgressListener?.()
})

async function checkUpdate() {
  const api = window.dreamAPI
  if (!api || isChecking.value) return
  isChecking.value = true
  try {
    const result = await api.updater.check()
    if (result.hasUpdate) {
      await ElMessageBox.confirm(`发现新版本 v${result.version}，是否立即下载？`, '发现新版本', {
        confirmButtonText: '立即下载', cancelButtonText: '稍后', type: 'info'
      })
      await api.updater.download()
    } else {
      ElMessage.success('当前已是最新版本')
    }
  } catch {
    // 用户取消
  } finally {
    isChecking.value = false
  }
}

async function rollback() {
  const api = window.dreamAPI
  if (!api) return
  await ElMessageBox.confirm('确定要回滚到上一个版本吗？', '回滚确认', {
    confirmButtonText: '确定回滚', cancelButtonText: '取消', type: 'warning'
  })
  const success = await api.updater.rollback()
  if (success) {
    ElMessage.success('回滚成功，请重启应用')
  } else {
    ElMessage.error('回滚失败，没有可回滚的版本')
  }
}

async function backup() {
  const api = window.dreamAPI
  if (!api) return
  const result = await api.store.backup()
  if (result.success) {
    ElMessage.success(`备份成功！路径: ${result.path}`)
  } else {
    ElMessage.error(`备份失败: ${result.error}`)
  }
}

async function openDataDir() {
  await window.dreamAPI?.app.openExternal(`file://${dataPath.value}`)
}

async function openLogDir() {
  await window.dreamAPI?.app.openExternal(`file://${logDir.value}`)
}
</script>

<style scoped>
.settings-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.settings-header {
  display: flex; align-items: center; gap: 16px;
  padding: 16px 24px; border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-card); flex-shrink: 0;
}
.settings-header h1 { font-size: 18px; font-weight: 600; color: var(--color-text); }

.settings-content {
  flex: 1; overflow-y: auto; padding: 24px;
  display: flex; flex-direction: column; gap: 24px; max-width: 640px;
}

.section-title {
  font-size: 12px; font-weight: 600; color: var(--color-text-muted);
  text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px;
}

.path-text {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 11px; word-break: break-all;
}
</style>
