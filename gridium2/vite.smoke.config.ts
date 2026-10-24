import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
export default defineConfig({ root: 'tests/renderer-smoke', base: './', plugins: [preact()], build: { target: 'esnext', outDir: '../../out/renderer-smoke', emptyOutDir: true } })
