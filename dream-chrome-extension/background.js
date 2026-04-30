/**
 * Dream 收藏插件 — Service Worker
 * 点击插件图标时，获取当前标签页信息并发送给 Dream 本地 HTTP 服务
 */

const DREAM_API = 'http://localhost:45678/favorite'

chrome.action.onClicked.addListener(async (tab) => {
  const url = tab.url || ''
  const title = tab.title || ''

  // 过滤掉不可收藏的页面（新标签页、浏览器内部页等）
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
    showBadge('✗', '#e74c3c', tab.id)
    return
  }

  try {
    const res = await fetch(DREAM_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'link', title, url })
    })

    if (res.ok) {
      // 成功：图标短暂显示绿色勾
      showBadge('✓', '#27ae60', tab.id)
    } else {
      const err = await res.json().catch(() => ({}))
      console.error('[Dream] 收藏失败:', err)
      showBadge('✗', '#e74c3c', tab.id)
    }
  } catch (e) {
    // Dream 未运行或端口不通
    console.error('[Dream] 无法连接 Dream 应用:', e)
    showBadge('!', '#e67e22', tab.id)
  }
})

/**
 * 在插件图标上显示临时 badge 提示
 * @param {string} text 文字
 * @param {string} color 背景色
 * @param {number|undefined} tabId
 */
function showBadge(text, color, tabId) {
  chrome.action.setBadgeText({ text, tabId })
  chrome.action.setBadgeBackgroundColor({ color, tabId })
  // 1.5 秒后清除
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '', tabId })
  }, 1500)
}
