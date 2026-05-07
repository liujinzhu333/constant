<template>
  <div class="settings-page">
    <van-nav-bar title="更多" />
    <div class="scroll-wrap">
      <!-- 功能快捷入口 -->
      <van-cell-group title="功能" inset>
        <van-cell
          v-for="nav in navItems"
          :key="nav.page"
          :title="nav.label"
          :icon="nav.icon"
          is-link
          clickable
          @click="goPage(nav.page)"
        />
      </van-cell-group>

      <!-- 更新 -->
      <van-cell-group title="更新" inset>
        <van-cell title="Wi-Fi 优先更新">
          <template #right-icon>
            <van-switch v-model="wifiOnly" size="22" @update:model-value="onWifiOnlyChange" />
          </template>
        </van-cell>
        <van-cell title="检查更新" is-link clickable @click="checkUpdate">
          <template #value>
            <span v-if="updateStatus.checking" style="color:#8e8e93">检测中...</span>
            <span v-else-if="updateStatus.hasUpdate" style="color:#0071e3">发现新版本</span>
            <span v-else style="color:#aeaeb2">已是最新</span>
          </template>
        </van-cell>
        <template v-if="updateStatus.hasUpdate && updateStatus.info">
          <van-cell>
            <template #title>
              <div class="update-info">
                <p class="update-version">版本 {{ updateStatus.info.version }}</p>
                <p class="update-log">{{ updateStatus.info.changelog }}</p>
                <van-button
                  type="primary"
                  size="small"
                  block
                  :loading="updateStatus.downloading"
                  :loading-text="`下载中 ${updateStatus.progress}%`"
                  @click="doUpdate"
                >立即更新</van-button>
              </div>
            </template>
          </van-cell>
        </template>
      </van-cell-group>

      <!-- 数据 -->
      <van-cell-group title="数据" inset>
        <van-cell title="查看日志" is-link @click="toggleLogViewer" />
      </van-cell-group>

      <!-- 日志内容 -->
      <div v-if="showLogs" class="log-box">
        <pre class="log-text">{{ logContent || '暂无日志' }}</pre>
      </div>

      <!-- 关于 -->
      <van-cell-group title="关于" inset>
        <van-cell title="应用名称" value="Dream" />
        <van-cell title="版本" :value="`v${appVersion}`" />
        <van-cell title="平台" :value="platform" />
      </van-cell-group>

      <div class="footer">Dream Mobile v{{ appVersion }} — 个人助手系统</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { updater } from '../../utils/update'
import { logger } from '../../utils/logger'

const router = useRouter()
const appVersion = __APP_VERSION__
const platform = ref('')
const wifiOnly = ref(true)
const updateStatus = ref(updater.status)
const showLogs = ref(false)
const logContent = ref('')

const navItems = [
  { icon: 'todo-list-o', label: '待办', page: '/todo' },
  { icon: 'medal-o', label: '学习计划', page: '/study' },
  { icon: 'notes-o', label: '笔记', page: '/note' },
  { icon: 'calendar-o', label: '日程', page: '/schedule' },
  { icon: 'bell', label: '提醒中心', page: '/reminder' },
  { icon: 'lock', label: '账号管理', page: '/account' },
  { icon: 'star-o', label: '收藏', page: '/favorite' },
]

const WIFI_ONLY_KEY = 'dream:wifiOnly'

onMounted(() => {
  wifiOnly.value = localStorage.getItem(WIFI_ONLY_KEY) !== 'false'
  platform.value = navigator.userAgent.includes('Android') ? 'Android WebView' : 'Web'
  updater.onStatus((s) => { updateStatus.value = s })
})

function goPage(page: string) { router.push(page) }

function onWifiOnlyChange(val: boolean) {
  localStorage.setItem(WIFI_ONLY_KEY, String(val))
}

async function checkUpdate() {
  const info = await updater.check(true)
  if (!info && !updater.status.hasUpdate) showToast('已是最新版本')
}

async function doUpdate() {
  if (!updateStatus.value.info) return
  await updater.downloadAndInstall(updateStatus.value.info)
}

async function toggleLogViewer() {
  showLogs.value = !showLogs.value
  if (showLogs.value) {
    try {
      const files = await logger.getFiles()
      if (files.length > 0) {
        const content = await logger.readFile(files[0])
        logContent.value = content.split('\n').slice(-50).join('\n')
      }
    } catch { logContent.value = '读取日志失败' }
  }
}
</script>

<style lang="scss" scoped>
.settings-page { display: flex; flex-direction: column; height: 100%; background: $color-bg; }
.scroll-wrap { flex: 1; overflow-y: auto; padding-bottom: calc(50px + env(safe-area-inset-bottom) + 16px); }

.update-info { display: flex; flex-direction: column; gap: 4px; }
.update-version { font-size: $font-md; font-weight: $font-bold; color: $color-primary; margin: 0; }
.update-log { font-size: $font-sm; color: $color-text-secondary; margin: 0 0 8px; }

.log-box { margin: 0 12px; padding: 12px; background: #1c1c1e; border-radius: $radius-md; max-height: 300px; overflow: auto; }
.log-text { font-size: 11px; color: #a8ff78; font-family: monospace; white-space: pre-wrap; margin: 0; }

.footer { text-align: center; padding: 24px 12px; font-size: $font-xs; color: $color-text-tertiary; }
</style>
