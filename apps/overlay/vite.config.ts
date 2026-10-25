import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Config Vite : plugin React + Tailwind v4 (pas de tailwind.config.js nécessaire).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // En dev, les appels /spotify/... sont redirigés vers l'API locale :
    // pas de souci de CORS et pas besoin de configurer VITE_API_URL.
    proxy: {
      '/spotify': 'http://127.0.0.1:8000',
    },
  },
})
