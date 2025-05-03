import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: resolve(__dirname),
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@shiguredo/rnnoise-wasm': resolve(__dirname, '../dist/rnnoise.js'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
      },
    },
  },
  optimizeDeps: {
    exclude: ['@shiguredo/rnnoise-wasm'],
  },
  envDir: resolve(__dirname, '..'),
})
