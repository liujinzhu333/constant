<template>
  <van-popup
    :show="visible"
    position="bottom"
    round
    :close-on-click-overlay="maskClose !== false"
    :safe-area-inset-bottom="true"
    @close="emit('close')"
    @click-overlay="emit('close')"
  >
    <slot />
  </van-popup>
</template>

<script setup lang="ts">
defineProps<{ visible: boolean; maskClose?: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()
</script>
