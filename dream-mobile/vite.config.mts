import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import legacy from '@vitejs/plugin-legacy'
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from 'unplugin-vue-components/resolvers'
import path from 'path'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'))

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    Components({
      resolvers: [VantResolver()],
    }),
    // 生成 nomodule IIFE 兼容包，解决 WebView file:// 协议下 type=module CORS 问题
    legacy({
      targets: ['android >= 9'],
      // 同时保留现代包，WebView 支持 module 时优先用现代包
      renderLegacyChunks: true,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  define: {
    // 注入版本号，对标 PC 端 app.getVersion()
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  css: {
    preprocessorOptions: {
      scss: {
        // 全局注入设计 Token（无需在每个组件中手动 import）
        additionalData: `@import "${path.resolve(__dirname, 'src/styles/variables.scss')}";`,
      },
    },
  },
  // file:// 协议下必须用相对路径，否则绝对路径 /assets/... 加载失败空白
  base: './',
  build: {
    // 构建产物直接打包成单目录，供基座打包
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  server: {
    // H5 开发调试端口
    port: 5173,
    host: '0.0.0.0',
  },
})
