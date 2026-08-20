import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const projectRoot = path.resolve(__dirname, '..')

export default defineConfig({
  plugins: [react()],
  root: path.resolve(projectRoot, 'src/renderer'),
  base: './',
  publicDir: path.resolve(projectRoot, 'src/renderer/public'),
  build: {
    outDir: path.resolve(projectRoot, 'dist/renderer'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(projectRoot, 'src'),
      '@shared': path.resolve(projectRoot, 'src/shared'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.NEOWORKER_DEV_SERVER_PORT || 5173),
    strictPort: true,
  },
})
