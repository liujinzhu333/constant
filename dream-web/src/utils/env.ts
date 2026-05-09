/**
 * 运行环境判断工具
 *
 * - isElectron：当前页面运行在 Electron 窗口内（window.dreamAPI 由 preload 注入）
 * - isWeb：纯浏览器环境（手机/PC 浏览器通过局域网访问）
 * - isMac：macOS 平台（含 Electron macOS 和 Safari macOS）
 */

export const isElectron = typeof window !== 'undefined' && !!window.dreamAPI

export const isWeb = !isElectron

export const isMac = typeof navigator !== 'undefined' &&
  navigator.platform.toLowerCase().includes('mac')
