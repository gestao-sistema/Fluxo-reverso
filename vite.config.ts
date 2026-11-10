import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const demoProductionStub = fileURLToPath(new URL('./src/build/demo-disabled.ts', import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  resolve: {
    // Demo files stay available in development, but are replaced before production bundling.
    alias: command === 'build'
      ? [{ find: /^.*demo\/[^/]+$/, replacement: demoProductionStub }]
      : [],
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
}))