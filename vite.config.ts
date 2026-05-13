import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      external: [
        'node-llama-cpp',
        '@node-llama-cpp/mac-arm64-metal',
        '@node-llama-cpp/linux-x64-cuda',
        '@node-llama-cpp/linux-x64-vulkan',
        '@node-llama-cpp/linux-arm64-cpu',
        '@node-llama-cpp/win-x64-cpu',
        '@node-llama-cpp/win-x64-cuda',
        '@node-llama-cpp/win-arm64-cpu',
      ],
    },
  },
  server: {
    port: 5076,
  },
})
