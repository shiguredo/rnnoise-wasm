import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  root: resolve(__dirname),
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@shiguredo/rnnoise-wasm': resolve(__dirname, '../dist/rnnoise.mjs'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
      },
    },
  },
  envDir: resolve(__dirname, '..'),
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: ['../dist/*.wasm'],
          dest: 'dist',
        },
      ],
    }),
  ],
})
