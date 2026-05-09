import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5174,
    host: '0.0.0.0',
    // 开发时代理 /api 请求到 PC 端 HTTP Server
    proxy: {
      '/api': {
        target: 'http://localhost:45678',
        changeOrigin: true,
      },
      '/ping': {
        target: 'http://localhost:45678',
        changeOrigin: true,
      },
      '/qrcode': {
        target: 'http://localhost:45678',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
