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
    // 开发时代理到 dream 开发实例（端口 45679），与生产实例（45678）隔离
    proxy: {
      '/api': {
        target: 'http://localhost:45679',
        changeOrigin: true,
        // 后端不可达时返回 503，确保 axios interceptor 能识别为离线
        configure(proxy) {
          proxy.on('error', (_err, _req, res) => {
            if ('writeHead' in res && typeof res.writeHead === 'function') {
              res.writeHead(503, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Service unavailable' }))
            }
          })
        },
      },
      '/ping': {
        target: 'http://localhost:45679',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('error', (_err, _req, res) => {
            if ('writeHead' in res && typeof res.writeHead === 'function') {
              res.writeHead(503, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Service unavailable' }))
            }
          })
        },
      },
      '/qrcode': {
        target: 'http://localhost:45679',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('error', (_err, _req, res) => {
            if ('writeHead' in res && typeof res.writeHead === 'function') {
              res.writeHead(503, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Service unavailable' }))
            }
          })
        },
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
