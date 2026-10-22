import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    server: {
      port: 5173,
      // when mocks are off, /api goes to the real backend (see .env.example)
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET || 'https://localhost:7001',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
