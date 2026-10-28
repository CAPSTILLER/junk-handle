/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        wally: resolve(__dirname, 'wally.html'),
        owner: resolve(__dirname, 'owner.html'),
        rocks: resolve(__dirname, 'rocks.html'),
        backup: resolve(__dirname, 'backup.html'),
        gear: resolve(__dirname, 'gear.html'),
        desk: resolve(__dirname, 'desk.html'),
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
