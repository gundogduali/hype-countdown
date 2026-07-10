import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Override with API_PROXY_TARGET to point at a non-default backend (e.g. e2e runs)
      '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:3001',
    },
  },
})
