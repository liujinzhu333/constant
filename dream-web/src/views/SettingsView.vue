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

      <!-- ── Electron 专有区域 ── -->
      <template v-if="isElectron">
        <!-- 更新 -->
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
              <el-button v-if="updateStatus === 'downloaded'" type="success" @click="installUpdate">
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
            <div class="data-actions">
              <el-button type="primary" :loading="backingUp" @click="backup">备份数据</el-button>
              <el-button @click="openDataDir">打开目录</el-button>
              <el-button @click="importBackup" :loading="importing">导入备份</el-button>
            </div>
            <div class="backup-section">
              <div class="backup-header">
                <span class="backup-title">历史备份</span>
                <el-button link size="small" @click="loadBackups" :loading="backupLoading">刷新</el-button>
              </div>
              <el-empty v-if="backups.length === 0 && !backupLoading" description="暂无备份文件" :image-size="48" />
              <div v-else class="backup-list" v-loading="backupLoading">
                <div v-for="bk in backups" :key="bk.path" class="backup-item">
                  <div class="backup-item-info">
                    <span class="backup-name">{{ formatBackupName(bk.name) }}</span>
                    <span class="backup-meta">{{ formatSize(bk.size) }}</span>
                  </div>
                  <div class="backup-item-actions">
                    <el-button link size="small" @click="showInFolder(bk.path)">显示</el-button>
                    <el-button link size="small" type="primary" @click="restoreBackup(bk)">恢复</el-button>
                    <el-button link size="small" type="danger" @click="deleteBackup(bk)">删除</el-button>
                  </div>
                </div>
              </div>
            </div>
          </el-card>
        </section>

        <!-- Chrome 插件 / HTTP 服务 -->
        <section class="settings-section">
          <h2 class="section-title">Chrome 插件</h2>
          <el-card shadow="never">
            <el-descriptions :column="1" border>
              <el-descriptions-item label="服务状态">
                <el-tag :type="httpRunning ? 'success' : 'info'">
                  {{ httpRunning ? `运行中（端口 ${httpPort}）` : '已停止' }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="说明">
                <el-text size="small" type="info">
                  开启后 Chrome 插件可将网页收藏到当前运行的 Dream 实例
                </el-text>
              </el-descriptions-item>
            </el-descriptions>
            <div class="data-actions">
              <el-button v-if="!httpRunning" type="primary" :loading="httpToggling" @click="startHttpServer">启动服务</el-button>
              <el-button v-else type="danger" plain :loading="httpToggling" @click="stopHttpServer">停止服务</el-button>
            </div>
          </el-card>
        </section>

        <!-- 日志 -->
        <section class="settings-section">
          <h2 class="section-title">日志</h2>
          <el-card shadow="never">
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
                  <el-icon v-if="!f.isToday" class="log-delete-icon" @click.stop="deleteLogFile(f.name)"><Close /></el-icon>
                </el-tag>
                <el-text v-if="logFiles.length === 0" type="info" size="small">暂无日志文件</el-text>
              </div>
              <div class="log-actions">
                <el-button size="small" @click="refreshLogFiles()">刷新</el-button>
                <el-button size="small" @click="openLogDir">打开目录</el-button>
                <el-button size="small" type="danger" plain @click="clearAllLogs">清空历史</el-button>
              </div>
            </div>
            <div v-if="selectedLog" class="log-viewer-wrap">
              <div class="log-viewer-header">
                <el-text size="small" type="info">{{ selectedLog }}（末尾 {{ logLines.length }} 行 / 共 {{ logTotal }} 行）</el-text>
                <el-checkbox v-model="autoScroll" size="small">自动滚底</el-checkbox>
              </div>
              <div ref="logViewerRef" class="log-viewer" v-loading="logLoading">
                <div v-for="(line, i) in logLines" :key="i" class="log-line" :class="logLineClass(line)">{{ line }}</div>
                <el-empty v-if="!logLoading && logLines.length === 0" description="日志为空" :image-size="40" />
              </div>
            </div>
            <el-empty v-else description="选择左侧日志文件查看内容" :image-size="60" style="margin-top:12px" />
          </el-card>
        </section>
      </template>

      <!-- ── Web 环境：PC 服务连接 ── -->
      <template v-else>
        <section class="settings-section">
          <h2 class="section-title">PC 服务连接</h2>
          <el-card shadow="never">
            <el-descriptions :column="1" border style="margin-bottom:16px">
              <el-descriptions-item label="服务地址">
                <el-text class="path-text">{{ currentBase }}</el-text>
              </el-descriptions-item>
              <el-descriptions-item label="连接状态">
                <el-tag :type="pingStatus === 'ok' ? 'success' : pingStatus === 'checking' ? 'info' : 'danger'">
                  {{ pingStatusText }}
                </el-tag>
              </el-descriptions-item>
            </el-descriptions>
            <div class="server-input-row">
              <el-input v-model="customHost" placeholder="例：192.168.1.100:45678" style="max-width:260px" clearable />
              <el-button type="primary" :loading="pingStatus === 'checking'" @click="connectToServer">连接</el-button>
              <el-button @click="resetServerAddress">重置</el-button>
            </div>
            <el-text size="small" type="info" style="margin-top:8px;display:block">
              局域网内手机可通过 PC 的 IP 地址访问 Dream 数据，默认连接 localhost:45678。
            </el-text>
          </el-card>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Close } from '@element-plus/icons-vue'
import { isElectron, isMac } from '../utils/env'
import type { BackupInfo } from '../env'

// ── 关于 ──────────────────────────────────────────────────────────
const baseVersion = ref('1.0.0')
const platform = ref(isElectron ? '-' : 'Web（浏览器）')

// ── 更新 ──────────────────────────────────────────────────────────
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

// ── 数据备份 ──────────────────────────────────────────────────────
const dataPath = ref('-')
const backingUp = ref(false)
const importing = ref(false)
const backupLoading = ref(false)
const backups = ref<BackupInfo[]>([])

// ── HTTP 服务 ─────────────────────────────────────────────────────
const httpRunning = ref(false)
const httpPort = ref(45678)
const httpToggling = ref(false)

// ── 日志查看器 ────────────────────────────────────────────────────
const logDir = ref('-')
type LogFileInfo = { name: string; date: string; size: number; isToday: boolean }
const logFiles = ref<LogFileInfo[]>([])
const selectedLog = ref('')
const logLines = ref<string[]>([])
const logTotal = ref(0)
const logLoading = ref(false)
const autoScroll = ref(true)
const logViewerRef = ref<HTMLElement | null>(null)

// ── Web 连接设置 ──────────────────────────────────────────────────
const API_BASE_KEY = 'dream_api_base'
const DEFAULT_BASE = `${location.protocol}//${location.hostname}:45678`
const currentBase = ref(localStorage.getItem(API_BASE_KEY) || DEFAULT_BASE)
const customHost = ref('')
const pingStatus = ref<'idle' | 'checking' | 'ok' | 'error'>('idle')
const pingStatusText = computed(() => ({
  idle: '未检测', checking: '检测中...', ok: '已连接', error: '连接失败'
}[pingStatus.value]))

let removeStatusListener: (() => void) | null = null
let removeProgressListener: (() => void) | null = null

onMounted(async () => {
  if (isElectron) {
    const api = window.dreamAPI!
    const p = await api.app.getPlatform()
    platform.value = p === 'darwin' ? 'macOS' : 'Windows'
    dataPath.value = await api.app.getPath('userData')
    logDir.value = await api.log.getLogDir()
    const meta = await api.store.getMeta('base_version')
    if (meta) baseVersion.value = meta
    updateStatus.value = await api.updater.getStatus()
    await refreshLogFiles(true)
    await loadBackups()
    const httpStatus = await api.httpServer.status()
    httpRunning.value = httpStatus.running
    httpPort.value = httpStatus.port
    removeStatusListener = api.updater.onStatus(async (data) => {
      updateStatus.value = data.status
      if (data.status === 'downloaded') {
        try {
          await ElMessageBox.confirm('新版本已下载完成，立即重启并安装？', '安装更新',
            { confirmButtonText: '立即安装', cancelButtonText: '稍后', type: 'success' })
          await api.updater.install()
        } catch { /* 用户取消 */ }
      }
    })
    removeProgressListener = api.updater.onProgress((data) => { updateProgress.value = data.percent })
  } else {
    checkCurrentPing()
  }
})

onUnmounted(() => {
  removeStatusListener?.()
  removeProgressListener?.()
})

// ── Electron：更新 ────────────────────────────────────────────────
async function checkUpdate() {
  const api = window.dreamAPI; if (!api || isChecking.value) return
  isChecking.value = true
  try {
    const result = await api.updater.check()
    if (result.hasUpdate) {
      await ElMessageBox.confirm(`发现新版本 v${result.version}，是否立即下载？`, '发现新版本',
        { confirmButtonText: '立即下载', cancelButtonText: '稍后', type: 'info' })
      await api.updater.download()
      ElMessage.info('正在后台下载更新，完成后将提示安装')
    } else {
      ElMessage.success('当前已是最新版本')
    }
  } catch { /* 用户取消 */ } finally { isChecking.value = false }
}

async function installUpdate() {
  const api = window.dreamAPI; if (!api) return
  try {
    await ElMessageBox.confirm('应用将重启并安装新版本，确定继续？', '安装更新',
      { confirmButtonText: '立即安装', cancelButtonText: '取消', type: 'success' })
    await api.updater.install()
  } catch { /* 用户取消 */ }
}

async function rollback() {
  const api = window.dreamAPI; if (!api) return
  await ElMessageBox.confirm('确定要回滚到上一个版本吗？', '回滚确认',
    { confirmButtonText: '确定回滚', cancelButtonText: '取消', type: 'warning' })
  const success = await api.updater.rollback()
  ElMessage[success ? 'success' : 'error'](success ? '回滚成功，请重启应用' : '回滚失败，没有可回滚的版本')
}

// ── Electron：数据备份 ────────────────────────────────────────────
async function backup() {
  const api = window.dreamAPI; if (!api || backingUp.value) return
  backingUp.value = true
  try {
    const result = await api.store.backup()
    if (result.success && result.path) {
      await loadBackups()
      try {
        await ElMessageBox({
          title: '备份成功',
          message: `<div style="font-size:13px;line-height:1.8;"><div style="margin-bottom:8px;color:var(--el-text-color-secondary);">备份文件已保存至：</div><div style="font-family:'SF Mono',monospace;font-size:11px;background:var(--el-fill-color-light);border-radius:4px;padding:8px 10px;word-break:break-all;">${result.path}</div></div>`,
          dangerouslyUseHTMLString: true,
          showCancelButton: true,
          confirmButtonText: '在 Finder 中显示',
          cancelButtonText: '关闭',
          type: 'success',
        })
        await api.app.showInFolder(result.path)
      } catch { /* 用户关闭 */ }
    } else {
      ElMessage.error(`备份失败: ${result.error}`)
    }
  } finally { backingUp.value = false }
}

async function openDataDir() { await window.dreamAPI?.app.showInFolder(dataPath.value) }
async function showInFolder(filePath: string) { await window.dreamAPI?.app.showInFolder(filePath) }

async function loadBackups() {
  const api = window.dreamAPI; if (!api) return
  backupLoading.value = true
  try {
    const result = await api.store.listBackups()
    if (result.success) backups.value = result.backups
  } finally { backupLoading.value = false }
}

async function restoreBackup(bk: BackupInfo) {
  const api = window.dreamAPI; if (!api) return
  try {
    await ElMessageBox.confirm(
      `确定要恢复到备份「${formatBackupName(bk.name)}」吗？\n\n当前数据库将被覆盖，操作前会自动生成一份安全备份。`,
      '恢复备份', { confirmButtonText: '确定恢复', cancelButtonText: '取消', type: 'warning' })
    const result = await api.store.restoreBackup(bk.path)
    if (result.success) {
      await loadBackups()
      await ElMessageBox.alert('数据已恢复成功。建议重启应用以确保所有模块状态同步。', '恢复成功',
        { confirmButtonText: '稍后重启', type: 'success' })
    } else { ElMessage.error(`恢复失败: ${result.error}`) }
  } catch { /* 用户取消 */ }
}

async function importBackup() {
  const api = window.dreamAPI; if (!api || importing.value) return
  importing.value = true
  try {
    const result = await api.store.importBackup()
    if (result.canceled) return
    if (result.success) {
      await loadBackups()
      await ElMessageBox.alert('外部备份文件已导入成功。建议重启应用以确保所有模块状态同步。', '导入成功',
        { confirmButtonText: '稍后重启', type: 'success' })
    } else { ElMessage.error(`导入失败: ${result.error}`) }
  } finally { importing.value = false }
}

async function deleteBackup(bk: BackupInfo) {
  const api = window.dreamAPI; if (!api) return
  try {
    await ElMessageBox.confirm(`确定删除备份「${formatBackupName(bk.name)}」？此操作不可撤销。`, '删除备份',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
    const result = await api.store.deleteBackup(bk.path)
    if (result.success) { backups.value = backups.value.filter(b => b.path !== bk.path); ElMessage.success('已删除') }
    else { ElMessage.error(`删除失败: ${result.error}`) }
  } catch { /* 用户取消 */ }
}

// ── Electron：HTTP 服务 ───────────────────────────────────────────
async function startHttpServer() {
  const api = window.dreamAPI; if (!api) return
  httpToggling.value = true
  try {
    const result = await api.httpServer.start()
    if (result.success) { httpRunning.value = true; httpPort.value = result.port ?? 45678; ElMessage.success(`HTTP 服务已启动（端口 ${httpPort.value}）`) }
    else { ElMessage.error(result.error ?? '启动失败') }
  } finally { httpToggling.value = false }
}

async function stopHttpServer() {
  const api = window.dreamAPI; if (!api) return
  httpToggling.value = true
  try {
    const result = await api.httpServer.stop()
    if (result.success) { httpRunning.value = false; ElMessage.success('HTTP 服务已停止') }
    else { ElMessage.error(result.error ?? '停止失败') }
  } finally { httpToggling.value = false }
}

// ── Electron：日志查看器 ──────────────────────────────────────────
async function refreshLogFiles(autoSelectToday = false) {
  const api = window.dreamAPI; if (!api) return
  logFiles.value = await api.log.getFiles()
  if (autoSelectToday && logFiles.value.length > 0) {
    const today = logFiles.value.find(f => f.isToday) ?? logFiles.value[0]
    await selectLogFile(today.name)
  }
}

async function selectLogFile(filename: string) {
  const api = window.dreamAPI; if (!api) return
  selectedLog.value = filename
  logLoading.value = true
  try {
    const result = await api.log.readFile(filename, 500)
    logLines.value = result.lines
    logTotal.value = result.total
    if (autoScroll.value) { await nextTick(); scrollToBottom() }
  } finally { logLoading.value = false }
}

function scrollToBottom() {
  if (logViewerRef.value) logViewerRef.value.scrollTop = logViewerRef.value.scrollHeight
}

watch(logLines, async () => {
  if (autoScroll.value) { await nextTick(); scrollToBottom() }
})

async function openLogDir() { await window.dreamAPI?.app.showInFolder(logDir.value) }

async function deleteLogFile(filename: string) {
  const api = window.dreamAPI; if (!api) return
  try {
    await ElMessageBox.confirm(`确定删除日志文件 ${filename} 吗？`, '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
    const result = await api.log.deleteFile(filename)
    if (result.success) {
      ElMessage.success('已删除')
      if (selectedLog.value === filename) { selectedLog.value = ''; logLines.value = []; logTotal.value = 0 }
      await refreshLogFiles()
    } else { ElMessage.error(result.error ?? '删除失败') }
  } catch { /* 用户取消 */ }
}

async function clearAllLogs() {
  const api = window.dreamAPI; if (!api) return
  try {
    await ElMessageBox.confirm('确定清空所有历史日志吗？（今天的日志将保留）', '清空确认',
      { confirmButtonText: '清空', cancelButtonText: '取消', type: 'warning' })
    const result = await api.log.clearAll()
    if (result.success) {
      ElMessage.success(`已清空 ${result.deleted} 个历史日志文件`)
      const files = await api.log.getFiles()
      logFiles.value = files
      if (selectedLog.value && !files.find(f => f.name === selectedLog.value)) {
        const today = files.find(f => f.isToday) ?? files[0]
        if (today) await selectLogFile(today.name)
        else { selectedLog.value = ''; logLines.value = []; logTotal.value = 0 }
      }
    } else { ElMessage.error(result.error ?? '清空失败') }
  } catch { /* 用户取消 */ }
}

// ── Web：服务连接 ─────────────────────────────────────────────────
async function connectToServer() {
  let base = customHost.value.trim()
  if (!base) { ElMessage.warning('请输入服务地址'); return }
  if (!/^https?:\/\//.test(base)) base = `http://${base}`
  base = base.replace(/\/$/, '')
  pingStatus.value = 'checking'
  try {
    const res = await fetch(`${base}/ping`, { signal: AbortSignal.timeout(4000) })
    if (res.ok) {
      currentBase.value = base
      localStorage.setItem(API_BASE_KEY, base)
      pingStatus.value = 'ok'
      ElMessage.success(`已连接到 ${base}，刷新页面后生效`)
    } else { pingStatus.value = 'error'; ElMessage.error(`服务响应异常（${res.status}）`) }
  } catch { pingStatus.value = 'error'; ElMessage.error('无法连接，请检查 PC 端是否已启动') }
}

function resetServerAddress() {
  localStorage.removeItem(API_BASE_KEY)
  currentBase.value = DEFAULT_BASE
  customHost.value = ''
  pingStatus.value = 'idle'
  ElMessage.info('已重置为默认地址，刷新页面后生效')
}

async function checkCurrentPing() {
  pingStatus.value = 'checking'
  try {
    const res = await fetch(`${currentBase.value}/ping`, { signal: AbortSignal.timeout(3000) })
    pingStatus.value = res.ok ? 'ok' : 'error'
  } catch { pingStatus.value = 'error' }
}

// ── 工具函数 ──────────────────────────────────────────────────────
function formatBackupName(name: string): string {
  const m = name.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`
  return name.replace(/^dream-backup-/, '').replace(/\.db$/, '')
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

function logLineClass(line: string): string {
  if (line.includes('[error]') || line.includes('[ERROR]')) return 'log-error'
  if (line.includes('[warn]')  || line.includes('[WARN]'))  return 'log-warn'
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

.path-text { font-family: 'SF Mono','Fira Code',monospace; font-size: 11px; word-break: break-all; }

.data-actions { margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap; }
.data-actions :deep(.el-button + .el-button) { margin-left: 0; }

.backup-section { margin-top: 20px; }
.backup-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.backup-title { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
.backup-list { display: flex; flex-direction: column; gap: 4px; }
.backup-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-radius: var(--radius-sm); background: var(--el-fill-color-light); transition: background var(--duration-fast); }
.backup-item:hover { background: var(--el-fill-color); }
.backup-item-info { display: flex; align-items: center; gap: 10px; min-width: 0; }
.backup-name { font-size: 13px; color: var(--color-text); font-family: 'SF Mono','Fira Code',monospace; }
.backup-meta { font-size: 11px; color: var(--color-text-secondary); flex-shrink: 0; }
.backup-item-actions { display: flex; align-items: center; flex-shrink: 0; }
.backup-item-actions :deep(.el-button + .el-button) { margin-left: 0; }
.backup-item-actions :deep(.el-button) { padding: 0 6px; font-size: 12px; }

.log-toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.log-file-tabs { display: flex; flex-wrap: wrap; gap: 6px; flex: 1; }
.log-file-tag { cursor: pointer; display: inline-flex; align-items: center; gap: 4px; user-select: none; }
.log-size { font-size: 10px; opacity: 0.7; margin-left: 2px; }
.log-delete-icon { font-size: 10px; margin-left: 2px; opacity: 0.6; transition: opacity 150ms; }
.log-delete-icon:hover { opacity: 1; color: var(--el-color-danger); }
.log-actions { display: flex; gap: 6px; flex-shrink: 0; }
.log-viewer-wrap { margin-top: 12px; }
.log-viewer-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.log-viewer {
  height: 340px; overflow-y: auto;
  background: #1a1a1a; border-radius: var(--radius-sm);
  padding: 10px 12px;
  font-family: 'SF Mono','Fira Code','Menlo',monospace;
  font-size: 11.5px; line-height: 1.7;
}
.log-line { white-space: pre-wrap; word-break: break-all; }
.log-error { color: #ff6b6b; }
.log-warn  { color: #ffd43b; }
.log-debug { color: #74c0fc; }
.log-info  { color: #c9d1d9; }

.server-input-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.server-input-row :deep(.el-button + .el-button) { margin-left: 0; }
</style>
