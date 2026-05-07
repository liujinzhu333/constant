/**
 * Dream Mobile — 防抖工具
 * 复用 PC 端 dream/src/composables/useDebounce.ts
 */

import { ref, onUnmounted } from 'vue'

export function useDebounce<T extends (...args: any[]) => any>(fn: T, delay = 300) {
  let timer: ReturnType<typeof setTimeout> | null = null
  const pending = ref(false)

  const trigger = (...args: Parameters<T>) => {
    pending.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn(...args)
      pending.value = false
      timer = null
    }, delay)
  }

  const flush = (...args: Parameters<T>) => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    fn(...args)
    pending.value = false
  }

  const cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    pending.value = false
  }

  onUnmounted(cancel)

  return { trigger, flush, cancel, pending }
}
