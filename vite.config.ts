import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import topLevelAwait from 'vite-plugin-top-level-await'
import wasm from 'vite-plugin-wasm'
import pkg from './package.json'

const banner = `/**
 * ${pkg.name}
 * ${pkg.description}
 * @version: ${pkg.version}
 * @author: ${pkg.author}
 * @license: ${pkg.license}
 **/
`

export default defineConfig({
  define: {
    __RNNOISE_VERSION__: JSON.stringify(pkg.version),
  },
  root: process.cwd(),
  build: {
    assetsInlineLimit: 0,
    // minify: 'esbuild',
    target: 'esnext',
    emptyOutDir: true,
    manifest: true,
    outDir: resolve(__dirname, './dist'),
    lib: {
      entry: resolve(__dirname, 'src/rnnoise.ts'),
      name: 'RNNoise',
      formats: ['es'],
      fileName: 'rnnoise',
    },
    rollupOptions: {
      output: {
        banner: banner,
      },
    },
  },
  envDir: resolve(__dirname, './'),
  plugins: [
    dts({
      include: ['src/**/*'],
    }),
    wasm(),
    topLevelAwait(),
  ],
})
