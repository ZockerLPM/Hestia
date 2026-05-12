import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
      includeAssets: ['favicon.ico', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Hestia — Haushaltsverwaltung',
        short_name: 'Hestia',
        description: 'Finanzen, Einkauf, Vorräte, Aufgaben & Kalender für den Haushalt',
        theme_color: '#6366f1',
        background_color: '#f9fafb',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'de',
        categories: ['productivity', 'lifestyle'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Einkaufsliste', url: '/shopping', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Aufgaben', url: '/tasks', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Vorräte', url: '/pantry', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallbackDenylist: [/^\/api/, /^\/socket\.io/],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/.*$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'hestia-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/world\.openfoodfacts\.org\/.*$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'openfoodfacts',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'query': ['@tanstack/react-query'],
          'charts': ['recharts'],
          'utils': ['date-fns', 'zustand', 'axios'],
          'icons': ['lucide-react'],
          'scanner': ['@zxing/browser', '@zxing/library'],
          'ocr': ['tesseract.js'],
        },
      },
    },
  },
});
