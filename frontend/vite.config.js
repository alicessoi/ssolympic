import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 部署：仓库路径 https://<user>.github.io/<repo>/
// base 用相对路径 './' 适配任意子路径（开发时是 /，部署时是 /ssoi-mgmt/）
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
