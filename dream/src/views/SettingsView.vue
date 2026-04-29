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
          <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
            <el-button type="primary" @click="checkUpdate" :loading="isChecking">
              {{ isChecking ? '检测中...' : '检查更新' }}
            </el-button>
            <el-button
              v-if="updateStatus === 'downloaded'"
              type="success"
              @click="installUpdate"
            >
              立即安装
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
          <!-- 文件列表 + 操作栏 -->
          <div class="log-toolbar">
            <div class="log-file-tabs">
              <el-tag
                v-for="f in logFiles" :key="f.name"
                :type="selectedLog === f.name ? '' : 'info'"
                :effect="selectedLog === f.name ? 'dark' : 'plain'"
                class="log-file-tag"
                @click="selectLogFile(f.name)"
              >
                {{ f.date }}
                <span class="log-size">{{ formatSize(f.size) }}</span>
                <el-icon
                  v-if="!f.isToday"
                  class="log-delete-icon"
                  @click.stop="deleteLogFile(f.name)"
                ><Close /></el-icon>
              </el-tag>
              <el-text v-if="logFiles.length === 0" type="info" size="small">暂无日志文件</el-text>
            </div>
            <div class="log-actions">
              <el-button size="small" @click="refreshLogFiles">刷新</el-button>
              <el-button size="small" @click="openLogDir">打开目录</el-button>
              <el-button size="small" type="danger" plain @click="clearAllLogs">清空历史</el-button>
            </div>
          </div>

          <!-- 日志内容查看器 -->
          <div v-if="selectedLog" class="log-viewer-wrap">
            <div class="log-viewer-header">
              <el-text size="small" type="info">{{ selectedLog }}（末尾 {{ logLines.length }} 行 / 共 {{ logTotal }} 行）</el-text>
              <el-checkbox v-model="autoScroll" size="small">自动滚底</el-checkbox>
            </div>
            <div
              ref="logViewerRef"
              class="log-viewer"
              v-loading="logLoading"
            >
              <div
                v-for="(line, i) in logLines" :key="i"
                class="log-line"
                :class="logLineClass(line)"
              >{{ line }}</div>
              <el-empty v-if="!logLoading && logLines.length === 0" description="日志为空" :image-size="40" />
            </div>
          </div>
          <el-empty v-else description="选择左侧日志文件查看内容" :image-size="60" style="margin-top:12px" />
        </el-card>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Close } from '@element-plus/icons-vue'

const baseVersion = ref('1.0.0')
const platform = ref('-')
const dataPath = ref('-')
const logDir = ref('-')
const updateStatus = ref('not-available')
const updateProgress = ref(0)
const isChecking = ref(false)

// 日志查看器
type LogFileInfo = { name: string; date: string; size: number; isToday: boolean }
const logFiles = ref<LogFileInfo[]>([])
const selectedLog = ref('')
const logLines = ref<string[]>([])
const logTotal = ref(0)
const logLoading = ref(false)
const autoScroll = ref(true)
const logViewerRef = ref<HTMLElement | null>(null)

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
  // 加载日志文件列表，默认打开今天的日志
  await refreshLogFiles(true)
  removeStatusListener = api.updater.onStatus(async (data) => {
    updateStatus.value = data.status
    // 下载完成后弹出安装确认
    if (data.status === 'downloaded') {
      try {
        await ElMessageBox.confirm(
          '新版本已下载完成，立即重启并安装？',
          '安装更新',
          { confirmButtonText: '立即安装', cancelButtonText: '稍后', type: 'success' }
        )
        await api.updater.install()
      } catch {
        // 用户选择稍后
      }
    }
  })
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
      await ElMessageBox.confirm(
        `发现新版本 v${result.version}，是否立即下载？下载完成后将提示安装。`,
        '发现新版本',
        { confirmButtonText: '立即下载', cancelButtonText: '稍后', type: 'info' }
      )
      // 触发下载，下载完成由 onStatus 监听器自动弹出安装确认
      await api.updater.download()
      ElMessage.info('正在后台下载更新，完成后将提示安装')
    } else {
      ElMessage.success('当前已是最新版本')
    }
  } catch {
    // 用户取消
  } finally {
    isChecking.value = false
  }
}

async function installUpdate() {
  const api = window.dreamAPI
  if (!api) return
  try {
    await ElMessageBox.confirm('应用将重启并安装新版本，确定继续？', '安装更新', {
      confirmButtonText: '立即安装', cancelButtonText: '取消', type: 'success'
    })
    await api.updater.install()
  } catch {
    // 用户取消
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

// ==================== 日志查看器 ====================

async function refreshLogFiles(autoSelectToday = false) {
  const api = window.dreamAPI
  if (!api) return
  logFiles.value = await api.log.getFiles()
  if (autoSelectToday && logFiles.value.length > 0) {
    // 默认打开今天的日志，没有今天则打开最新的
    const today = logFiles.value.find(f => f.isToday) ?? logFiles.value[0]
    await selectLogFile(today.name)
  }
}

async function selectLogFile(filename: string) {
  const api = window.dreamAPI
  if (!api) return
  selectedLog.value = filename
  logLoading.value = true
  try {
    const result = await api.log.readFile(filename, 500)
    logLines.value = result.lines
    logTotal.value = result.total
    if (autoScroll.value) {
      await nextTick()
      scrollToBottom()
    }
  } finally {
    logLoading.value = false
  }
}

function scrollToBottom() {
  if (logViewerRef.value) {
    logViewerRef.value.scrollTop = logViewerRef.value.scrollHeight
  }
}

// autoScroll 开启时，内容更新后自动滚底
watch(logLines, async () => {
  if (autoScroll.value) {
    await nextTick()
    scrollToBottom()
  }
})

async function deleteLogFile(filename: string) {
  const api = window.dreamAPI
  if (!api) return
  try {
    await ElMessageBox.confirm(`确定删除日志文件 ${filename} 吗？`, '删除确认', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning'
    })
    const result = await api.log.deleteFile(filename)
    if (result.success) {
      ElMessage.success('已删除')
      if (selectedLog.value === filename) {
        selectedLog.value = ''
        logLines.value = []
        logTotal.value = 0
      }
      await refreshLogFiles()
    } else {
      ElMessage.error(result.error ?? '删除失败')
    }
  } catch {
    // 用户取消
  }
}

async function clearAllLogs() {
  const api = window.dreamAPI
  if (!api) return
  try {
    await ElMessageBox.confirm('确定清空所有历史日志吗？（今天的日志将保留）', '清空确认', {
      confirmButtonText: '清空', cancelButtonText: '取消', type: 'warning'
    })
    const result = await api.log.clearAll()
    if (result.success) {
      ElMessage.success(`已清空 ${result.deleted} 个历史日志文件`)
      // 如果当前选中的已被清理，切换到今天
      const files = await api.log.getFiles()
      logFiles.value = files
      if (selectedLog.value && !files.find(f => f.name === selectedLog.value)) {
        const today = files.find(f => f.isToday) ?? files[0]
        if (today) await selectLogFile(today.name)
        else { selectedLog.value = ''; logLines.value = []; logTotal.value = 0 }
      }
    } else {
      ElMessage.error(result.error ?? '清空失败')
    }
  } catch {
    // 用户取消
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

function logLineClass(line: string): string {
  if (line.includes('[error]') || line.includes('[ERROR]')) return 'log-error'
  if (line.includes('[warn]') || line.includes('[WARN]')) return 'log-warn'
  if (line.includes('[debug]') || line.includes('[DEBUG]')) return 'log-debug'
  return 'log-info'
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

/* 日志查看器 */
.log-toolbar {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 12px; flex-wrap: wrap;
}
.log-file-tabs {
  display: flex; flex-wrap: wrap; gap: 6px; flex: 1;
}
.log-file-tag {
  cursor: pointer; display: inline-flex; align-items: center; gap: 4px;
  user-select: none;
}
.log-size { font-size: 10px; opacity: 0.7; margin-left: 2px; }
.log-delete-icon {
  font-size: 10px; margin-left: 2px; opacity: 0.6;
  transition: opacity 150ms;
}
.log-delete-icon:hover { opacity: 1; color: var(--el-color-danger); }
.log-actions { display: flex; gap: 6px; flex-shrink: 0; }

.log-viewer-wrap { margin-top: 12px; }
.log-viewer-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 6px;
}
.log-viewer {
  height: 340px; overflow-y: auto;
  background: #1a1a1a; border-radius: var(--radius-sm);
  padding: 10px 12px;
  font-family: 'SF Mono', 'Fira Code', 'Menlo', monospace;
  font-size: 11.5px; line-height: 1.7;
}
.log-line { white-space: pre-wrap; word-break: break-all; }
.log-error { color: #ff6b6b; }
.log-warn  { color: #ffd43b; }
.log-debug { color: #74c0fc; }
.log-info  { color: #c9d1d9; }
</style>
