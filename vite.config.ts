import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
    manifest: {
      name: 'High Timeline', short_name: 'Timeline', description: 'A private, self-reported session timeline journal.',
      theme_color: '#141814', background_color: '#141814', display: 'standalone', start_url: '/', scope: '/', orientation: 'portrait-primary',
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: { navigateFallback: '/index.html', globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'] },
  })],
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], css: true, include: ['src/**/*.test.{ts,tsx}'], exclude: ['**/._*'] },
})
