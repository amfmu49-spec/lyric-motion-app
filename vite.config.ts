import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/lyric-motion-app/',
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `assets/app-v240-[hash].js`,
        chunkFileNames: `assets/chunk-v240-[hash].js`,
        assetFileNames: `assets/asset-v240-[hash].[ext]`
      }
    }
  }
})
