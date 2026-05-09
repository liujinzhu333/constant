/**
 * 防抖 / 节流工具
 */

/**
 * 创建一个防抖函数
 * @param fn 原函数
 * @param delay 延迟毫秒
 */
export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { fn(...args) }, delay)
  }
}

/**
 * 在 Vue 组件中使用的防抖 ref 输入处理
 * 返回一个 handler，每次调用都会重置计时
 */
export function useDebouncedCall(fn: () => void, delay = 400) {
  let timer: ReturnType<typeof setTimeout> | null = null
  function trigger() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(fn, delay)
  }
  function flush() {
    if (timer) { clearTimeout(timer); timer = null; fn() }
  }
  function cancel() {
    if (timer) { clearTimeout(timer); timer = null }
  }
  return { trigger, flush, cancel }
}
