import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const isCapacitor = process.env.CAPACITOR_BUILD === 'true'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    ...(!isCapacitor ? [VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        sourcemap: false,
      },
      includeAssets: ['apple-touch-icon.webp', 'icon.webp'],
      manifest: {
        name: 'としゆきノート',
        short_name: 'としゆきNote',
        description: '100ページのシンプルなノートアプリ',
        theme_color: '#1e1e1e',
        background_color: '#121212',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.webp',
            sizes: '192x192',
            type: 'image/webp'
          },
          {
            src: 'pwa-512x512.webp',
            sizes: '512x512',
            type: 'image/webp'
          },
          {
            src: 'pwa-512x512.webp',
            sizes: '512x512',
            type: 'image/webp',
            purpose: 'any maskable'
          }
        ]
      }
    })] : []),
  ],
})
